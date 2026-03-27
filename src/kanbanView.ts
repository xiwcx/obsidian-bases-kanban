import type { BasesEntry, BasesPropertyId, QueryController, ViewOption } from 'obsidian';
import { BasesView, Keymap, MarkdownRenderer, parsePropertyId } from 'obsidian';
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

export interface LegacyData {
	columnOrders: Record<string, string[]>;
	columnColors: Record<string, Record<string, string>>;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

export function isColumnOrders(value: unknown): value is Record<string, string[]> {
	return isRecord(value) && Object.values(value).every((v) => Array.isArray(v));
}

export function isColumnColors(value: unknown): value is Record<string, Record<string, string>> {
	return (
		isRecord(value) &&
		Object.values(value).every((v) => isRecord(v) && Object.values(v).every((c) => typeof c === 'string'))
	);
}

export function isCardOrders(value: unknown): value is Record<string, Record<string, string[]>> {
	return (
		isRecord(value) &&
		!Array.isArray(value) &&
		Object.values(value).every((v) => isRecord(v) && !Array.isArray(v) && Object.values(v).every((a) => Array.isArray(a)))
	);
}

export class KanbanView extends BasesView {
	type = 'kanban-view';

	scrollEl: HTMLElement;
	containerEl: HTMLElement;
	private legacyData: LegacyData | null;
	private groupByPropertyId: BasesPropertyId | null = null;
	private _columnSortables: Map<string, Sortable> = new Map();
	private _entryMap: Map<string, BasesEntry> = new Map();
	private columnSortable: Sortable | null = null;
	private _debouncedRender: DebouncedFn<() => void>;
	private activeColorPicker: HTMLElement | null = null;

	/**
	 * In-memory display preferences — the single source of truth during a session.
	 *
	 * Loaded from config once when groupByPropertyId changes. Renders read from
	 * here exclusively and never call config.set(). Only explicit user actions
	 * (drag-drop, column remove, color change) update _prefs and then call
	 * _persistPrefs() to write back to config.
	 *
	 * This breaks the config.set() → onDataUpdated() feedback loop that caused
	 * state thrashing on every render cycle.
	 */
	private _prefs: { columnOrder: string[]; cardOrders: Record<string, string[]>; columnColors: Record<string, string> } =
		{
			columnOrder: [],
			cardOrders: {},
			columnColors: {}, // columnValue → colorName
		};
	private _prefsPropertyId: BasesPropertyId | null = null;

	/**
	 * True while a card or column drag is in flight. When set, patchColumnCards
	 * skips DOM reordering so Sortable's live drag preview is not disturbed by
	 * re-renders triggered during the drag.
	 */
	private _dragging = false;
	private _activeCardPath: string | null = null;

	constructor(controller: QueryController, scrollEl: HTMLElement, legacyData: LegacyData | null = null) {
		super(controller);
		this.scrollEl = scrollEl;
		this.containerEl = scrollEl.createDiv({ cls: CSS_CLASSES.VIEW_CONTAINER });
		this.legacyData = legacyData;

		// Delegated handler for internal links rendered inside property values.
		// Obsidian's global click handler only covers MarkdownView/TextFileView
		// containers; BasesView does not inherit that, so we wire it up explicitly.
		this.containerEl.on('click', 'a.internal-link', (evt, linkEl) => {
			evt.preventDefault();
			const href = linkEl.getAttribute('data-href') || linkEl.getAttribute('href');
			if (href && this.app) {
				const cardEl = linkEl.closest(`[${DATA_ATTRIBUTES.ENTRY_PATH}]`);
				const sourcePath = cardEl instanceof HTMLElement ? (cardEl.getAttribute(DATA_ATTRIBUTES.ENTRY_PATH) ?? '') : '';
				void this.app.workspace.openLinkText(href, sourcePath, Keymap.isModEvent(evt));
			}
		});

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
		this.groupByPropertyId = this.config.getAsPropertyId('groupByProperty');
	}

	/**
	 * Load display preferences from config for the given propertyId.
	 * Called once when groupByPropertyId changes; subsequent renders reuse _prefs.
	 */
	private _loadPrefs(propertyId: BasesPropertyId): void {
		this._prefsPropertyId = propertyId;

		// Column order — with legacy migration
		const rawOrders = this.config?.get('columnOrders');
		const allOrders = isColumnOrders(rawOrders) ? rawOrders : {};
		let columnOrder = allOrders[propertyId] ?? null;
		if (!columnOrder) {
			const legacyOrder = this.legacyData?.columnOrders[propertyId] ?? null;
			if (legacyOrder) {
				columnOrder = legacyOrder;
				this.config?.set('columnOrders', { ...allOrders, [propertyId]: legacyOrder });
			}
		}
		this._prefs.columnOrder = columnOrder ? [...columnOrder] : [];

		// Card orders
		const rawCardOrders = this.config?.get('cardOrders');
		const allCardOrders = isCardOrders(rawCardOrders) ? rawCardOrders : {};
		const savedCardOrders = allCardOrders[propertyId] ?? {};
		this._prefs.cardOrders = Object.fromEntries(Object.entries(savedCardOrders).map(([k, v]) => [k, [...v]]));

		// Column colors — with legacy migration
		const rawColors = this.config?.get('columnColors');
		const allColors = isColumnColors(rawColors) ? rawColors : {};
		let columnColors = allColors[propertyId] ?? null;
		if (!columnColors) {
			const legacyColors = this.legacyData?.columnColors[propertyId];
			if (legacyColors && Object.keys(legacyColors).length > 0) {
				columnColors = legacyColors;
				this.config?.set('columnColors', { ...allColors, [propertyId]: legacyColors });
			}
		}
		this._prefs.columnColors = columnColors ? { ...columnColors } : {};
	}

	/**
	 * Write _prefs back to config. Called only on user actions (drag-drop,
	 * column remove, color change) — never during renders.
	 *
	 * Change guards skip config.set() when the value hasn't changed, preventing
	 * spurious onDataUpdated() triggers.
	 */
	private _persistConfigKey<T>(key: string, guard: (v: unknown) => v is Record<string, T>, newValue: T): void {
		if (!this._prefsPropertyId) return;
		const raw = this.config?.get(key);
		const all: Record<string, T> = guard(raw) ? raw : {};
		if (JSON.stringify(all[this._prefsPropertyId]) !== JSON.stringify(newValue)) {
			this.config?.set(key, { ...all, [this._prefsPropertyId]: newValue });
		}
	}

	private _persistPrefs(): void {
		this._persistConfigKey('columnOrders', isColumnOrders, this._prefs.columnOrder);
		this._persistConfigKey('cardOrders', isCardOrders, this._prefs.cardOrders);
		this._persistConfigKey('columnColors', isColumnColors, this._prefs.columnColors);
	}

	private render(): void {
		try {
			const entries = this.data?.data || [];
			if (!entries || entries.length === 0) {
				this.fullReset();
				this.containerEl.createDiv({
					text: EMPTY_STATE_MESSAGES.NO_ENTRIES,
					cls: CSS_CLASSES.EMPTY_STATE,
				});
				return;
			}

			const availablePropertyIds = this.allProperties || [];

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

			// Reload prefs when the group-by property changes
			if (this.groupByPropertyId !== this._prefsPropertyId) {
				this._loadPrefs(this.groupByPropertyId);
			}

			// Build path→entry lookup map for O(1) access in handleCardDrop
			this._entryMap = new Map(entries.map((e: BasesEntry) => [e.file.path, e]));

			// Group entries by group by property value
			const groupedEntries = this.groupEntriesByProperty(entries, this.groupByPropertyId);

			// Apply saved card order within each column
			groupedEntries.forEach((columnEntries, value) => {
				const savedOrder = this._prefs.cardOrders[value];
				if (savedOrder) {
					groupedEntries.set(value, this.applyCardOrder(columnEntries, savedOrder));
				}
			});

			// Merge any newly-seen column values into prefs and persist eagerly.
			// This is the only place render() calls _persistPrefs(), and only when
			// new columns appear — not on every render pass.
			const liveValues = Array.from(groupedEntries.keys());
			const newValues = liveValues.filter((v) => !this._prefs.columnOrder.includes(v));
			if (newValues.length > 0) {
				if (this._prefs.columnOrder.length === 0) {
					// No prior order — sort alphabetically as the initial ordering
					this._prefs.columnOrder = [...newValues].sort();
				} else {
					this._prefs.columnOrder = [...this._prefs.columnOrder, ...newValues];
				}
				this._persistPrefs();
			}

			const orderedValues = this.getOrderedColumnValues(liveValues);

			const existingBoard = this.containerEl.querySelector(`.${CSS_CLASSES.BOARD}`);
			if (!existingBoard || !(existingBoard instanceof HTMLElement) || this._prefsPropertyId !== this.groupByPropertyId) {
				this.fullRebuild(orderedValues, groupedEntries);
			} else {
				this.patchBoard(existingBoard, orderedValues, groupedEntries);
			}
			this.reapplyActiveCard();
		} catch (error) {
			console.error('KanbanView error:', error);
		}
	}

	private destroySortables(): void {
		this._columnSortables.forEach((s) => s.destroy());
		this._columnSortables.clear();
		if (this.columnSortable) {
			this.columnSortable.destroy();
			this.columnSortable = null;
		}
	}

	private fullReset(): void {
		this.containerEl.empty();
		this.destroySortables();
		this._entryMap.clear();
	}

	private fullRebuild(orderedValues: string[], groupedEntries: Map<string, BasesEntry[]>): void {
		this.containerEl.empty();
		this.destroySortables();

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

		// Remove columns not in the new ordered set
		existingColumns.forEach((colEl, value) => {
			if (!newValueSet.has(value)) {
				this.detachColumn(value, colEl);
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
				const body = columnEl.querySelector(`.${CSS_CLASSES.COLUMN_BODY}[${DATA_ATTRIBUTES.SORTABLE_CONTAINER}]`);
				if (body instanceof HTMLElement) {
					this.attachCardSortable(body, value);
				}
			} else {
				const colEl = existingColumns.get(value);
				if (colEl) this.patchColumnCards(colEl, newEntries);
			}
		});

		// Re-order columns in the DOM to match orderedValues
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

		// Sync remove button: show only when column has no entries
		const headerEl = columnEl.querySelector<HTMLElement>(`.${CSS_CLASSES.COLUMN_HEADER}`);
		if (headerEl) {
			const columnValue = columnEl.getAttribute(DATA_ATTRIBUTES.COLUMN_VALUE);
			const existingRemoveBtn = headerEl.querySelector(`.${CSS_CLASSES.COLUMN_REMOVE_BTN}`);
			if (newEntries.length === 0 && !existingRemoveBtn && columnValue) {
				headerEl.appendChild(this.createRemoveButton(columnValue, columnEl));
			} else if (newEntries.length > 0 && existingRemoveBtn) {
				existingRemoveBtn.remove();
			}
		}

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

		// Reorder cards in the DOM to match newEntries order.
		// Skipped during active drags — Sortable owns the DOM during a drag and
		// reordering here would fight its live preview, causing visual thrashing.
		if (!this._dragging) {
			const pathToCard = new Map<string, Element>();
			body.querySelectorAll(`.${CSS_CLASSES.CARD}`).forEach((card) => {
				const path = card instanceof HTMLElement ? card.getAttribute(DATA_ATTRIBUTES.ENTRY_PATH) : null;
				if (path) pathToCard.set(path, card);
			});
			newEntries.forEach((entry) => {
				const card = pathToCard.get(entry.file.path);
				if (card) body.appendChild(card);
			});
		}
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

		// Apply stored color accent from prefs
		const colorName = this._prefs.columnColors[value] ?? null;
		this.applyColumnColor(columnEl, colorName);

		// Column header
		const headerEl = columnEl.createDiv({ cls: CSS_CLASSES.COLUMN_HEADER });

		const dragHandle = headerEl.createDiv({ cls: CSS_CLASSES.COLUMN_DRAG_HANDLE });
		dragHandle.textContent = '⋮⋮';

		const colorBtn = headerEl.createDiv({ cls: CSS_CLASSES.COLUMN_COLOR_BTN });
		colorBtn.setAttribute('aria-label', `Set color for column: ${value}`);
		colorBtn.setAttribute('role', 'button');
		colorBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.openColorPicker(colorBtn, columnEl, value);
		});

		headerEl.createSpan({ text: value, cls: CSS_CLASSES.COLUMN_TITLE });
		headerEl.createSpan({ text: `(${entries.length})`, cls: CSS_CLASSES.COLUMN_COUNT });

		// Remove button — only shown when the column has no entries
		if (entries.length === 0) {
			headerEl.appendChild(this.createRemoveButton(value, columnEl));
		}

		// Column body (cards container)
		const bodyEl = columnEl.createDiv({ cls: CSS_CLASSES.COLUMN_BODY });
		bodyEl.setAttribute(DATA_ATTRIBUTES.SORTABLE_CONTAINER, 'true');

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

		const titleEl = cardEl.createDiv({ cls: CSS_CLASSES.CARD_TITLE });
		titleEl.textContent = entry.file.basename;

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
			const valueEl = propertyEl.createSpan({ cls: CSS_CLASSES.CARD_PROPERTY_VALUE });
			if (this.app && valueStr.includes('[[')) {
				void MarkdownRenderer.render(this.app, valueStr, valueEl, filePath, this);
			} else {
				valueEl.textContent = valueStr;
			}
		}

		// JS-managed hover: mouseenter/mouseleave instead of CSS :hover so the
		// class is never applied when an element slides under a stationary cursor
		// after a drag reorders the DOM.
		cardEl.addEventListener('mouseenter', () => cardEl.classList.add(CSS_CLASSES.CARD_HOVER));
		cardEl.addEventListener('mouseleave', () => cardEl.classList.remove(CSS_CLASSES.CARD_HOVER));

		const clickHandler = (e: MouseEvent) => {
			if (e.target instanceof Element && e.target.closest('a')) return;
			this.setActiveCard(filePath);
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
		this.activeColorPicker?.remove();
		this.activeColorPicker = null;

		const popover = document.createElement('div');
		popover.className = CSS_CLASSES.COLUMN_COLOR_POPOVER;

		const currentColor = columnEl.getAttribute(DATA_ATTRIBUTES.COLUMN_COLOR);

		const noneSwatch = document.createElement('div');
		noneSwatch.className = `${CSS_CLASSES.COLUMN_COLOR_SWATCH} ${CSS_CLASSES.COLUMN_COLOR_NONE}`;
		if (!currentColor) noneSwatch.classList.add(CSS_CLASSES.COLUMN_COLOR_SWATCH_ACTIVE);
		noneSwatch.title = 'No color';
		noneSwatch.addEventListener('click', () => {
			this.applyColumnColor(columnEl, null);
			delete this._prefs.columnColors[columnValue];
			this._persistPrefs();
			popover.remove();
			this.activeColorPicker = null;
		});
		popover.appendChild(noneSwatch);

		for (const color of COLOR_PALETTE) {
			const swatch = document.createElement('div');
			swatch.className = CSS_CLASSES.COLUMN_COLOR_SWATCH;
			swatch.style.background = color.cssVar;
			swatch.title = color.name;
			if (currentColor === color.name) swatch.classList.add(CSS_CLASSES.COLUMN_COLOR_SWATCH_ACTIVE);
			swatch.addEventListener('click', () => {
				this.applyColumnColor(columnEl, color.name);
				this._prefs.columnColors[columnValue] = color.name;
				this._persistPrefs();
				popover.remove();
				this.activeColorPicker = null;
			});
			popover.appendChild(swatch);
		}

		const rect = anchorEl.getBoundingClientRect();
		popover.style.top = `${rect.bottom + 4}px`;
		popover.style.left = `${rect.left}px`;
		document.body.appendChild(popover);
		this.activeColorPicker = popover;

		const dismiss = (e: MouseEvent) => {
			if (e.target instanceof Node && !popover.contains(e.target) && e.target !== anchorEl) {
				popover.remove();
				this.activeColorPicker = null;
				document.removeEventListener('click', dismiss);
			}
		};
		document.addEventListener('click', dismiss);
	}

	private createRemoveButton(value: string, columnEl: HTMLElement): HTMLElement {
		const btn = document.createElement('div');
		btn.className = CSS_CLASSES.COLUMN_REMOVE_BTN;
		btn.setAttribute('aria-label', `Remove column: ${value}`);
		btn.setAttribute('role', 'button');
		btn.textContent = '×';
		btn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.removeColumn(value, columnEl);
		});
		return btn;
	}

	private detachColumn(value: string, colEl: HTMLElement): void {
		const sortable = this._columnSortables.get(value);
		if (sortable) {
			sortable.destroy();
			this._columnSortables.delete(value);
		}
		colEl.remove();
	}

	private removeColumn(value: string, columnEl: HTMLElement): void {
		if (!this._prefsPropertyId) return;
		this._prefs.columnOrder = this._prefs.columnOrder.filter((v) => v !== value);
		this._persistPrefs();
		this.detachColumn(value, columnEl);
	}

	private attachCardSortable(body: HTMLElement, value: string): void {
		const sortable = new Sortable(body, {
			group: SORTABLE_GROUP,
			animation: SORTABLE_CONFIG.ANIMATION_DURATION,
			dragClass: CSS_CLASSES.CARD_DRAGGING,
			ghostClass: CSS_CLASSES.CARD_GHOST,
			chosenClass: CSS_CLASSES.CARD_CHOSEN,
			onStart: (evt: Sortable.SortableEvent) => {
				this._dragging = true;
				if (evt.item instanceof HTMLElement) evt.item.classList.remove(CSS_CLASSES.CARD_HOVER);
			},
			onEnd: (evt: Sortable.SortableEvent) => {
				this._dragging = false;
				this.setActiveCard(null);
				void this.handleCardDrop(evt);
			},
		});
		this._columnSortables.set(value, sortable);
	}

	private initializeSortable(): void {
		const selector = `.${CSS_CLASSES.COLUMN_BODY}[${DATA_ATTRIBUTES.SORTABLE_CONTAINER}]`;
		this.containerEl.querySelectorAll(selector).forEach((columnBody) => {
			if (!(columnBody instanceof HTMLElement)) return;
			const colEl = columnBody.closest(`.${CSS_CLASSES.COLUMN}`);
			const value = colEl instanceof HTMLElement ? colEl.getAttribute(DATA_ATTRIBUTES.COLUMN_VALUE) : null;
			if (!value) return;
			this.attachCardSortable(columnBody, value);
		});
	}

	private async handleCardDrop(evt: Sortable.SortableEvent): Promise<void> {
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

		const columnSelector = `.${CSS_CLASSES.COLUMN}`;
		const oldColumnEl = evt.from.closest(columnSelector);
		const newColumnEl = evt.to.closest(columnSelector);

		if (!newColumnEl || !(newColumnEl instanceof HTMLElement)) {
			console.warn('Could not find new column element');
			return;
		}

		const oldColumnValue =
			oldColumnEl instanceof HTMLElement ? oldColumnEl.getAttribute(DATA_ATTRIBUTES.COLUMN_VALUE) : null;
		const newColumnValue = newColumnEl.getAttribute(DATA_ATTRIBUTES.COLUMN_VALUE);

		if (!newColumnValue) {
			console.warn('No column value found');
			return;
		}

		if (!this._prefsPropertyId) {
			console.warn('No group by property ID set');
			return;
		}

		// Helper: read card paths from a column body element
		const getColumnPaths = (bodyEl: Element): string[] =>
			Array.from(bodyEl.querySelectorAll(`.${CSS_CLASSES.CARD}`))
				.map((c) => (c instanceof HTMLElement ? c.getAttribute(DATA_ATTRIBUTES.ENTRY_PATH) : null))
				.filter((p): p is string => p !== null);

		// Same-column reorder: update prefs and persist
		if (oldColumnValue === newColumnValue) {
			this._prefs.cardOrders[newColumnValue] = getColumnPaths(evt.to);
			this._persistPrefs();
			return;
		}

		// Cross-column drop: capture DOM order for both columns
		if (oldColumnEl instanceof HTMLElement && oldColumnValue) {
			const oldBody = oldColumnEl.querySelector(`.${CSS_CLASSES.COLUMN_BODY}`);
			if (oldBody) this._prefs.cardOrders[oldColumnValue] = getColumnPaths(oldBody);
		}
		this._prefs.cardOrders[newColumnValue] = getColumnPaths(evt.to);
		this._persistPrefs();

		const entry = this._entryMap.get(entryPath);
		if (!entry) {
			console.warn('Entry not found for path:', entryPath);
			return;
		}

		if (!this.app?.fileManager) {
			console.warn('File manager not available');
			return;
		}

		try {
			const valueToSet = newColumnValue === UNCATEGORIZED_LABEL ? '' : newColumnValue;
			const parsedProperty = parsePropertyId(this._prefsPropertyId);
			const propertyName = parsedProperty.name;

			await this.app.fileManager.processFrontMatter(entry.file, (frontmatter: Record<string, unknown>) => {
				if (valueToSet === '') {
					delete frontmatter[propertyName];
				} else {
					frontmatter[propertyName] = valueToSet;
				}
			});
		} catch (error) {
			console.error('Error updating entry property:', error);
			this.render();
		}
	}

	private findCardEl(path: string): HTMLElement | null {
		return (
			Array.from(this.containerEl.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.CARD}`)).find(
				(el) => el.getAttribute(DATA_ATTRIBUTES.ENTRY_PATH) === path,
			) ?? null
		);
	}

	private setActiveCard(path: string | null): void {
		if (this._activeCardPath) {
			this.findCardEl(this._activeCardPath)?.classList.remove(CSS_CLASSES.CARD_ACTIVE);
		}
		this._activeCardPath = path;
		if (path) {
			this.findCardEl(path)?.classList.add(CSS_CLASSES.CARD_ACTIVE);
		}
	}

	private reapplyActiveCard(): void {
		if (!this._activeCardPath) return;
		this.findCardEl(this._activeCardPath)?.classList.add(CSS_CLASSES.CARD_ACTIVE);
	}

	private getOrderedColumnValues(liveValues: string[]): string[] {
		if (!this._prefs.columnOrder.length) return liveValues.sort();
		// Include all saved columns (even empty ones); append any new live values.
		const newValues = liveValues.filter((v) => !this._prefs.columnOrder.includes(v));
		return [...this._prefs.columnOrder, ...newValues];
	}

	private applyCardOrder(entries: BasesEntry[], savedOrder: string[]): BasesEntry[] {
		const entryMap = new Map(entries.map((e) => [e.file.path, e]));
		const ordered = savedOrder.map((p) => entryMap.get(p)).filter((e): e is BasesEntry => e !== undefined);
		const unsaved = entries.filter((e) => !savedOrder.includes(e.file.path));
		return [...ordered, ...unsaved];
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
			onStart: () => {
				this._dragging = true;
			},
			onEnd: (evt: Sortable.SortableEvent) => {
				this._dragging = false;
				this.handleColumnDrop(evt);
			},
		});
	}

	private handleColumnDrop(evt: Sortable.SortableEvent): void {
		if (!this._prefsPropertyId) return;

		const columns = this.containerEl.querySelectorAll(`.${CSS_CLASSES.COLUMN}`);
		const order = Array.from(columns)
			.map((col) => col.getAttribute(DATA_ATTRIBUTES.COLUMN_VALUE))
			.filter((v): v is string => v !== null);

		this._prefs.columnOrder = order;
		this._persistPrefs();
	}

	onClose(): void {
		this._debouncedRender.cancel();
		this.destroySortables();
		this.activeColorPicker?.remove();
		this.activeColorPicker = null;
	}

	/**
	 * Column state (order and colors) is persisted using BasesViewConfig.set/get
	 * (https://docs.obsidian.md/Reference/TypeScript+API/BasesViewConfig#Methods)
	 * rather than Plugin.saveData/loadData
	 * (https://docs.obsidian.md/Plugins/User+interface/Settings).
	 *
	 * Why: Plugin.saveData writes a single plugin-wide plugin.data.json, so all
	 * bases shared the same column state keyed only by property ID. Using the
	 * BasesViewConfig API instead means each .base file carries its own state —
	 * deleting and re-adding the plugin no longer wipes configuration, and two bases
	 * that group by the same property can have independent column orders and colors.
	 *
	 * Migration: versions prior to 0.3.0 wrote to plugin.data.json. The
	 * legacyData parameter passed from main.ts holds that data. On the first
	 * render after upgrade, the legacy value is written into the base config via
	 * set() and subsequent renders use _prefs which is already populated — so
	 * this migration path is exercised at most once per base.
	 *
	 * plugin.data.json is intentionally left in place after migration rather than
	 * deleted: removing it would be destructive if something went wrong mid-upgrade,
	 * and the file simply becomes stale once each base has migrated its own state.
	 */

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
