import { Plugin } from 'obsidian';
import { KanbanView } from './src/kanbanView';

export const KANBAN_VIEW_TYPE = 'kanban-view';

export default class KanbanBasesViewPlugin extends Plugin {
	async onload() {
		// Register the custom Bases view
		this.registerBasesView(KANBAN_VIEW_TYPE, {
			name: 'Kanban',
			icon: 'layout-kanban',
			factory: (controller, containerEl) => {
				return new KanbanView(controller, containerEl);
			},
		});
	}

	onunload() {
		// Cleanup if needed
	}
}

