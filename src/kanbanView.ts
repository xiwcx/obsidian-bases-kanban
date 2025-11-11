import { BasesView, parsePropertyId } from 'obsidian';
import type { QueryController, BasesEntry, BasesPropertyId, ViewOption, App } from 'obsidian';
import Sortable from 'sortablejs';
import {
	UNCATEGORIZED_LABEL,
	SORTABLE_GROUP,
	DATA_ATTRIBUTES,
	CSS_CLASSES,
	SORTABLE_CONFIG,
	EMPTY_STATE_MESSAGES,
} from './constants.ts';
import { ensureGroupExists, normalizePropertyValue } from './utils/grouping.ts';

interface KanbanPlugin {
	getColumnOrder(propertyId: BasesPropertyId): string[] | null;
	saveColumnOrder(propertyId: BasesPropertyId, order: string[]): Promise<void>;
}

// Extend Obsidian's App type to include plugins registry
// Obsidian's App structure: app.plugins is PluginManager, app.plugins.plugins is the registry
// Plugins are accessed via app.plugins.plugins[pluginId] where pluginId matches manifest.json id
// Reference: Obsidian API type definitions - https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts
// This is an internal but commonly used API pattern in Obsidian plugins
interface AppWithPluginRegistry extends App {
	plugins?: {
		plugins?: {
			[key: string]: unknown;
		};
	};
}

// Type guard to check if app has plugin registry
function hasPluginRegistry(app: App | undefined): app is AppWithPluginRegistry {
	return app !== undefined && 'plugins' in app;
}

export class KanbanView extends BasesView {
	type = 'kanban-view';
	
	scrollEl: HTMLElement;
	containerEl: HTMLElement;
	private groupByPropertyId: BasesPropertyId | null = null;
	private sortableInstances: Sortable[] = [];
	private columnSortable: Sortable | null = null;

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
			console.error('KanbanView error:', error);
		}
	}

	private loadConfig(): void {
		// Load group by property from config
		this.groupByPropertyId = this.config.getAsPropertyId('groupByProperty');
	}

	private render(): void {
		// Clear existing content
		this.containerEl.empty();

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
			console.error('KanbanView error:', error);
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
		dragHandle.textContent = '⋮⋮';
		
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
				void this.app.workspace.openLinkText(filePath, '', false);
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
					void this.handleCardDrop(evt);
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
		
		const savedOrder = this.getColumnOrderFromStorage(this.groupByPropertyId);
		if (!savedOrder) return values.sort();
		
		// Saved order is already normalized strings, use directly
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
				void this.handleColumnDrop(evt);
			},
		});
	}

	private async handleColumnDrop(evt: Sortable.SortableEvent): Promise<void> {
		if (!this.groupByPropertyId) return;
		
		// Extract current column order from DOM
		const columns = this.containerEl.querySelectorAll(`.${CSS_CLASSES.COLUMN}`);
		const order = Array.from(columns).map(col => 
			col.getAttribute(DATA_ATTRIBUTES.COLUMN_VALUE)
		).filter((v): v is string => v !== null);
		
		await this.saveColumnOrderToStorage(this.groupByPropertyId, order);
	}

	private getColumnOrderFromStorage(propertyId: BasesPropertyId): string[] | null {
		// Access plugin data via this.app
		if (!hasPluginRegistry(this.app)) {
			return null;
		}
		const plugin = this.app.plugins?.plugins?.['kanban-bases-view'] as KanbanPlugin | undefined;
		return plugin?.getColumnOrder?.(propertyId) || null;
	}

	private async saveColumnOrderToStorage(propertyId: BasesPropertyId, order: string[]): Promise<void> {
		if (!hasPluginRegistry(this.app)) {
			return;
		}
		const plugin = this.app.plugins?.plugins?.['kanban-bases-view'] as KanbanPlugin | undefined;
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
