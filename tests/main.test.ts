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

		const mockApp = {} as any;
		const plugin = new KanbanBasesViewPlugin(mockApp, {} as any);
		plugin.loadData = async () => null;

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

		const plugin = new KanbanBasesViewPlugin({} as any, {} as any);
		plugin.loadData = async () => null;

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

describe('Legacy Data Parsing', () => {
	async function getFactoryLegacyData(storedData: unknown): Promise<any> {
		const plugin = new KanbanBasesViewPlugin({} as any, {} as any);
		plugin.loadData = async () => storedData;

		let capturedLegacyData: any = undefined;
		plugin.registerBasesView = function (_viewType: string, options: any) {
			const scrollEl = createDivWithMethods();
			const controller = createMockQueryController();
			// Intercept constructor by monkey-patching — capture via the view instance
			const view = options.factory(controller, scrollEl);
			capturedLegacyData = (view as any).legacyData;
			return null;
		};

		await plugin.onload();
		return capturedLegacyData;
	}

	test('passes null legacy data when no stored data', async () => {
		const legacyData = await getFactoryLegacyData(null);
		assert.strictEqual(legacyData, null);
	});

	test('parses current on-disk format', async () => {
		const stored = {
			columnOrders: { 'note.status': ['Done', 'Doing', 'To Do'] },
			columnColors: { 'note.status': { 'To Do': 'red' } },
		};
		const legacyData = await getFactoryLegacyData(stored);
		assert.deepStrictEqual(legacyData.columnOrders['note.status'], ['Done', 'Doing', 'To Do']);
		assert.strictEqual(legacyData.columnColors['note.status']['To Do'], 'red');
	});

	test('parses pre-migration format (bare columnOrders object)', async () => {
		const stored = { 'note.status': ['To Do', 'Doing', 'Done'] };
		const legacyData = await getFactoryLegacyData(stored);
		assert.deepStrictEqual(legacyData.columnOrders['note.status'], ['To Do', 'Doing', 'Done']);
		assert.deepStrictEqual(legacyData.columnColors, {});
	});

	test('passes null for unrecognised data shapes', async () => {
		const legacyData = await getFactoryLegacyData({ unexpected: 'shape' });
		assert.strictEqual(legacyData, null);
	});
});

describe('View Options', () => {
	test('getViewOptions returns correct structure', () => {
		const options = KanbanView.getViewOptions();

		assert.strictEqual(options.length, 3, 'Should return three options');
		assert.strictEqual(options[0].displayName, 'Group by', 'First option should be Group by');
		assert.strictEqual(options[1].displayName, 'Card title property', 'Second option should be Card title property');
		assert.strictEqual(options[1].type, 'property', 'Card title property should be a property selector');
		assert.strictEqual(options[1].key, 'cardTitleProperty', 'Key should be "cardTitleProperty"');
		assert.strictEqual(options[2].displayName, 'Wrap property values', 'Third option should be Wrap property values');
		assert.strictEqual(options[2].type, 'toggle', 'Wrap property values should be a toggle');
		assert.strictEqual(options[2].key, 'wrapPropertyValues', 'Key should be "wrapPropertyValues"');
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
