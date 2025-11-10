import { BasesView, QueryController, BasesEntry, BasesPropertyId, TFile, parsePropertyId, ViewOption } from 'obsidian';
import Sortable from 'sortablejs';

export class KanbanView extends BasesView {
	type = 'kanban-view';
	
	scrollEl: HTMLElement;
	containerEl: HTMLElement;
	private columnPropertyId: BasesPropertyId | null = null;
	private sortableInstances: Sortable[] = [];
	private lastError: Error | null = null;

	constructor(controller: QueryController, scrollEl: HTMLElement) {
		super(controller);
		this.scrollEl = scrollEl;
		this.containerEl = scrollEl.createDiv({ cls: 'kanban-view-container' });
	}

	onDataUpdated(): void {
		try {
			this.loadConfig();
			this.render();
		} catch (error) {
			this.handleError(error as Error, 'onDataUpdated');
		}
	}

	private handleError(error: Error, context: string): void {
		this.lastError = error;
		const errorMessage = `[${context}] ${error.name}: ${error.message}`;
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
		
		const errorContainer = this.containerEl.createDiv({ cls: 'kanban-error-container' });
		
		// Error icon and title
		const errorHeader = errorContainer.createDiv({ cls: 'kanban-error-header' });
		errorHeader.createSpan({ text: '⚠️', cls: 'kanban-error-icon' });
		errorHeader.createSpan({ text: 'Kanban View Error', cls: 'kanban-error-title' });
		
		// Error message
		const errorMessageEl = errorContainer.createDiv({ cls: 'kanban-error-message' });
		errorMessageEl.textContent = message;
		
		// Stack trace (collapsible)
		if (stack) {
			const stackContainer = errorContainer.createDiv({ cls: 'kanban-error-stack-container' });
			const stackToggle = stackContainer.createDiv({ cls: 'kanban-error-stack-toggle' });
			stackToggle.textContent = 'Show stack trace';
			stackToggle.style.cursor = 'pointer';
			stackToggle.style.color = 'var(--text-muted)';
			stackToggle.style.fontSize = '0.9em';
			stackToggle.style.marginTop = '10px';
			
			const stackContent = stackContainer.createDiv({ cls: 'kanban-error-stack' });
			stackContent.style.display = 'none';
			stackContent.style.fontFamily = 'monospace';
			stackContent.style.fontSize = '0.85em';
			stackContent.style.color = 'var(--text-muted)';
			stackContent.style.whiteSpace = 'pre-wrap';
			stackContent.style.overflow = 'auto';
			stackContent.style.maxHeight = '200px';
			stackContent.style.marginTop = '5px';
			stackContent.style.padding = '10px';
			stackContent.style.backgroundColor = 'var(--background-secondary)';
			stackContent.style.borderRadius = '4px';
			stackContent.textContent = stack;
			
			stackToggle.addEventListener('click', () => {
				const isVisible = stackContent.style.display !== 'none';
				stackContent.style.display = isVisible ? 'none' : 'block';
				stackToggle.textContent = isVisible ? 'Show stack trace' : 'Hide stack trace';
			});
		}
		
		// Retry button
		const retryButton = errorContainer.createEl('button', { cls: 'kanban-error-retry' });
		retryButton.textContent = 'Retry';
		retryButton.style.marginTop = '15px';
		retryButton.style.padding = '8px 16px';
		retryButton.style.cursor = 'pointer';
		retryButton.addEventListener('click', () => {
			this.lastError = null;
			try {
				this.onDataUpdated();
			} catch (retryError) {
				this.handleError(retryError as Error, 'Retry');
			}
		});
	}

	private loadConfig(): void {
		// Load column property from config
		// Based on map-view.ts: this.config.getAsPropertyId('columnProperty')
		this.columnPropertyId = this.config.getAsPropertyId('columnProperty');
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
					text: 'No entries found. Add some notes to your base.',
					cls: 'kanban-empty-state'
				});
				return;
			}

			// Get available properties from entries
			const availablePropertyIds = this.allProperties || [];
			
			// Validate column property
			if (!this.columnPropertyId || !availablePropertyIds.includes(this.columnPropertyId)) {
				if (availablePropertyIds.length > 0) {
					this.columnPropertyId = availablePropertyIds[0];
				} else {
					this.containerEl.createDiv({
						text: 'No properties found in entries.',
						cls: 'kanban-empty-state'
					});
					return;
				}
			}

			// Group entries by column property value
			const groupedEntries = this.groupEntriesByProperty(entries, this.columnPropertyId);

			// Create kanban board
			const boardEl = this.containerEl.createDiv({ cls: 'kanban-board' });

			// Create columns for each unique property value
			const propertyValues = Array.from(groupedEntries.keys()).sort();
			
			propertyValues.forEach((value) => {
				const columnEl = this.createColumn(value, groupedEntries.get(value) || []);
				boardEl.appendChild(columnEl);
			});

			// Initialize drag and drop
			this.initializeSortable();
		} catch (error) {
			this.handleError(error as Error, 'render');
		}
	}

	private groupEntriesByProperty(entries: BasesEntry[], propertyId: BasesPropertyId): Map<string, BasesEntry[]> {
		const grouped = new Map<string, BasesEntry[]>();

		entries.forEach((entry) => {
			try {
				let value = '';
				
				const propValue = entry.getValue(propertyId);
				if (propValue !== null && propValue !== undefined) {
					// Convert Value to string
					value = String(propValue);
				}

				// Use 'Uncategorized' for empty values
				if (!value || value.trim() === '') {
					value = 'Uncategorized';
				}

				if (!grouped.has(value)) {
					grouped.set(value, []);
				}
				grouped.get(value)!.push(entry);
			} catch (error) {
				console.warn('Error processing entry:', entry.file.path, error);
				// Add to Uncategorized on error
				if (!grouped.has('Uncategorized')) {
					grouped.set('Uncategorized', []);
				}
				grouped.get('Uncategorized')!.push(entry);
			}
		});

		return grouped;
	}

	private createColumn(value: string, entries: BasesEntry[]): HTMLElement {
		const columnEl = document.createElement('div');
		columnEl.className = 'kanban-column';
		columnEl.setAttribute('data-column-value', value);

		// Column header
		const headerEl = columnEl.createDiv({ cls: 'kanban-column-header' });
		headerEl.createSpan({ text: value, cls: 'kanban-column-title' });
		headerEl.createSpan({ text: `(${entries.length})`, cls: 'kanban-column-count' });

		// Column body (cards container)
		const bodyEl = columnEl.createDiv({ cls: 'kanban-column-body' });
		bodyEl.setAttribute('data-sortable-container', 'true');

		// Create cards for each entry
		entries.forEach((entry) => {
			const cardEl = this.createCard(entry);
			bodyEl.appendChild(cardEl);
		});

		return columnEl;
	}

	private createCard(entry: BasesEntry): HTMLElement {
		const cardEl = document.createElement('div');
		cardEl.className = 'kanban-card';
		const filePath = entry.file.path;
		cardEl.setAttribute('data-entry-path', filePath);

		// Card title - use file basename
		const titleEl = cardEl.createDiv({ cls: 'kanban-card-title' });
		titleEl.textContent = entry.file.basename;

		// Make card clickable to open the note
		cardEl.addEventListener('click', () => {
			this.app.workspace.openLinkText(filePath, '', false);
		});

		return cardEl;
	}

	private initializeSortable(): void {
		// Clean up existing Sortable instances
		this.sortableInstances.forEach((instance) => {
			instance.destroy();
		});
		this.sortableInstances = [];

		// Get all column bodies
		const columnBodies = this.containerEl.querySelectorAll('.kanban-column-body[data-sortable-container]');

		columnBodies.forEach((columnBody) => {
			const sortable = new Sortable(columnBody as HTMLElement, {
				group: 'kanban-columns',
				animation: 150,
				dragClass: 'kanban-card-dragging',
				ghostClass: 'kanban-card-ghost',
				chosenClass: 'kanban-card-chosen',
				onEnd: (evt: Sortable.SortableEvent) => {
					this.handleCardDrop(evt);
				},
			});

			this.sortableInstances.push(sortable);
		});
	}

	private async handleCardDrop(evt: Sortable.SortableEvent): Promise<void> {
		const cardEl = evt.item as HTMLElement;
		const entryPath = cardEl.getAttribute('data-entry-path');
		
		if (!entryPath) {
			console.warn('No entry path found on card');
			return;
		}

		// Get the old and new column values
		const oldColumnEl = evt.from.closest('.kanban-column');
		const newColumnEl = evt.to.closest('.kanban-column');
		
		if (!newColumnEl) {
			console.warn('Could not find new column element');
			return;
		}

		const oldColumnValue = oldColumnEl?.getAttribute('data-column-value');
		const newColumnValue = newColumnEl.getAttribute('data-column-value');
		
		if (!newColumnValue) {
			console.warn('No column value found');
			return;
		}

		// Skip if dropped in the same column
		if (oldColumnValue === newColumnValue) {
			return;
		}

		// Find the entry
		const entries = this.data.data;
		const entry = entries.find((e: BasesEntry) => {
			return e.file.path === entryPath;
		});

		if (!entry) {
			console.warn('Entry not found for path:', entryPath);
			return;
		}

		if (!this.columnPropertyId) {
			console.warn('No column property ID set');
			return;
		}

		// Update the entry's property using fileManager
		// For "Uncategorized", we'll set it to empty string or null
		try {
			const valueToSet = newColumnValue === 'Uncategorized' ? '' : newColumnValue;
			
			// Extract property name from property ID (e.g., "note.status" -> "status")
			const parsedProperty = parsePropertyId(this.columnPropertyId);
			const propertyName = parsedProperty.name;
			
			console.log('Updating property:', propertyName, 'to value:', valueToSet, 'for file:', entry.file.path);
			
			await this.app.fileManager.processFrontMatter(entry.file, (frontmatter) => {
				if (valueToSet === '') {
					// Remove the property if setting to empty
					delete frontmatter[propertyName];
				} else {
					frontmatter[propertyName] = valueToSet;
				}
			});
			
			console.log('Property updated successfully');
			// The view will automatically update via onDataUpdated when the file changes
		} catch (error) {
			console.error('Error updating entry property:', error);
			// Revert the visual change on error
			this.render();
		}
	}

	onClose(): void {
		// Clean up Sortable instances
		this.sortableInstances.forEach((instance) => {
			instance.destroy();
		});
		this.sortableInstances = [];
	}

	static getViewOptions(): ViewOption[] {
		return [
			{
				displayName: 'Column property',
				type: 'property',
				key: 'columnProperty',
				filter: (prop: string) => !prop.startsWith('file.'),
				placeholder: 'Property',
			},
		];
	}
}
