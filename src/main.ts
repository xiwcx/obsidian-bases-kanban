import { Plugin } from 'obsidian';
import { KanbanView } from './kanbanView.ts';

export const KANBAN_VIEW_TYPE = 'kanban-view';

interface ColumnOrderSettings {
	[propertyId: string]: string[]; // propertyId -> ordered column values
}

interface ColumnColorSettings {
	[propertyId: string]: { [columnValue: string]: string }; // propertyId -> columnValue -> color name
}

interface PluginSettings {
	columnOrders: ColumnOrderSettings;
	columnColors: ColumnColorSettings;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isPluginSettings(data: unknown): data is PluginSettings {
	return (
		isRecord(data) &&
		'columnOrders' in data &&
		isRecord(data.columnOrders) &&
		'columnColors' in data &&
		isRecord(data.columnColors)
	);
}

function isLegacyColumnOrderSettings(data: unknown): data is ColumnOrderSettings {
	return (
		isRecord(data) && Object.values(data).every((v) => Array.isArray(v) && v.every((item) => typeof item === 'string'))
	);
}

export default class KanbanBasesViewPlugin extends Plugin {
	private columnOrders: ColumnOrderSettings = {};
	private columnColors: ColumnColorSettings = {};

	async onload() {
		await this.loadSettings();

		// Register the custom Bases view
		this.registerBasesView(KANBAN_VIEW_TYPE, {
			name: 'Kanban',
			icon: 'columns',
			factory: (controller, scrollEl) => {
				return new KanbanView(controller, scrollEl, this);
			},
			options: KanbanView.getViewOptions,
		});
	}

	private async loadSettings(): Promise<void> {
		const raw: unknown = await this.loadData();
		if (isPluginSettings(raw)) {
			this.columnOrders = raw.columnOrders;
			this.columnColors = raw.columnColors;
		} else if (isLegacyColumnOrderSettings(raw)) {
			// Legacy format: saved data was just ColumnOrderSettings at the top level
			this.columnOrders = raw;
			this.columnColors = {};
			// Migrate to new schema immediately so the file is always in the current format
			await this.persistSettings();
		}
		// else: null or unrecognised shape — keep class field defaults ({})
	}

	private async persistSettings(): Promise<void> {
		const settings: PluginSettings = {
			columnOrders: this.columnOrders,
			columnColors: this.columnColors,
		};
		await this.saveData(settings);
	}

	async saveColumnOrder(propertyId: string, order: string[]): Promise<void> {
		this.columnOrders[propertyId] = order;
		await this.persistSettings();
	}

	getColumnOrder(propertyId: string): string[] | null {
		return this.columnOrders[propertyId] || null;
	}

	async saveColumnColor(propertyId: string, columnValue: string, colorName: string | null): Promise<void> {
		if (!this.columnColors[propertyId]) {
			this.columnColors[propertyId] = {};
		}
		if (colorName === null) {
			delete this.columnColors[propertyId][columnValue];
		} else {
			this.columnColors[propertyId][columnValue] = colorName;
		}
		await this.persistSettings();
	}

	getColumnColor(propertyId: string, columnValue: string): string | null {
		return this.columnColors[propertyId]?.[columnValue] ?? null;
	}

	onunload() {
		// Cleanup if needed
	}
}
