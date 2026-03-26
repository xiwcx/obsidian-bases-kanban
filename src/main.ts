import { Plugin } from 'obsidian';
import { KanbanView, type LegacyData, isColumnOrders, isColumnColors } from './kanbanView.ts';

export const KANBAN_VIEW_TYPE = 'kanban-view';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

/**
 * Reads column order and color data previously stored in plugin.data.json
 * (via Obsidian's Plugin.saveData API) and normalises it into LegacyData.
 *
 * Column state is now persisted per-base using BasesViewConfig.set/get, so
 * plugin.data.json is no longer written to. This function is the bridge that
 * lets existing users keep their configuration when upgrading.
 *
 * Two historical shapes are handled:
 *   - Current:  { columnOrders: { [propertyId]: string[] }, columnColors: { [propertyId]: { [value]: color } } }
 *   - Pre-v0.1: { [propertyId]: string[] }  (columnOrders only, no color support)
 */
function parseLegacyData(data: unknown): LegacyData | null {
	if (!isRecord(data)) return null;

	// Current on-disk format: { columnOrders: {...}, columnColors: {...} }
	if ('columnOrders' in data && isColumnOrders(data.columnOrders)) {
		return {
			columnOrders: data.columnOrders,
			columnColors: isColumnColors(data.columnColors) ? data.columnColors : {},
		};
	}

	// Pre-migration format: { 'note.status': ['To Do', ...], ... }
	if (isColumnOrders(data)) {
		return {
			columnOrders: data,
			columnColors: {},
		};
	}

	return null;
}

export default class KanbanBasesViewPlugin extends Plugin {
	async onload() {
		// Read any data previously saved to plugin.data.json and pass it to each
		// view instance so it can lazily migrate state into the base config on
		// first render. Once migrated, plugin.data.json is no longer consulted.
		const raw: unknown = await this.loadData();
		const legacyData = parseLegacyData(raw);

		this.registerBasesView(KANBAN_VIEW_TYPE, {
			name: 'Kanban',
			icon: 'columns',
			factory: (controller, scrollEl) => {
				return new KanbanView(controller, scrollEl, legacyData);
			},
			options: KanbanView.getViewOptions,
		});
	}

	onunload() {
		// Cleanup if needed
	}
}
