import { Plugin } from 'obsidian';
import { KanbanView } from './kanbanView';

export const KANBAN_VIEW_TYPE = 'kanban-view';

export default class KanbanBasesViewPlugin extends Plugin {
	async onload() {
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

	onunload() {
		// Cleanup if needed
	}
}

