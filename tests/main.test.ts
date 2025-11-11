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
		plugin.registerBasesView = function(
			viewType: string,
			options: {
				name: string;
				icon: string;
				factory: (controller: any, scrollEl: HTMLElement) => any;
				options: () => any[];
			}
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
		plugin.registerBasesView = function(viewType: string, options: any) {
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

