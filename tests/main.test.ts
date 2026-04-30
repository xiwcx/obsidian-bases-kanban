import assert from 'node:assert';
import { describe, test } from 'node:test';
import { HOVER_LINK_SOURCE_ID } from '../src/constants.ts';
import { KanbanView } from '../src/kanbanView.ts';
import KanbanBasesViewPlugin, { KANBAN_VIEW_TYPE } from '../src/main.ts';
import { createDivWithMethods, createMockQueryController, setupTestEnvironment } from './helpers.ts';

setupTestEnvironment();

describe('Plugin Registration', () => {
	test('Plugin loads and registers view correctly', async () => {
		// Mock the plugin's registerBasesView method
		let registeredViewType: string | null = null;
		let registeredName: string | null = null;
		let registeredIcon: string | null = null;
		let factoryController: any = null;
		let factoryScrollEl: HTMLElement | null = null;
		let registeredHoverSourceId: string | null = null;
		let registeredHoverSourceInfo: any = null;

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
		plugin.registerHoverLinkSource = function (id: string, info: any) {
			registeredHoverSourceId = id;
			registeredHoverSourceInfo = info;
		};

		// Call onload (it's async now)
		await plugin.onload();

		// Verify registration
		assert.strictEqual(registeredViewType, KANBAN_VIEW_TYPE, 'View type should match constant');
		assert.strictEqual(registeredName, 'Kanban', 'View name should be "Kanban"');
		assert.strictEqual(registeredIcon, 'columns', 'View icon should be "columns"');
		assert.notStrictEqual(factoryController, null, 'Factory should receive controller');
		assert.notStrictEqual(factoryScrollEl, null, 'Factory should receive scrollEl');
		assert.strictEqual(registeredHoverSourceId, HOVER_LINK_SOURCE_ID, 'Hover link source should be registered');
		assert.deepStrictEqual(
			registeredHoverSourceInfo,
			{ display: 'Kanban', defaultMod: true },
			'Hover link source should require Mod by default',
		);
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

		const byKey = Object.fromEntries(options.map((o) => [(o as { key: string }).key, o])) as Record<string, any>;

		assert.ok(byKey.groupByProperty, 'groupByProperty option should exist');
		assert.strictEqual(byKey.groupByProperty.displayName, 'Group by');
		assert.strictEqual(byKey.groupByProperty.type, 'property');

		assert.ok(byKey.cardTitleProperty, 'cardTitleProperty option should exist');
		assert.strictEqual(byKey.cardTitleProperty.displayName, 'Card title property');
		assert.strictEqual(byKey.cardTitleProperty.type, 'property');

		assert.ok(byKey.imageProperty, 'imageProperty option should exist');
		assert.strictEqual(byKey.imageProperty.displayName, 'Image property');
		assert.strictEqual(byKey.imageProperty.type, 'property');

		assert.ok(byKey.imageFit, 'imageFit option should exist');
		assert.strictEqual(byKey.imageFit.displayName, 'Image fit');
		assert.strictEqual(byKey.imageFit.type, 'dropdown');
		assert.deepStrictEqual(byKey.imageFit.options, { cover: 'Cover', contain: 'Contain' });
		assert.strictEqual(byKey.imageFit.default, 'cover');

		assert.ok(byKey.imageAspectRatio, 'imageAspectRatio option should exist');
		assert.strictEqual(byKey.imageAspectRatio.displayName, 'Image aspect ratio');
		assert.strictEqual(byKey.imageAspectRatio.type, 'slider');
		assert.strictEqual(byKey.imageAspectRatio.min, 0.25);
		assert.strictEqual(byKey.imageAspectRatio.max, 2.5);
		assert.strictEqual(byKey.imageAspectRatio.default, 0.5);

		assert.ok(byKey.wrapPropertyValues, 'wrapPropertyValues option should exist');
		assert.strictEqual(byKey.wrapPropertyValues.displayName, 'Wrap property values');
		assert.strictEqual(byKey.wrapPropertyValues.type, 'toggle');

		assert.ok(byKey.quickAddFolder, 'quickAddFolder option should exist');
		assert.strictEqual(byKey.quickAddFolder.displayName, 'New card folder');
		assert.strictEqual(byKey.quickAddFolder.type, 'folder');
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
