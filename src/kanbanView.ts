import type { BasesEntry, BasesPropertyId, QueryController, ViewOption } from 'obsidian';
import { BasesView, parsePropertyId } from 'obsidian';
import Sortable from 'sortablejs';
import {
	COLOR_PALETTE,
	CSS_CLASSES,
	DATA_ATTRIBUTES,
	DEBOUNCE_DELAY,
	EMPTY_STATE_MESSAGES,
	SORTABLE_CONFIG,
	SORTABLE_GROUP,
	UNCATEGORIZED_LABEL,
} from './constants.ts';
import type { DebouncedFn } from './utils/debounce.ts';
import { debounce } from './utils/debounce.ts';
import { ensureGroupExists, normalizePropertyValue } from './utils/grouping.ts';

interface KanbanPlugin {
	getColumnOrder(propertyId: BasesPropertyId): string[] | null;
	saveColumnOrder(propertyId: BasesPropertyId, order: string[]): Promise<void>;
	getColumnColor(propertyId: BasesPropertyId, columnValue: string): string | null;
	saveColumnColor(propertyId: BasesPropertyId, columnValue: string, colorName: string | null): Promise<void>;
}

export class KanbanView extends BasesView {
	type = 'kanban-view';

	scrollEl: HTMLElement;
	containerEl: HTMLElement;
	private plugin: KanbanPlugin;
	private groupByPropertyId: BasesPropertyId | null = null;
	private _renderedGroupByPropertyId: BasesPropertyId | null = null;
	private _columnSortables: Map<string, Sortable> = new Map();
	private _entryMap: Map<string, BasesEntry> = new Map();
	private columnSortable: Sortable | null = null;
	private _debouncedRender: DebouncedFn<() => void>;
	private activeColorPicker: HTMLElement | null = null;

	constructor(controller: QueryController, scrollEl: HTMLElement, plugin: KanbanPlugin) {
		super(controller);
		this.scrollEl = scrollEl;
		this.containerEl = scrollEl.createDiv({ cls: CSS_CLASSES.VIEW_CONTAINER });
		this.plugin = plugin;
		this._debouncedRender = debounce(() => {
			try {
				this.loadConfig();
				this.render();
			} catch (error) {
				console.error('KanbanView error:', error);
			}
		}, DEBOUNCE_DELAY);
	}

	onDataUpdated(): void {
		this._debouncedRender();
	}

	private loadConfig(): void {
		// Load group by property from config
		this.groupByPropertyId = this.config.getAsPropertyId('groupByProperty');
	}

	private render(): void {
		try {
			// Get all entries from the data
			const entries = this.data?.data || [];
			if (!entries || entries.length === 0) {
				this.fullReset();
				this.containerEl.createDiv({
					text: EMPTY_STATE_MESSAGES.NO_ENTRIES,
					cls: CSS_CLASSES.EMPTY_STATE,
				});
				return;
			}

			// Get available properties from entries
			const availablePropertyIds = this.allProperties || [];

			// Validate group by property
			if (!this.groupByPropertyId || !availablePropertyIds.includes(this.groupByPropertyId)) {
				if (availablePropertyIds.length > 0) {
					this.groupByPropertyId = availablePropertyIds[0];
				} else {
					this.fullReset();
					this.containerEl.createDiv({
						text: EMPTY_STATE_MESSAGES.NO_PROPERTIES,
						cls: CSS_CLASSES.EMPTY_STATE,
					});
					return;
				}
			}

			// Build path→entry lookup map for O(1) access in handleCardDrop
			this._entryMap = new Map(entries.map((e: BasesEntry) => [e.file.path, e]));

			// Group entries by group by property value
			const groupedEntries = this.groupEntriesByProperty(entries, this.groupByPropertyId);
			const propertyValues = Array.from(groupedEntries.keys());
			const orderedValues = this.getOrderedColumnValues(propertyValues);

			const existingBoard = this.containerEl.querySelector(`.${CSS_CLASSES.BOARD}`);
			if (
				!existingBoard ||
				!(existingBoard instanceof HTMLElement) ||
				this._renderedGroupByPropertyId !== this.groupByPropertyId
			) {
				this.fullRebuild(orderedValues, groupedEntries);
			} else {
				this.patchBoard(existingBoard, orderedValues, groupedEntries);
			}
			this._renderedGroupByPropertyId = this.groupByPropertyId;
		} catch (error) {
			console.error('KanbanView error:', error);
		}
	}

	private fullReset(): void {
		this.containerEl.empty();
		this._columnSortables.forEach((s) => s.destroy());
		this._columnSortables.clear();
		this._entryMap.clear();
		if (this.columnSortable) {
			this.columnSortable.destroy();
			this.columnSortable = null;
		}
		this._renderedGroupByPropertyId = null;
	}

	private fullRebuild(orderedValues: string[], groupedEntries: Map<string, BasesEntry[]>): void {
		this.containerEl.empty();
		this._columnSortables.forEach((s) => s.destroy());
		this._columnSortables.clear();
		if (this.columnSortable) {
			this.columnSortable.destroy();
			this.columnSortable = null;
		}

		const boardEl = this.containerEl.createDiv({ cls: CSS_CLASSES.BOARD });
		orderedValues.forEach((value) => {
			const columnEl = this.createColumn(value, groupedEntries.get(value) || []);
			boardEl.appendChild(columnEl);
		});

		this.initializeSortable();
		this.initializeColumnSortable();
	}

	private patchBoard(boardEl: HTMLElement, orderedValues: string[], groupedEntries: Map<string, BasesEntry[]>): void {
		// Index existing column elements by their value
		const existingColumns = new Map<string, HTMLElement>();
		boardEl.querySelectorAll(`.${CSS_CLASSES.COLUMN}`).forEach((col) => {
			if (col instanceof HTMLElement) {
				const val = col.getAttribute(DATA_ATTRIBUTES.COLUMN_VALUE);
				if (val !== null) existingColumns.set(val, col);
			}
		});

		const newValueSet = new Set(orderedValues);

		// Remove columns that no longer exist in data
		existingColumns.forEach((colEl, value) => {
			if (!newValueSet.has(value)) {
				const sortable = this._columnSortables.get(value);
				if (sortable) {
					sortable.destroy();
					this._columnSortables.delete(value);
				}
				colEl.remove();
				existingColumns.delete(value);
			}
		});

		// Add new columns; patch cards in existing columns
		orderedValues.forEach((value) => {
			const newEntries = groupedEntries.get(value) || [];
			if (!existingColumns.has(value)) {
				const columnEl = this.createColumn(value, newEntries);
				boardEl.appendChild(columnEl);
				existingColumns.set(value, columnEl);
				// Attach Sortable to the new column body
				const body = columnEl.querySelector(`.${CSS_CLASSES.COLUMN_BODY}[${DATA_ATTRIBUTES.SORTABLE_CONTAINER}]`);
				if (body instanceof HTMLElement) {
					const sortable = new Sortable(body, {
						group: SORTABLE_GROUP,
						animation: SORTABLE_CONFIG.ANIMATION_DURATION,
						dragClass: CSS_CLASSES.CARD_DRAGGING,
						ghostClass: CSS_CLASSES.CARD_GHOST,
						chosenClass: CSS_CLASSES.CARD_CHOSEN,
						onEnd: (evt: Sortable.SortableEvent) => {
							void this.handleCardDrop(evt);
						},
					});
					this._columnSortables.set(value, sortable);
				}
			} else {
				const colEl = existingColumns.get(value);
				if (colEl) this.patchColumnCards(colEl, newEntries);
			}
		});

		// Re-order columns in the DOM to match orderedValues
		// appendChild on an already-attached child moves it — no cloning needed
		orderedValues.forEach((value) => {
			const colEl = existingColumns.get(value);
			if (colEl) boardEl.appendChild(colEl);
		});
	}

	private patchColumnCards(columnEl: HTMLElement, newEntries: BasesEntry[]): void {
		const body = columnEl.querySelector<HTMLElement>(`.${CSS_CLASSES.COLUMN_BODY}`);
		if (!body) return;

		// Update column count
		const countEl = columnEl.querySelector(`.${CSS_CLASSES.COLUMN_COUNT}`);
		if (countEl) countEl.textContent = `(${newEntries.length})`;

		// Remove cards whose entry is no longer in this column
		const newPaths = new Set(newEntries.map((e) => e.file.path));
		body.querySelectorAll(`.${CSS_CLASSES.CARD}`).forEach((card) => {
			if (card instanceof HTMLElement) {
				const path = card.getAttribute(DATA_ATTRIBUTES.ENTRY_PATH);
				if (path && !newPaths.has(path)) card.remove();
			}
		});

		// Add cards for entries not yet in the DOM
		const existingPaths = new Set<string>();
		body.querySelectorAll(`.${CSS_CLASSES.CARD}`).forEach((card) => {
			if (card instanceof HTMLElement) {
				const path = card.getAttribute(DATA_ATTRIBUTES.ENTRY_PATH);
				if (path) existingPaths.add(path);
			}
		});
		newEntries.forEach((entry) => {
			if (!existingPaths.has(entry.file.path)) {
				body.appendChild(this.createCard(entry));
			}
		});
	}

	private groupEntriesByProperty(entries: BasesEntry[], propertyId: BasesPropertyId): Map<string, BasesEntry[]> {
		const grouped = new Map<string, BasesEntry[]>();

		entries.forEach((entry) => {
			try {
				const propValue = entry.getValue(propertyId);
				const value = normalizePropertyValue(propValue);
				const group = ensureGroupExists(grouped, value);
				group.push(entry);
			} catch (error) {
				console.warn('Error processing entry:', entry.file.path, error);
				// Add to Uncategorized on error
				const uncategorizedGroup = ensureGroupExists(grouped, UNCATEGORIZED_LABEL);
				uncategorizedGroup.push(entry);
			}
		});

		return grouped;
	}

	private createColumn(value: string, entries: BasesEntry[]): HTMLElement {
		const columnEl = document.createElement('div');
		columnEl.className = CSS_CLASSES.COLUMN;
		columnEl.setAttribute(DATA_ATTRIBUTES.COLUMN_VALUE, value);

		// Apply stored color accent
		if (this.groupByPropertyId) {
			const colorName = this.plugin.getColumnColor(this.groupByPropertyId, value);
			this.applyColumnColor(columnEl, colorName);
		}

		// Column header
		const headerEl = columnEl.createDiv({ cls: CSS_CLASSES.COLUMN_HEADER });

		// Add drag handle
		const dragHandle = headerEl.createDiv({ cls: CSS_CLASSES.COLUMN_DRAG_HANDLE });
		dragHandle.textContent = '⋮⋮';

		// Color picker button
		const colorBtn = headerEl.createDiv({ cls: CSS_CLASSES.COLUMN_COLOR_BTN });
		colorBtn.setAttribute('aria-label', `Set color for column: ${value}`);
		colorBtn.setAttribute('role', 'button');
		colorBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.openColorPicker(colorBtn, columnEl, value);
		});

		headerEl.createSpan({ text: value, cls: CSS_CLASSES.COLUMN_TITLE });
		headerEl.createSpan({ text: `(${entries.length})`, cls: CSS_CLASSES.COLUMN_COUNT });

		// Column body (cards container)
		const bodyEl = columnEl.createDiv({ cls: CSS_CLASSES.COLUMN_BODY });
		bodyEl.setAttribute(DATA_ATTRIBUTES.SORTABLE_CONTAINER, 'true');

		// Create cards for each entry
		entries.forEach((entry) => {
			const cardEl = this.createCard(entry);
			bodyEl.appendChild(cardEl);
		});

		return columnEl;
	}

	private createCard(entry: BasesEntry): HTMLElement {
		const cardEl = document.createElement('div');
		cardEl.className = CSS_CLASSES.CARD;
		const filePath = entry.file.path;
		cardEl.setAttribute(DATA_ATTRIBUTES.ENTRY_PATH, filePath);

		// Card title - use file basename
		const titleEl = cardEl.createDiv({ cls: CSS_CLASSES.CARD_TITLE });
		titleEl.textContent = entry.file.basename;

		// Card properties
		const order = this.config?.getOrder() ?? [];
		for (const propertyId of order) {
			if (propertyId === this.groupByPropertyId) continue;
			const value = entry.getValue(propertyId);
			if (value === null) continue;
			const valueStr = value.toString().trim();
			if (!valueStr || valueStr === 'null') continue;
			const label = this.config?.getDisplayName(propertyId) ?? propertyId;
			const propertyEl = cardEl.createDiv({ cls: CSS_CLASSES.CARD_PROPERTY });
			propertyEl.createSpan({ text: label, cls: CSS_CLASSES.CARD_PROPERTY_LABEL });
			propertyEl.createSpan({ text: valueStr, cls: CSS_CLASSES.CARD_PROPERTY_VALUE });
		}

		// Make card clickable to open the note
		const clickHandler = () => {
			if (this.app?.workspace) {
				void this.app.workspace.openLinkText(filePath, '', false);
			}
		};
		cardEl.addEventListener('click', clickHandler);

		return cardEl;
	}

	private applyColumnColor(columnEl: HTMLElement, colorName: string | null): void {
		if (colorName) {
			const cssVar = COLOR_PALETTE.find((c) => c.name === colorName)?.cssVar ?? null;
			if (cssVar) {
				columnEl.style.setProperty('--obk-column-accent-color', cssVar);
				columnEl.setAttribute(DATA_ATTRIBUTES.COLUMN_COLOR, colorName);
				return;
			}
		}
		columnEl.style.removeProperty('--obk-column-accent-color');
		columnEl.removeAttribute(DATA_ATTRIBUTES.COLUMN_COLOR);
	}

	private openColorPicker(anchorEl: HTMLElement, columnEl: HTMLElement, columnValue: string): void {
		// Remove any existing popover for this view
		this.activeColorPicker?.remove();
		this.activeColorPicker = null;

		const popover = document.createElement('div');
		popover.className = CSS_CLASSES.COLUMN_COLOR_POPOVER;

		// Current color (if any)
		const currentColor = columnEl.getAttribute(DATA_ATTRIBUTES.COLUMN_COLOR);

		// "None" swatch
		const noneSwatch = document.createElement('div');
		noneSwatch.className = `${CSS_CLASSES.COLUMN_COLOR_SWATCH} ${CSS_CLASSES.COLUMN_COLOR_NONE}`;
		if (!currentColor) noneSwatch.classList.add(CSS_CLASSES.COLUMN_COLOR_SWATCH_ACTIVE);
		noneSwatch.title = 'No color';
		noneSwatch.addEventListener('click', () => {
			this.applyColumnColor(columnEl, null);
			if (this.groupByPropertyId) {
				void this.plugin.saveColumnColor(this.groupByPropertyId, columnValue, null);
			}
			popover.remove();
			this.activeColorPicker = null;
		});
		popover.appendChild(noneSwatch);

		// Color swatches
		for (const color of COLOR_PALETTE) {
			const swatch = document.createElement('div');
			swatch.className = CSS_CLASSES.COLUMN_COLOR_SWATCH;
			swatch.style.background = color.cssVar;
			swatch.title = color.name;
			if (currentColor === color.name) swatch.classList.add(CSS_CLASSES.COLUMN_COLOR_SWATCH_ACTIVE);
			swatch.addEventListener('click', () => {
				this.applyColumnColor(columnEl, color.name);
				if (this.groupByPropertyId) {
					void this.plugin.saveColumnColor(this.groupByPropertyId, columnValue, color.name);
				}
				popover.remove();
				this.activeColorPicker = null;
			});
			popover.appendChild(swatch);
		}

		// Position below anchor
		const rect = anchorEl.getBoundingClientRect();
		popover.style.top = `${rect.bottom + 4}px`;
		popover.style.left = `${rect.left}px`;
		document.body.appendChild(popover);
		this.activeColorPicker = popover;

		// Dismiss on outside click. stopPropagation() on the button prevents the
		// opening click from reaching this listener, so no setTimeout is needed.
		const dismiss = (e: MouseEvent) => {
			if (e.target instanceof Node && !popover.contains(e.target) && e.target !== anchorEl) {
				popover.remove();
				this.activeColorPicker = null;
				document.removeEventListener('click', dismiss);
			}
		};
		document.addEventListener('click', dismiss);
	}

	private initializeSortable(): void {
		const selector = `.${CSS_CLASSES.COLUMN_BODY}[${DATA_ATTRIBUTES.SORTABLE_CONTAINER}]`;
		this.containerEl.querySelectorAll(selector).forEach((columnBody) => {
			if (!(columnBody instanceof HTMLElement)) return;

			const colEl = columnBody.closest(`.${CSS_CLASSES.COLUMN}`);
			const value = colEl instanceof HTMLElement ? colEl.getAttribute(DATA_ATTRIBUTES.COLUMN_VALUE) : null;
			if (!value) return;

			const sortable = new Sortable(columnBody, {
				group: SORTABLE_GROUP,
				animation: SORTABLE_CONFIG.ANIMATION_DURATION,
				dragClass: CSS_CLASSES.CARD_DRAGGING,
				ghostClass: CSS_CLASSES.CARD_GHOST,
				chosenClass: CSS_CLASSES.CARD_CHOSEN,
				onEnd: (evt: Sortable.SortableEvent) => {
					void this.handleCardDrop(evt);
				},
			});

			this._columnSortables.set(value, sortable);
		});
	}

	private async handleCardDrop(evt: Sortable.SortableEvent): Promise<void> {
		// Type guard to ensure evt.item is an HTMLElement
		if (!(evt.item instanceof HTMLElement)) {
			console.warn('Card element is not an HTMLElement:', evt.item);
			return;
		}

		const cardEl = evt.item;
		const entryPath = cardEl.getAttribute(DATA_ATTRIBUTES.ENTRY_PATH);

		if (!entryPath) {
			console.warn('No entry path found on card');
			return;
		}

		// Get the old and new column values
		const columnSelector = `.${CSS_CLASSES.COLUMN}`;
		const oldColumnEl = evt.from.closest(columnSelector);
		const newColumnEl = evt.to.closest(columnSelector);

		if (!newColumnEl) {
			console.warn('Could not find new column element');
			return;
		}

		if (!(newColumnEl instanceof HTMLElement)) {
			console.warn('New column element is not an HTMLElement');
			return;
		}

		const oldColumnValue =
			oldColumnEl instanceof HTMLElement ? oldColumnEl.getAttribute(DATA_ATTRIBUTES.COLUMN_VALUE) : null;
		const newColumnValue = newColumnEl.getAttribute(DATA_ATTRIBUTES.COLUMN_VALUE);

		if (!newColumnValue) {
			console.warn('No column value found');
			return;
		}

		// Skip if dropped in the same column
		if (oldColumnValue === newColumnValue) {
			return;
		}

		const entry = this._entryMap.get(entryPath);
		if (!entry) {
			console.warn('Entry not found for path:', entryPath);
			return;
		}

		if (!this.groupByPropertyId) {
			console.warn('No group by property ID set');
			return;
		}

		if (!this.app?.fileManager) {
			console.warn('File manager not available');
			return;
		}

		// Update the entry's property using fileManager
		// For "Uncategorized", we'll set it to empty string or null
		try {
			const valueToSet = newColumnValue === UNCATEGORIZED_LABEL ? '' : newColumnValue;

			// Extract property name from property ID (e.g., "note.status" -> "status")
			const parsedProperty = parsePropertyId(this.groupByPropertyId);
			const propertyName = parsedProperty.name;

			await this.app.fileManager.processFrontMatter(entry.file, (frontmatter: Record<string, unknown>) => {
				if (valueToSet === '') {
					// Remove the property if setting to empty
					delete frontmatter[propertyName];
				} else {
					frontmatter[propertyName] = valueToSet;
				}
			});

			// The view will automatically update via onDataUpdated when the file changes
		} catch (error) {
			console.error('Error updating entry property:', error);
			// Revert the visual change on error
			this.render();
		}
	}

	private getOrderedColumnValues(values: string[]): string[] {
		if (!this.groupByPropertyId) return values.sort();

		const savedOrder = this.plugin.getColumnOrder(this.groupByPropertyId);
		if (!savedOrder) return values.sort();

		// Saved order is already normalized strings, use directly
		const newValues = values.filter((v) => !savedOrder.includes(v));
		return [...savedOrder.filter((v) => values.includes(v)), ...newValues];
	}

	private initializeColumnSortable(): void {
		if (this.columnSortable) {
			this.columnSortable.destroy();
		}

		const boardEl = this.containerEl.querySelector(`.${CSS_CLASSES.BOARD}`);
		if (!boardEl || !(boardEl instanceof HTMLElement)) return;

		this.columnSortable = new Sortable(boardEl, {
			animation: SORTABLE_CONFIG.ANIMATION_DURATION,
			handle: `.${CSS_CLASSES.COLUMN_DRAG_HANDLE}`,
			draggable: `.${CSS_CLASSES.COLUMN}`,
			ghostClass: CSS_CLASSES.COLUMN_GHOST,
			dragClass: CSS_CLASSES.COLUMN_DRAGGING,
			onEnd: (evt: Sortable.SortableEvent) => {
				void this.handleColumnDrop(evt);
			},
		});
	}

	private async handleColumnDrop(evt: Sortable.SortableEvent): Promise<void> {
		if (!this.groupByPropertyId) return;

		// Extract current column order from DOM
		const columns = this.containerEl.querySelectorAll(`.${CSS_CLASSES.COLUMN}`);
		const order = Array.from(columns)
			.map((col) => col.getAttribute(DATA_ATTRIBUTES.COLUMN_VALUE))
			.filter((v): v is string => v !== null);

		await this.plugin.saveColumnOrder(this.groupByPropertyId, order);
	}

	onClose(): void {
		this._debouncedRender.cancel();
		this._columnSortables.forEach((instance) => instance.destroy());
		this._columnSortables.clear();
		// Clean up any open color picker
		this.activeColorPicker?.remove();
		this.activeColorPicker = null;

		// Clean up column Sortable instance
		if (this.columnSortable) {
			this.columnSortable.destroy();
			this.columnSortable = null;
		}
	}

	static getViewOptions(this: void): ViewOption[] {
		return [
			{
				displayName: 'Group by',
				type: 'property',
				key: 'groupByProperty',
				filter: (prop: string) => !prop.startsWith('file.'),
				placeholder: 'Select property',
			},
		];
	}
}
