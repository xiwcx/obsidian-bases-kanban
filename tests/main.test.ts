import { test, describe } from 'node:test';
import assert from 'node:assert';
import KanbanBasesViewPlugin, { KANBAN_VIEW_TYPE } from '../src/main.ts';
import { KanbanView } from '../src/kanbanView.ts';
import { setupTestEnvironment, createDivWithMethods, createMockQueryController } from './helpers.ts';

setupTestEnvironment();

describe('Plugin Registration', () => {
	test('Plugin loads and registers view correctly', async () => {
		// Mock the plugin's registerBasesView method
		let registeredViewType: string | null = null;
		let registeredName: string | null = null;
		let registeredIcon: string | null = null;
		let factoryController: any = null;
		let factoryScrollEl: HTMLElement | null = null;

		// Create a mock plugin instance with loadData mock
		const mockApp = {} as any;
		const plugin = new KanbanBasesViewPlugin(mockApp, {} as any);

		// Mock loadData and saveData
		plugin.loadData = async () => ({});
		plugin.saveData = async () => {};

		// Override registerBasesView to capture calls
		plugin.registerBasesView = function (
			viewType: string,
			options: {
				name: string;
				icon: string;
				factory: (controller: any, scrollEl: HTMLElement) => any;
				options: () => any[];
			},
		) {
			registeredViewType = viewType;
			registeredName = options.name;
			registeredIcon = options.icon;

			// Test factory function
			const scrollEl = createDivWithMethods();
			const controller = createMockQueryController();
			const view = options.factory(controller, scrollEl);
			factoryController = controller;
			factoryScrollEl = scrollEl;

			return view;
		};

		// Call onload (it's async now)
		await plugin.onload();

		// Verify registration
		assert.strictEqual(registeredViewType, KANBAN_VIEW_TYPE, 'View type should match constant');
		assert.strictEqual(registeredName, 'Kanban', 'View name should be "Kanban"');
		assert.strictEqual(registeredIcon, 'columns', 'View icon should be "columns"');
		assert.notStrictEqual(factoryController, null, 'Factory should receive controller');
		assert.notStrictEqual(factoryScrollEl, null, 'Factory should receive scrollEl');
	});

	test('Factory function returns KanbanView instance', async () => {
		const scrollEl = createDivWithMethods();
		const controller = createMockQueryController();

		// Get the factory from getViewOptions static method
		const plugin = new KanbanBasesViewPlugin({} as any, {} as any);

		// Mock loadData and saveData
		plugin.loadData = async () => ({});
		plugin.saveData = async () => {};

		// Mock registerBasesView to get the factory
		let factoryFn: ((controller: any, scrollEl: HTMLElement) => any) | null = null;
		plugin.registerBasesView = function (viewType: string, options: any) {
			factoryFn = options.factory;
			return null;
		};

		await plugin.onload();

		assert.notStrictEqual(factoryFn, null, 'Factory function should be defined');

		const view = factoryFn!(controller, scrollEl);
		assert.ok(view instanceof KanbanView, 'Factory should return KanbanView instance');
	});

	test('Plugin unloads cleanly', () => {
		const plugin = new KanbanBasesViewPlugin({} as any, {} as any);

		// Should not throw
		assert.doesNotThrow(() => {
			plugin.onunload();
		}, 'onunload should not throw');
	});
});

describe('Color Settings', () => {
	test('getColumnColor returns null for unset column', async () => {
		const plugin = new KanbanBasesViewPlugin({} as any, {} as any);
		plugin.loadData = async () => ({});
		plugin.saveData = async () => {};
		await plugin.onload();

		assert.strictEqual(plugin.getColumnColor('note.status', 'To Do'), null);
	});

	test('saveColumnColor and getColumnColor persist color', async () => {
		const plugin = new KanbanBasesViewPlugin({} as any, {} as any);
		plugin.loadData = async () => ({});
		plugin.saveData = async () => {};
		await plugin.onload();

		await plugin.saveColumnColor('note.status', 'To Do', 'red');

		assert.strictEqual(plugin.getColumnColor('note.status', 'To Do'), 'red');
	});

	test('saveColumnColor with null removes color', async () => {
		const plugin = new KanbanBasesViewPlugin({} as any, {} as any);
		plugin.loadData = async () => ({});
		plugin.saveData = async () => {};
		await plugin.onload();

		await plugin.saveColumnColor('note.status', 'To Do', 'blue');
		assert.strictEqual(plugin.getColumnColor('note.status', 'To Do'), 'blue');

		await plugin.saveColumnColor('note.status', 'To Do', null);
		assert.strictEqual(plugin.getColumnColor('note.status', 'To Do'), null);
	});

	test('saveColumnColor saves data to storage', async () => {
		let savedData: any = null;
		const plugin = new KanbanBasesViewPlugin({} as any, {} as any);
		plugin.loadData = async () => ({});
		plugin.saveData = async (data: any) => {
			savedData = data;
		};
		await plugin.onload();

		await plugin.saveColumnColor('note.status', 'Done', 'green');

		assert.ok(savedData, 'saveData should have been called');
		assert.strictEqual(savedData.columnColors?.['note.status']?.['Done'], 'green');
	});

	test('loadSettings migrates legacy column order format', async () => {
		// Legacy format: data was just ColumnOrderSettings (no columnOrders wrapper)
		const legacyData = { 'note.status': ['To Do', 'In Progress', 'Done'] };
		let savedData: any = null;
		const plugin = new KanbanBasesViewPlugin({} as any, {} as any);
		plugin.loadData = async () => legacyData;
		plugin.saveData = async (data: any) => {
			savedData = data;
		};
		await plugin.onload();

		// Column orders should still work
		const order = plugin.getColumnOrder('note.status');
		assert.deepStrictEqual(order, ['To Do', 'In Progress', 'Done']);
		// Colors should default to empty
		assert.strictEqual(plugin.getColumnColor('note.status', 'To Do'), null);
		// Legacy data should have been written back in the new schema immediately
		assert.ok(savedData, 'persistSettings should have been called during migration');
		assert.deepStrictEqual(savedData.columnOrders?.['note.status'], ['To Do', 'In Progress', 'Done']);
		assert.deepStrictEqual(savedData.columnColors, {});
	});

	test('migrated data is recognised as new schema on subsequent load', async () => {
		// Simulate the first load migrating legacy data and writing it back
		const legacyData = { 'note.status': ['To Do', 'In Progress', 'Done'] };
		let storedData: any = legacyData;

		const plugin1 = new KanbanBasesViewPlugin({} as any, {} as any);
		plugin1.loadData = async () => storedData;
		plugin1.saveData = async (data: any) => {
			storedData = data;
		};
		await plugin1.onload();

		// storedData is now in the new schema — simulate a second plugin load
		let saveCount = 0;
		const plugin2 = new KanbanBasesViewPlugin({} as any, {} as any);
		plugin2.loadData = async () => storedData;
		plugin2.saveData = async () => {
			saveCount++;
		};
		await plugin2.onload();

		// Should not re-migrate (no write on second load)
		assert.strictEqual(saveCount, 0, 'persistSettings should not be called when data is already in new schema');
		// Data should still be intact
		assert.deepStrictEqual(plugin2.getColumnOrder('note.status'), ['To Do', 'In Progress', 'Done']);
	});
});

describe('View Options', () => {
	test('getViewOptions returns correct structure', () => {
		const options = KanbanView.getViewOptions();

		assert.strictEqual(options.length, 1, 'Should return one option');
		assert.strictEqual(options[0].displayName, 'Group by', 'Display name should match');
		assert.strictEqual(options[0].type, 'property', 'Type should be "property"');
		assert.strictEqual(options[0].key, 'groupByProperty', 'Key should be "groupByProperty"');
		assert.strictEqual(options[0].placeholder, 'Select property', 'Placeholder should match');
	});

	test('Property filter excludes file.* properties', () => {
		const options = KanbanView.getViewOptions();
		const option = options[0] as { filter?: (prop: string) => boolean };
		const filter = option.filter;

		assert.ok(filter, 'Filter should be defined');

		// Test that file.* properties are excluded
		assert.strictEqual(filter('file.name'), false, 'file.name should be excluded');
		assert.strictEqual(filter('file.path'), false, 'file.path should be excluded');
		assert.strictEqual(filter('file.size'), false, 'file.size should be excluded');

		// Test that other properties are included
		assert.strictEqual(filter('note.status'), true, 'note.status should be included');
		assert.strictEqual(filter('note.priority'), true, 'note.priority should be included');
		assert.strictEqual(filter('status'), true, 'status should be included');
	});
});
