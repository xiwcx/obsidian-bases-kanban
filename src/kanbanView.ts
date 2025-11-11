import { BasesView, parsePropertyId } from 'obsidian';
import type { QueryController, BasesEntry, BasesPropertyId, TFile, ViewOption } from 'obsidian';
import Sortable from 'sortablejs';
import {
	UNCATEGORIZED_LABEL,
	SORTABLE_GROUP,
	DATA_ATTRIBUTES,
	CSS_CLASSES,
	SORTABLE_CONFIG,
	ERROR_TEXT,
	EMPTY_STATE_MESSAGES,
} from './constants.ts';
import { toError, formatErrorMessage } from './utils/errorHandling.ts';
import { ensureGroupExists, normalizePropertyValue } from './utils/grouping.ts';

export class KanbanView extends BasesView {
	type = 'kanban-view';
	
	scrollEl: HTMLElement;
	containerEl: HTMLElement;
	private groupByPropertyId: BasesPropertyId | null = null;
	private sortableInstances: Sortable[] = [];
	private columnSortable: Sortable | null = null;
	private lastError: Error | null = null;

	constructor(controller: QueryController, scrollEl: HTMLElement) {
		super(controller);
		this.scrollEl = scrollEl;
		this.containerEl = scrollEl.createDiv({ cls: CSS_CLASSES.VIEW_CONTAINER });
	}

	onDataUpdated(): void {
		try {
			this.loadConfig();
			this.render();
		} catch (error) {
			this.handleError(toError(error), 'onDataUpdated');
		}
	}

	private handleError(error: Error, context: string): void {
		this.lastError = error;
		const errorMessage = formatErrorMessage(error, context);
		const errorStack = error.stack || '';
		
		// Log to console
		console.error('KanbanView Error:', errorMessage);
		console.error('Stack:', errorStack);
		console.error('Error object:', error);
		
		// Display error in the view
		this.displayError(errorMessage, errorStack);
	}

	private displayError(message: string, stack?: string): void {
		// Clear existing content
		this.containerEl.empty();
		
		const errorContainer = this.containerEl.createDiv({ cls: CSS_CLASSES.ERROR_CONTAINER });
		
		// Error icon and title
		const errorHeader = errorContainer.createDiv({ cls: CSS_CLASSES.ERROR_HEADER });
		errorHeader.createSpan({ text: ERROR_TEXT.ICON, cls: CSS_CLASSES.ERROR_ICON });
		errorHeader.createSpan({ text: ERROR_TEXT.TITLE, cls: CSS_CLASSES.ERROR_TITLE });
		
		// Error message
		const errorMessageEl = errorContainer.createDiv({ cls: CSS_CLASSES.ERROR_MESSAGE });
		errorMessageEl.textContent = message;
		
		// Stack trace (collapsible)
		if (stack) {
			const stackContainer = errorContainer.createDiv({ cls: CSS_CLASSES.ERROR_STACK_CONTAINER });
			const stackToggle = stackContainer.createDiv({ cls: CSS_CLASSES.ERROR_STACK_TOGGLE });
			stackToggle.textContent = ERROR_TEXT.SHOW_STACK;
			
			const stackContent = stackContainer.createDiv({ cls: CSS_CLASSES.ERROR_STACK });
			stackContent.textContent = stack;
			// Set initial hidden state (CSS also sets this, but inline style needed for test compatibility)
			stackContent.style.display = 'none';
			
			const toggleHandler = () => {
				const isVisible = stackContent.classList.contains('is-visible');
				if (isVisible) {
					stackContent.classList.remove('is-visible');
					stackContent.style.display = 'none';
					stackToggle.textContent = ERROR_TEXT.SHOW_STACK;
				} else {
					stackContent.classList.add('is-visible');
					stackContent.style.display = 'block';
					stackToggle.textContent = ERROR_TEXT.HIDE_STACK;
				}
			};
			stackToggle.addEventListener('click', toggleHandler);
		}
		
		// Retry button
		const retryButton = errorContainer.createEl('button', { cls: CSS_CLASSES.ERROR_RETRY });
		retryButton.textContent = ERROR_TEXT.RETRY;
		const retryHandler = () => {
			this.lastError = null;
			try {
				this.onDataUpdated();
			} catch (retryError) {
				this.handleError(toError(retryError), 'Retry');
			}
		};
		retryButton.addEventListener('click', retryHandler);
	}

	private loadConfig(): void {
		// Load group by property from config
		this.groupByPropertyId = this.config.getAsPropertyId('groupByProperty');
	}

	private render(): void {
		// Clear existing content
		this.containerEl.empty();
		
		// Don't render if there's an error (let error display stay)
		if (this.lastError) {
			return;
		}

		try {
			// Get all entries from the data
			const entries = this.data?.data || [];
			if (!entries || entries.length === 0) {
				this.containerEl.createDiv({
					text: EMPTY_STATE_MESSAGES.NO_ENTRIES,
					cls: CSS_CLASSES.EMPTY_STATE
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
					this.containerEl.createDiv({
						text: EMPTY_STATE_MESSAGES.NO_PROPERTIES,
						cls: CSS_CLASSES.EMPTY_STATE
					});
					return;
				}
			}

			// Group entries by group by property value
			const groupedEntries = this.groupEntriesByProperty(entries, this.groupByPropertyId);

			// Create kanban board
			const boardEl = this.containerEl.createDiv({ cls: CSS_CLASSES.BOARD });

			// Create columns for each unique property value
			const propertyValues = Array.from(groupedEntries.keys());
			const orderedValues = this.getOrderedColumnValues(propertyValues);
			
			orderedValues.forEach((value) => {
				const columnEl = this.createColumn(value, groupedEntries.get(value) || []);
				boardEl.appendChild(columnEl);
			});

			// Initialize drag and drop
			this.initializeSortable();
			this.initializeColumnSortable();
		} catch (error) {
			this.handleError(toError(error), 'render');
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

		// Column header
		const headerEl = columnEl.createDiv({ cls: CSS_CLASSES.COLUMN_HEADER });
		
		// Add drag handle
		const dragHandle = headerEl.createDiv({ cls: CSS_CLASSES.COLUMN_DRAG_HANDLE });
		dragHandle.innerHTML = '⋮⋮';
		
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

		// Make card clickable to open the note
		const clickHandler = () => {
			if (this.app?.workspace) {
				this.app.workspace.openLinkText(filePath, '', false);
			}
		};
		cardEl.addEventListener('click', clickHandler);

		return cardEl;
	}

	private initializeSortable(): void {
		// Clean up existing Sortable instances
		this.sortableInstances.forEach((instance) => {
			instance.destroy();
		});
		this.sortableInstances = [];

		// Get all column bodies
		const selector = `.${CSS_CLASSES.COLUMN_BODY}[${DATA_ATTRIBUTES.SORTABLE_CONTAINER}]`;
		const columnBodies = this.containerEl.querySelectorAll(selector);

		columnBodies.forEach((columnBody) => {
			// Type guard to ensure we have an HTMLElement
			if (!(columnBody instanceof HTMLElement)) {
				console.warn('Column body is not an HTMLElement:', columnBody);
				return;
			}

			const sortable = new Sortable(columnBody, {
				group: SORTABLE_GROUP,
				animation: SORTABLE_CONFIG.ANIMATION_DURATION,
				dragClass: CSS_CLASSES.CARD_DRAGGING,
				ghostClass: CSS_CLASSES.CARD_GHOST,
				chosenClass: CSS_CLASSES.CARD_CHOSEN,
				onEnd: (evt: Sortable.SortableEvent) => {
					this.handleCardDrop(evt);
				},
			});

			this.sortableInstances.push(sortable);
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

		const oldColumnValue = oldColumnEl instanceof HTMLElement
			? oldColumnEl.getAttribute(DATA_ATTRIBUTES.COLUMN_VALUE)
			: null;
		const newColumnValue = newColumnEl.getAttribute(DATA_ATTRIBUTES.COLUMN_VALUE);
		
		if (!newColumnValue) {
			console.warn('No column value found');
			return;
		}

		// Skip if dropped in the same column
		if (oldColumnValue === newColumnValue) {
			return;
		}

		// Find the entry
		const entries = this.data?.data;
		if (!entries) {
			console.warn('No entries data available');
			return;
		}

		const entry = entries.find((e: BasesEntry) => {
			return e.file.path === entryPath;
		});

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
			
			await this.app.fileManager.processFrontMatter(entry.file, (frontmatter) => {
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
		
		const savedOrder = this.getColumnOrderFromStorage(this.groupByPropertyId);
		if (!savedOrder) return values.sort();
		
		// Merge saved order with new values
		const newValues = values.filter(v => !savedOrder.includes(v));
		return [...savedOrder.filter(v => values.includes(v)), ...newValues];
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
				this.handleColumnDrop(evt);
			},
		});
	}

	private async handleColumnDrop(evt: Sortable.SortableEvent): Promise<void> {
		if (!this.groupByPropertyId) return;
		
		// Extract current column order from DOM
		const columns = this.containerEl.querySelectorAll(`.${CSS_CLASSES.COLUMN}`);
		const order = Array.from(columns).map(col => 
			col.getAttribute(DATA_ATTRIBUTES.COLUMN_VALUE)
		).filter(v => v !== null) as string[];
		
		await this.saveColumnOrderToStorage(this.groupByPropertyId, order);
	}

	private getColumnOrderFromStorage(propertyId: BasesPropertyId): string[] | null {
		// Access plugin data via this.app
		const plugin = (this.app as any)?.plugins?.plugins?.['kanban-bases-view'];
		return plugin?.getColumnOrder?.(propertyId) || null;
	}

	private async saveColumnOrderToStorage(propertyId: BasesPropertyId, order: string[]): Promise<void> {
		const plugin = (this.app as any)?.plugins?.plugins?.['kanban-bases-view'];
		if (plugin?.saveColumnOrder) {
			await plugin.saveColumnOrder(propertyId, order);
		}
	}

	onClose(): void {
		// Clean up Sortable instances
		this.sortableInstances.forEach((instance) => {
			instance.destroy();
		});
		this.sortableInstances = [];
		
		// Clean up column Sortable instance
		if (this.columnSortable) {
			this.columnSortable.destroy();
			this.columnSortable = null;
		}
		
		// Note: DOM event listeners attached to elements within containerEl
		// are automatically cleaned up when containerEl is cleared (via empty()).
		// No manual cleanup needed for listeners on child elements.
	}

	static getViewOptions(): ViewOption[] {
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
