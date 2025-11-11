import { Plugin } from 'obsidian';
import { KanbanView } from './kanbanView.ts';

export const KANBAN_VIEW_TYPE = 'kanban-view';

interface ColumnOrderSettings {
	[propertyId: string]: string[]; // propertyId -> ordered column values
}

export default class KanbanBasesViewPlugin extends Plugin {
	private columnOrders: ColumnOrderSettings = {};

	async onload() {
		await this.loadSettings();
		
		// Register the custom Bases view
		this.registerBasesView(KANBAN_VIEW_TYPE, {
			name: 'Kanban',
			icon: 'columns',
			factory: (controller, scrollEl) => {
				return new KanbanView(controller, scrollEl);
			},
			options: KanbanView.getViewOptions,
		});
	}

	private async loadSettings(): Promise<void> {
		this.columnOrders = Object.assign({}, await this.loadData() || {});
	}

	async saveColumnOrder(propertyId: string, order: string[]): Promise<void> {
		this.columnOrders[propertyId] = order;
		await this.saveData(this.columnOrders);
	}

	getColumnOrder(propertyId: string): string[] | null {
		return this.columnOrders[propertyId] || null;
	}

	onunload() {
		// Cleanup if needed
	}
}

