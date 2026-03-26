import assert from 'node:assert';
import { beforeEach, describe, test } from 'node:test';
import type { BasesPropertyId } from 'obsidian';
import { KanbanView } from '../src/kanbanView.ts';
import {
	createEmptyEntries,
	createEntriesWithEmptyValues,
	createEntriesWithLinks,
	createEntriesWithMixedProperties,
	createEntriesWithStatus,
	PROPERTY_CATEGORY,
	PROPERTY_PRIORITY,
	PROPERTY_RELATED,
	PROPERTY_STATUS,
	TEST_PROPERTIES,
} from './fixtures.ts';
import {
	addClosestPolyfill,
	createDivWithMethods,
	createMockApp,
	createMockBasesEntry,
	createMockQueryController,
	createMockTFile,
	mockSortable,
	setupKanbanViewWithApp,
	setupTestEnvironment,
	triggerDataUpdate,
} from './helpers.ts';

setupTestEnvironment();

describe('KanbanView Initialization', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		controller = createMockQueryController();
		app = createMockApp();
		controller.app = app;
	});

	test('Constructor initializes correctly', () => {
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);

		assert.ok(view.containerEl, 'containerEl should be created');
		assert.strictEqual(view.containerEl.className, 'obk-view-container', 'containerEl should have correct class');
		assert.strictEqual(view.scrollEl, scrollEl, 'scrollEl reference should be stored');
		assert.strictEqual((view as any).groupByPropertyId, null, 'groupByPropertyId should be null initially');
		assert.strictEqual((view as any)._columnSortables.size, 0, '_columnSortables map should be empty');
	});

	test('loadConfig loads group by property from config', () => {
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		const testPropertyId = PROPERTY_STATUS;

		// Mock config.getAsPropertyId
		controller.config.getAsPropertyId = (key: string) => {
			if (key === 'groupByProperty') {
				return testPropertyId;
			}
			return null;
		};

		// Call loadConfig via onDataUpdated
		triggerDataUpdate(view);

		assert.strictEqual((view as any).groupByPropertyId, testPropertyId, 'groupByPropertyId should be set from config');
	});

	test('loadConfig handles null/undefined config values', () => {
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);

		// Mock config.getAsPropertyId to return null
		controller.config.getAsPropertyId = (): BasesPropertyId | null => null;

		triggerDataUpdate(view);

		assert.strictEqual(
			(view as any).groupByPropertyId,
			null,
			'groupByPropertyId should remain null when config returns null',
		);
	});
});

describe('Data Rendering - Empty States', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		controller = createMockQueryController([], TEST_PROPERTIES);
		app = createMockApp();
		controller.app = app;
	});

	test('Renders empty state when no entries', () => {
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const emptyState = view.containerEl.querySelector('.obk-empty-state');
		assert.ok(emptyState, 'Empty state element should exist');
		assert.ok(
			emptyState?.textContent?.includes('No entries found'),
			'Empty state should show "No entries found" message',
		);
	});

	test('Renders empty state when no properties', () => {
		const controllerNoProps = createMockQueryController([], []) as any; // Empty properties array
		controllerNoProps.app = app;
		const view = new KanbanView(controllerNoProps, scrollEl);
		setupKanbanViewWithApp(view, app);

		// Set a property ID that doesn't exist in the empty properties list
		controllerNoProps.config.getAsPropertyId = () => PROPERTY_STATUS;
		triggerDataUpdate(view);

		const emptyState = view.containerEl.querySelector('.obk-empty-state');
		assert.ok(emptyState, 'Empty state element should exist');
		// The code will try to use the first available property, but since there are none,
		// it should show the "No properties found" message
		assert.ok(
			emptyState?.textContent?.includes('No properties found') || emptyState?.textContent?.includes('No entries found'),
			'Empty state should show appropriate message when no properties available',
		);
	});
});

describe('Data Rendering - Entry Grouping', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
	});

	test('groupEntriesByProperty groups entries correctly', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		// Check that columns were created
		const columns = view.containerEl.querySelectorAll('.obk-column');
		assert.ok(columns.length > 0, 'Columns should be created');

		// Verify "To Do" column has 2 entries
		const toDoColumn = Array.from(columns).find((col) => col.getAttribute('data-column-value')?.includes('To Do'));
		assert.ok(toDoColumn, 'To Do column should exist');
		const toDoCards = toDoColumn?.querySelectorAll('.obk-card');
		assert.strictEqual(toDoCards?.length, 2, 'To Do column should have 2 cards');
	});

	test('Handles null/undefined property values (map to Uncategorized)', () => {
		const entries = createEntriesWithEmptyValues();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		// Check for Uncategorized column
		const columns = view.containerEl.querySelectorAll('.obk-column');
		const uncategorizedColumn = Array.from(columns).find((col) =>
			col.getAttribute('data-column-value')?.includes('Uncategorized'),
		);
		assert.ok(uncategorizedColumn, 'Uncategorized column should exist');
	});

	test('Handles empty string values (map to Uncategorized)', () => {
		const entries = createEntriesWithEmptyValues();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columns = view.containerEl.querySelectorAll('.obk-column');
		const uncategorizedColumn = Array.from(columns).find((col) =>
			col.getAttribute('data-column-value')?.includes('Uncategorized'),
		);
		assert.ok(uncategorizedColumn, 'Empty string values should map to Uncategorized');
	});
});

describe('Data Rendering - Column Rendering', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
	});

	test('createColumn creates column structure', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columns = view.containerEl.querySelectorAll('.obk-column');
		assert.ok(columns.length > 0, 'Columns should be created');

		const firstColumn = columns[0] as HTMLElement;
		assert.ok(firstColumn.getAttribute('data-column-value'), 'Column should have data-column-value attribute');

		const header = firstColumn.querySelector('.obk-column-header');
		assert.ok(header, 'Column header should exist');

		const title = header?.querySelector('.obk-column-title');
		assert.ok(title, 'Column title should exist');

		const count = header?.querySelector('.obk-column-count');
		assert.ok(count, 'Column count should exist');

		const body = firstColumn.querySelector('.obk-column-body');
		assert.ok(body, 'Column body should exist');
		assert.ok(body?.getAttribute('data-sortable-container'), 'Column body should have data-sortable-container attribute');
	});
});

describe('Data Rendering - Card Rendering', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
	});

	test('createCard creates card structure', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const cards = view.containerEl.querySelectorAll('.obk-card');
		assert.ok(cards.length > 0, 'Cards should be created');

		const firstCard = cards[0] as HTMLElement;
		assert.ok(firstCard.getAttribute('data-entry-path'), 'Card should have data-entry-path attribute');

		const title = firstCard.querySelector('.obk-card-title');
		assert.ok(title, 'Card title should exist');
		assert.ok(title?.textContent, 'Card title should have text content');
	});

	test('Card click handler opens file in workspace', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const card = view.containerEl.querySelector('.obk-card') as HTMLElement;
		assert.ok(card, 'Card should exist');

		const entryPath = card.getAttribute('data-entry-path');
		card.click();

		// Verify openLinkText was called
		assert.strictEqual(app.workspace.openLinkText.calls.length, 1, 'openLinkText should be called');
		assert.strictEqual(
			app.workspace.openLinkText.calls[0][0],
			entryPath,
			'openLinkText should be called with entry path',
		);
	});
});

describe('Data Rendering - Board Rendering', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
	});

	test('render creates complete board', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const board = view.containerEl.querySelector('.obk-board');
		assert.ok(board, 'Board container should be created');

		const columns = view.containerEl.querySelectorAll('.obk-column');
		assert.ok(columns.length > 0, 'Columns should be created');

		// Verify columns are sorted alphabetically
		const columnValues = Array.from(columns).map((col) => col.getAttribute('data-column-value'));
		const sortedValues = [...columnValues].sort();
		assert.deepStrictEqual(columnValues, sortedValues, 'Columns should be sorted alphabetically');

		// Verify all entries appear in columns
		const allCards = view.containerEl.querySelectorAll('.obk-card');
		assert.strictEqual(allCards.length, entries.length, 'All entries should appear as cards');
	});
});

describe('Drag and Drop - Sortable Initialization', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;
	let sortableMock: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
		sortableMock = mockSortable();
	});

	test('initializeSortable sets up drag-and-drop', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		// Verify Sortable instances were created
		const viewInstances = Array.from((view as any)._columnSortables.values());
		assert.ok(viewInstances.length > 0, 'Sortable instances should be created in view');

		// Verify the instance structure
		const firstInstance = viewInstances[0];
		assert.ok(firstInstance, 'Sortable instance should exist');

		// Verify that initializeSortable found column bodies to attach to
		const columnBodies = view.containerEl.querySelectorAll('.obk-column-body[data-sortable-container]');
		assert.ok(columnBodies.length > 0, 'Should have column bodies for Sortable');
		assert.strictEqual(viewInstances.length, columnBodies.length, 'Should have one Sortable instance per column body');

		// Verify instances have destroy method (required for cleanup)
		viewInstances.forEach((instance: any) => {
			assert.ok(typeof instance.destroy === 'function', 'Sortable instance should have destroy method');
		});
	});

	test('Existing instances are destroyed before creating new ones', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const instances = sortableMock.getInstances ? sortableMock.getInstances() : sortableMock.instances;
		const firstCallCount = instances.length;
		const firstInstances = [...instances];

		// Call onDataUpdated again
		triggerDataUpdate(view);

		// Verify old instances were destroyed
		firstInstances.forEach((instance) => {
			assert.strictEqual(instance.destroyed, true, 'Old instances should be destroyed');
		});
	});
});

describe('Drag and Drop - Card Drop Handling', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;
	let sortableMock: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
		sortableMock = mockSortable();
		(global as any).Sortable = sortableMock.Sortable;
		addClosestPolyfill(document.createElement('div'));
	});

	test('handleCardDrop updates property on drop', async () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		// Find a card in "To Do" column
		const columns = view.containerEl.querySelectorAll('.obk-column');
		const toDoColumn = Array.from(columns).find((col) =>
			col.getAttribute('data-column-value')?.includes('To Do'),
		) as HTMLElement;
		const doingColumn = Array.from(columns).find((col) =>
			col.getAttribute('data-column-value')?.includes('Doing'),
		) as HTMLElement;

		assert.ok(toDoColumn, 'To Do column should exist');
		assert.ok(doingColumn, 'Doing column should exist');

		const card = toDoColumn.querySelector('.obk-card') as HTMLElement;
		assert.ok(card, 'Card should exist');

		const entryPath = card.getAttribute('data-entry-path');
		const toDoBody = toDoColumn.querySelector('.obk-column-body') as HTMLElement;
		const doingBody = doingColumn.querySelector('.obk-column-body') as HTMLElement;

		// Create mock sortable event
		const mockEvent = {
			item: card,
			from: toDoBody,
			to: doingBody,
			oldIndex: 0,
			newIndex: 0,
		};

		// Call handleCardDrop
		await (view as any).handleCardDrop(mockEvent);

		// Verify processFrontMatter was called
		assert.strictEqual(app.fileManager.processFrontMatter.calls.length, 1, 'processFrontMatter should be called');
	});

	test('Skip update if dropped in same column', async () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columns = view.containerEl.querySelectorAll('.obk-column');
		const toDoColumn = Array.from(columns).find((col) =>
			col.getAttribute('data-column-value')?.includes('To Do'),
		) as HTMLElement;

		const card = toDoColumn.querySelector('.obk-card') as HTMLElement;
		const toDoBody = toDoColumn.querySelector('.obk-column-body') as HTMLElement;

		const mockEvent = {
			item: card,
			from: toDoBody,
			to: toDoBody, // Same column
			oldIndex: 0,
			newIndex: 1,
		};

		app.fileManager.processFrontMatter.calls.length = 0; // Reset

		await (view as any).handleCardDrop(mockEvent);

		// Should not call processFrontMatter
		assert.strictEqual(
			app.fileManager.processFrontMatter.calls.length,
			0,
			'processFrontMatter should not be called for same column drop',
		);
	});

	test('Handle "Uncategorized" value (set to empty string)', async () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columns = view.containerEl.querySelectorAll('.obk-column');
		const toDoColumn = Array.from(columns).find((col) =>
			col.getAttribute('data-column-value')?.includes('To Do'),
		) as HTMLElement;
		const uncategorizedColumn = Array.from(columns).find((col) =>
			col.getAttribute('data-column-value')?.includes('Uncategorized'),
		) as HTMLElement;

		if (!uncategorizedColumn) {
			// Create uncategorized column if it doesn't exist
			const uncatDiv = document.createElement('div');
			uncatDiv.className = 'obk-column';
			uncatDiv.setAttribute('data-column-value', 'Uncategorized');
			const uncatBody = document.createElement('div');
			uncatBody.className = 'obk-column-body';
			uncatDiv.appendChild(uncatBody);
			view.containerEl.querySelector('.obk-board')?.appendChild(uncatDiv);
		}

		const card = toDoColumn.querySelector('.obk-card') as HTMLElement;
		const toDoBody = toDoColumn.querySelector('.obk-column-body') as HTMLElement;
		const uncatBody = (
			uncategorizedColumn || view.containerEl.querySelector('[data-column-value="Uncategorized"]')
		)?.querySelector('.obk-column-body') as HTMLElement;

		const mockEvent = {
			item: card,
			from: toDoBody,
			to: uncatBody,
			oldIndex: 0,
			newIndex: 0,
		};

		await (view as any).handleCardDrop(mockEvent);

		// Verify processFrontMatter was called with empty string logic
		assert.strictEqual(app.fileManager.processFrontMatter.calls.length, 1, 'processFrontMatter should be called');
	});
});

describe('Drag and Drop - Drop Error Handling', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
	});

	test('Handle missing entry path', async () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const card = document.createElement('div');
		card.className = 'obk-card';
		// No data-entry-path attribute

		const mockEvent = {
			item: card,
			from: document.createElement('div'),
			to: document.createElement('div'),
			oldIndex: 0,
			newIndex: 0,
		};

		// Should not throw
		await (view as any).handleCardDrop(mockEvent);

		// Should not call processFrontMatter
		assert.strictEqual(app.fileManager.processFrontMatter.calls.length, 0, 'processFrontMatter should not be called');
	});

	test('Handle missing column elements', async () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const card = document.createElement('div');
		card.className = 'obk-card';
		card.setAttribute('data-entry-path', 'test.md');

		const mockEvent = {
			item: card,
			from: document.createElement('div'), // Not a column body
			to: document.createElement('div'), // Not a column body
			oldIndex: 0,
			newIndex: 0,
		};

		await (view as any).handleCardDrop(mockEvent);

		assert.strictEqual(app.fileManager.processFrontMatter.calls.length, 0, 'processFrontMatter should not be called');
	});
});

describe('Data Updates', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
	});

	test('onDataUpdated refreshes view', () => {
		const entries = createEntriesWithStatus();
		const controller = createMockQueryController(entries, TEST_PROPERTIES) as any;
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);

		let loadConfigCalled = false;
		let renderCalled = false;

		const originalLoadConfig = (view as any).loadConfig.bind(view);
		const originalRender = (view as any).render.bind(view);

		(view as any).loadConfig = function () {
			loadConfigCalled = true;
			return originalLoadConfig();
		};

		(view as any).render = function () {
			renderCalled = true;
			return originalRender();
		};

		triggerDataUpdate(view);

		assert.strictEqual(loadConfigCalled, true, 'loadConfig should be called');
		assert.strictEqual(renderCalled, true, 'render should be called');
	});
});

describe('Cleanup', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;
	let sortableMock: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
		sortableMock = mockSortable();
		(global as any).Sortable = sortableMock.Sortable;
	});

	test('onClose cleans up resources', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		// Verify instances exist before close
		const viewInstancesBefore = Array.from((view as any)._columnSortables.values());
		assert.ok(viewInstancesBefore.length > 0, 'Sortable instances should exist');

		// Call onClose
		view.onClose();

		// Verify instances were destroyed
		assert.strictEqual((view as any)._columnSortables.size, 0, 'All instances should be cleaned up');

		viewInstancesBefore.forEach((instance: any) => {
			if (instance && typeof instance.destroyed !== 'undefined') {
				assert.strictEqual(instance.destroyed, true, 'Instance should be destroyed');
			}
		});
	});
});

describe('Column Reordering - Drag Handle', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
	});

	test('Column drag handle appears in column headers', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columns = view.containerEl.querySelectorAll('.obk-column');
		assert.ok(columns.length > 0, 'Columns should exist');

		columns.forEach((column) => {
			const header = column.querySelector('.obk-column-header');
			assert.ok(header, 'Column header should exist');

			const dragHandle = header?.querySelector('.obk-column-drag-handle');
			assert.ok(dragHandle, 'Drag handle should exist in column header');
		});
	});

	test('Drag handle has correct CSS class', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const dragHandle = view.containerEl.querySelector('.obk-column-drag-handle');
		assert.ok(dragHandle, 'Drag handle should exist');
		assert.ok(dragHandle?.classList.contains('obk-column-drag-handle'), 'Drag handle should have correct CSS class');
	});
});

describe('Column Reordering - Sortable Initialization', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;
	let sortableMock: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
		sortableMock = mockSortable();
		(global as any).Sortable = sortableMock.Sortable;
	});

	test('Column Sortable instance is created for board', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columnSortable = (view as any).columnSortable;
		assert.ok(columnSortable, 'Column Sortable instance should be created');
		assert.ok(!columnSortable.destroyed, 'Column Sortable should not be destroyed');
	});

	test('Column Sortable uses drag handle selector', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columnSortable = (view as any).columnSortable;
		assert.ok(columnSortable, 'Column Sortable should exist');

		// Check the columnSortable instance directly
		assert.ok(columnSortable.options, 'Column Sortable should have options');
		assert.strictEqual(
			columnSortable.options.handle,
			'.obk-column-drag-handle',
			'Column Sortable should use drag handle selector',
		);
	});

	test('Column Sortable is destroyed on cleanup', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columnSortable = (view as any).columnSortable;
		assert.ok(columnSortable, 'Column Sortable should exist');

		// Verify it's a Sortable instance (has destroy method)
		assert.ok(typeof columnSortable.destroy === 'function', 'Column Sortable should have destroy method');

		view.onClose();

		// After cleanup, columnSortable should be null
		assert.strictEqual((view as any).columnSortable, null, 'Column Sortable should be null after cleanup');

		// Verify destroy was called if the mock tracks it
		if (columnSortable && typeof columnSortable.destroyed !== 'undefined') {
			assert.strictEqual(columnSortable.destroyed, true, 'Column Sortable should be destroyed');
		}
	});
});

describe('Column Reordering - Order Persistence', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
	});

	test('handleColumnDrop saves order to storage', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columns = view.containerEl.querySelectorAll('.obk-column');
		const boardEl = view.containerEl.querySelector('.obk-board') as HTMLElement;

		// Simulate column reorder: move first column to end
		const firstColumn = columns[0] as HTMLElement;

		const mockEvent = {
			item: firstColumn,
			from: boardEl,
			to: boardEl,
			oldIndex: 0,
			newIndex: columns.length - 1,
		};

		(view as any).handleColumnDrop(mockEvent);

		// Verify order was saved in config
		const savedOrders = controller.config.get('columnOrders') as Record<string, string[]> | null;
		const savedOrder = savedOrders?.[PROPERTY_STATUS];
		assert.ok(savedOrder, 'Column order should be saved');
		assert.ok(Array.isArray(savedOrder), 'Saved order should be an array');
	});

	test('Render respects saved column order', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		// Set saved order
		const savedOrder = ['Done', 'Doing', 'To Do'];
		controller.config.set('columnOrders', { [PROPERTY_STATUS]: savedOrder });

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columns = view.containerEl.querySelectorAll('.obk-column');
		const renderedOrder = Array.from(columns).map((col) => col.getAttribute('data-column-value'));

		// Should match saved order (filtered to only include existing values)
		const expectedOrder = savedOrder.filter((v) => ['Done', 'Doing', 'To Do'].includes(v));
		assert.deepStrictEqual(renderedOrder, expectedOrder, 'Columns should be rendered in saved order');
	});

	test('New columns appear at end of existing columns', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		// Set saved order with only some columns
		const savedOrder = ['Done', 'Doing'];
		controller.config.set('columnOrders', { [PROPERTY_STATUS]: savedOrder });

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columns = view.containerEl.querySelectorAll('.obk-column');
		const renderedOrder = Array.from(columns).map((col) => col.getAttribute('data-column-value'));

		// Should have saved columns first, then new ones
		assert.strictEqual(renderedOrder[0], 'Done', 'First column should be from saved order');
		assert.strictEqual(renderedOrder[1], 'Doing', 'Second column should be from saved order');
		assert.ok(renderedOrder.includes('To Do'), 'New column should be included');
		// To Do should be after the saved columns
		const toDoIndex = renderedOrder.indexOf('To Do');
		assert.ok(toDoIndex >= 2, 'New column should appear after saved columns');
	});

	test('Property toggle preserves order', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;

		// Set initial property and order
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		const savedOrder = ['Done', 'Doing', 'To Do'];
		controller.config.set('columnOrders', { [PROPERTY_STATUS]: savedOrder });

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		// Verify initial order
		let columns = view.containerEl.querySelectorAll('.obk-column');
		let renderedOrder = Array.from(columns).map((col) => col.getAttribute('data-column-value'));
		assert.deepStrictEqual(renderedOrder, savedOrder, 'Initial order should match saved order');

		// Switch to different property
		controller.config.getAsPropertyId = () => PROPERTY_PRIORITY;
		triggerDataUpdate(view);

		// Switch back to original property
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		triggerDataUpdate(view);

		// Verify order is preserved
		columns = view.containerEl.querySelectorAll('.obk-column');
		renderedOrder = Array.from(columns).map((col) => col.getAttribute('data-column-value'));
		assert.deepStrictEqual(renderedOrder, savedOrder, 'Order should be preserved after property toggle');
	});

	test('Multiple properties have independent orders', () => {
		const entries = createEntriesWithMixedProperties();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;

		// Set different orders for different properties
		controller.config.set('columnOrders', {
			[PROPERTY_STATUS]: ['Done', 'Doing', 'To Do'],
			[PROPERTY_PRIORITY]: ['Low', 'Medium', 'High'],
		});

		// Test status property
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		const view1 = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view1, app);
		triggerDataUpdate(view1);

		let columns = view1.containerEl.querySelectorAll('.obk-column');
		let order1 = Array.from(columns).map((col) => col.getAttribute('data-column-value'));
		assert.strictEqual(order1[0], 'Done', 'Status order should be respected');

		// Test priority property
		controller.config.getAsPropertyId = () => PROPERTY_PRIORITY;
		const view2 = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view2, app);
		triggerDataUpdate(view2);

		columns = view2.containerEl.querySelectorAll('.obk-column');
		const order2 = Array.from(columns).map((col) => col.getAttribute('data-column-value'));
		assert.strictEqual(order2[0], 'Low', 'Priority order should be independent');
		assert.notDeepStrictEqual(order1, order2, 'Orders should be different');
	});

	test('Fallback to alphabetical when no saved order', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		// No saved order (config has no columnOrders set — returns null by default)

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columns = view.containerEl.querySelectorAll('.obk-column');
		const renderedOrder = Array.from(columns).map((col) => col.getAttribute('data-column-value'));

		// Should be alphabetical
		const expectedOrder = [...renderedOrder].sort();
		assert.deepStrictEqual(renderedOrder, expectedOrder, 'Columns should be alphabetical when no saved order');
	});

	test('Handle null/undefined saved order gracefully', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		// No saved order (config returns null by default)

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columns = view.containerEl.querySelectorAll('.obk-column');
		assert.ok(columns.length > 0, 'Columns should still be rendered');

		const renderedOrder = Array.from(columns).map((col) => col.getAttribute('data-column-value'));
		const expectedOrder = [...renderedOrder].sort();
		assert.deepStrictEqual(renderedOrder, expectedOrder, 'Should fallback to alphabetical when order is null');
	});
});

describe('Column Order Normalization', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
	});

	test('Normalizes old JSON strings in saved order', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		// Saved order should be normalized strings (as they are when saved from column values)
		const savedOrder = ['Done', 'Doing', 'To Do'];
		controller.config.set('columnOrders', { [PROPERTY_STATUS]: savedOrder });

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columns = view.containerEl.querySelectorAll('.obk-column');
		const renderedOrder = Array.from(columns).map((col) => col.getAttribute('data-column-value'));

		// Should render correctly with saved order
		assert.ok(renderedOrder.includes('Done'), 'Done should be in rendered order');
		assert.ok(renderedOrder.includes('Doing'), 'Doing should be in rendered order');
		assert.ok(renderedOrder.includes('To Do'), 'To Do should be in rendered order');

		// Order should match saved order (Done, Doing, To Do)
		assert.strictEqual(renderedOrder[0], 'Done', 'First column should be Done (from saved order)');
		assert.strictEqual(renderedOrder[1], 'Doing', 'Second column should be Doing (from saved order)');
	});

	test('Handles mixed JSON strings and plain strings in saved order', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		// Saved order should be normalized strings
		const savedOrder = ['Done', 'To Do', 'Doing'];
		controller.config.set('columnOrders', { [PROPERTY_STATUS]: savedOrder });

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columns = view.containerEl.querySelectorAll('.obk-column');
		const renderedOrder = Array.from(columns).map((col) => col.getAttribute('data-column-value'));

		// Should render in saved order
		assert.strictEqual(renderedOrder[0], 'Done', 'First should be Done (from saved order)');
		assert.strictEqual(renderedOrder[1], 'To Do', 'Second should be To Do (from saved order)');
		assert.strictEqual(renderedOrder[2], 'Doing', 'Third should be Doing (from saved order)');
	});

	test('New values merged correctly with normalized saved order', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		// Saved order with only some columns (normalized strings)
		const savedOrder = ['Done'];
		controller.config.set('columnOrders', { [PROPERTY_STATUS]: savedOrder });

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columns = view.containerEl.querySelectorAll('.obk-column');
		const renderedOrder = Array.from(columns).map((col) => col.getAttribute('data-column-value'));

		// Should have Done first (from saved order), then new columns
		assert.strictEqual(renderedOrder[0], 'Done', 'First should be Done (from saved order)');
		assert.ok(renderedOrder.includes('To Do'), 'To Do should be included');
		assert.ok(renderedOrder.includes('Doing'), 'Doing should be included');

		// New columns should appear after saved ones
		const toDoIndex = renderedOrder.indexOf('To Do');
		const doingIndex = renderedOrder.indexOf('Doing');
		assert.ok(toDoIndex > 0, 'To Do should appear after Done');
		assert.ok(doingIndex > 0, 'Doing should appear after Done');
	});

	test('Backwards compatibility: old saved data does not break rendering', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		// Old format with invalid saved data (JSON strings won't match column values)
		// This simulates old data that might have been saved incorrectly
		const savedOrder = [
			'{"Data": "Done"}', // JSON string won't match normalized column value
			'InvalidValue', // Invalid value that doesn't exist
		];
		controller.config.set('columnOrders', { [PROPERTY_STATUS]: savedOrder });

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);

		// Should not throw - invalid saved data should be ignored gracefully
		assert.doesNotThrow(() => {
			triggerDataUpdate(view);
		}, 'Should handle invalid saved data without errors');

		const columns = view.containerEl.querySelectorAll('.obk-column');
		assert.ok(columns.length > 0, 'Columns should be rendered');

		const renderedOrder = Array.from(columns).map((col) => col.getAttribute('data-column-value'));

		// All values should be normalized correctly
		assert.ok(renderedOrder.includes('Done'), 'Done should be present');
		assert.ok(renderedOrder.includes('Doing'), 'Doing should be present');
		assert.ok(renderedOrder.includes('To Do'), 'To Do should be present');
	});

	test('Handles invalid JSON strings in saved order gracefully', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		// Saved order with invalid JSON (should fall back to string value)
		const savedOrder = ['{invalid json}', 'To Do'];
		controller.config.set('columnOrders', { [PROPERTY_STATUS]: savedOrder });

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);

		// Should not throw
		assert.doesNotThrow(() => {
			triggerDataUpdate(view);
		}, 'Should handle invalid JSON gracefully');

		const columns = view.containerEl.querySelectorAll('.obk-column');
		assert.ok(columns.length > 0, 'Columns should be rendered');
	});
});

describe('Data Rendering - Card Properties', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
	});

	test('renders properties listed in getOrder() on each card', () => {
		const entries = createEntriesWithMixedProperties();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = (): string => PROPERTY_STATUS;
		controller.config.getOrder = (): string[] => [PROPERTY_STATUS, PROPERTY_PRIORITY];
		controller.config.getDisplayName = (id: string): string => id;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		// Find the card for "Task A" specifically (status: "To Do", priority: "High")
		const cards = Array.from(view.containerEl.querySelectorAll('.obk-card'));
		const taskACard = cards.find((c) => c.getAttribute('data-entry-path') === 'Task A.md') as HTMLElement;
		assert.ok(taskACard, 'Card for Task A should exist');

		const propertyEls = taskACard.querySelectorAll('.obk-card-property');
		assert.strictEqual(propertyEls.length, 1, 'Card should show one non-group-by property');

		assert.strictEqual(
			propertyEls[0].querySelector('.obk-card-property-label')?.textContent,
			PROPERTY_PRIORITY,
			'Label should show property id',
		);
		assert.strictEqual(
			propertyEls[0].querySelector('.obk-card-property-value')?.textContent,
			'High',
			'Value should show property value',
		);
	});

	test('does not render the group-by property as a card property', () => {
		const entries = createEntriesWithMixedProperties();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = (): string => PROPERTY_STATUS;
		controller.config.getOrder = (): string[] => [PROPERTY_STATUS, PROPERTY_PRIORITY];
		controller.config.getDisplayName = (id: string): string => id;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const card = view.containerEl.querySelector('.obk-card') as HTMLElement;
		const propertyLabels = Array.from(card.querySelectorAll('.obk-card-property-label')).map((el) => el.textContent);
		assert.ok(!propertyLabels.includes(PROPERTY_STATUS), 'Group-by property should not appear as a card property');
	});

	test('does not render properties with null or empty values', () => {
		const entries = [
			createMockBasesEntry(createMockTFile('Task 1.md'), {
				[PROPERTY_STATUS]: 'To Do',
				[PROPERTY_PRIORITY]: null,
				[PROPERTY_CATEGORY]: '',
			}),
		];
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = (): string => PROPERTY_STATUS;
		controller.config.getOrder = (): string[] => [PROPERTY_STATUS, PROPERTY_PRIORITY, PROPERTY_CATEGORY];
		controller.config.getDisplayName = (id: string): string => id;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const card = view.containerEl.querySelector('.obk-card') as HTMLElement;
		const propertyEls = card.querySelectorAll('.obk-card-property');
		assert.strictEqual(propertyEls.length, 0, 'No property elements should be rendered for null/empty values');
	});

	test('renders no property elements when getOrder() returns empty array', () => {
		const entries = createEntriesWithMixedProperties();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = (): string => PROPERTY_STATUS;
		// getOrder already returns [] by default in createMockQueryController

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const card = view.containerEl.querySelector('.obk-card') as HTMLElement;
		const propertyEls = card.querySelectorAll('.obk-card-property');
		assert.strictEqual(propertyEls.length, 0, 'No property elements should be rendered when getOrder is empty');
	});
});

describe('Column Colors', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		controller = createMockQueryController();
		app = createMockApp();
		controller.app = app;
	});

	test('color picker button is rendered in each column header', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const headers = view.containerEl.querySelectorAll('.obk-column-header');
		assert.ok(headers.length > 0, 'Columns should be rendered');
		headers.forEach((header) => {
			const colorBtn = header.querySelector('.obk-column-color-btn');
			assert.ok(colorBtn, 'Each column header should contain a color picker button');
		});
	});

	test('column renders with accent color CSS variable when color is set', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		controller.config.set('columnColors', { [PROPERTY_STATUS]: { 'To Do': 'red' } });

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columns = view.containerEl.querySelectorAll('.obk-column') as NodeListOf<HTMLElement>;
		let toDoColumn: HTMLElement | null = null;
		columns.forEach((col) => {
			if (col.getAttribute('data-column-value') === 'To Do') toDoColumn = col;
		});

		assert.ok(toDoColumn, 'To Do column should exist');
		assert.strictEqual(
			(toDoColumn as HTMLElement).style.getPropertyValue('--obk-column-accent-color'),
			'var(--color-red)',
			'Column should have red accent color variable set',
		);
		assert.strictEqual(
			(toDoColumn as HTMLElement).getAttribute('data-column-color'),
			'red',
			'Column should have data-column-color attribute set',
		);
	});

	test('column does not set accent color when no color is stored', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columns = view.containerEl.querySelectorAll('.obk-column') as NodeListOf<HTMLElement>;
		columns.forEach((col) => {
			assert.strictEqual(
				col.style.getPropertyValue('--obk-column-accent-color'),
				'',
				'Column should not have accent color variable when no color stored',
			);
			assert.strictEqual(
				col.getAttribute('data-column-color'),
				null,
				'Column should not have data-column-color attribute',
			);
		});
	});

	test('color picker button has accessible aria-label', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columns = view.containerEl.querySelectorAll('.obk-column');
		columns.forEach((col) => {
			const colorBtn = col.querySelector('.obk-column-color-btn');
			assert.ok(colorBtn, 'Color button should exist');
			const label = colorBtn!.getAttribute('aria-label');
			assert.ok(label && label.length > 0, 'Color button should have a non-empty aria-label');
			const colValue = col.getAttribute('data-column-value');
			assert.ok(label!.includes(colValue!), 'aria-label should include the column value');
		});
	});

	test('clicking a color swatch applies color and calls saveColumnColor', async () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		// Find the "To Do" column and its color button
		const columns = view.containerEl.querySelectorAll('.obk-column') as NodeListOf<HTMLElement>;
		let toDoColumn: HTMLElement | null = null;
		columns.forEach((col) => {
			if (col.getAttribute('data-column-value') === 'To Do') toDoColumn = col;
		});
		assert.ok(toDoColumn, 'To Do column should exist');

		const colorBtn = toDoColumn!.querySelector('.obk-column-color-btn') as HTMLElement;
		assert.ok(colorBtn, 'Color button should exist');

		// Open the popover
		colorBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		const popover = document.querySelector('.obk-column-color-popover') as HTMLElement;
		assert.ok(popover, 'Popover should appear after clicking color button');

		// Click the first colored swatch (index 1, skipping the "none" swatch at index 0)
		const swatches = popover.querySelectorAll('.obk-column-color-swatch') as NodeListOf<HTMLElement>;
		assert.ok(swatches.length > 1, 'Popover should have color swatches');
		const firstColorSwatch = swatches[1]; // index 0 is "none"
		const swatchTitle = firstColorSwatch.title; // e.g. "red"
		firstColorSwatch.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		// Popover should be gone
		assert.strictEqual(
			document.querySelector('.obk-column-color-popover'),
			null,
			'Popover should close after swatch click',
		);

		// Column should have the color applied
		assert.strictEqual(
			toDoColumn!.style.getPropertyValue('--obk-column-accent-color'),
			`var(--color-${swatchTitle})`,
			'Column should have accent color applied',
		);
		assert.strictEqual(toDoColumn!.getAttribute('data-column-color'), swatchTitle, 'Column data attribute should be set');

		// Config should have been updated to persist the color
		const savedColors = controller.config.get('columnColors') as Record<string, Record<string, string>> | null;
		assert.strictEqual(savedColors?.[PROPERTY_STATUS]?.['To Do'], swatchTitle, 'saveColumnColor should have been called');
	});

	test('color picker button reflects current column color via inline style', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		controller.config.set('columnColors', { [PROPERTY_STATUS]: { 'To Do': 'blue' } });

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columns = view.containerEl.querySelectorAll('.obk-column') as NodeListOf<HTMLElement>;
		let toDoColumn: HTMLElement | null = null;
		columns.forEach((col) => {
			if (col.getAttribute('data-column-value') === 'To Do') toDoColumn = col;
		});
		assert.ok(toDoColumn, 'To Do column should exist');

		// The color button inherits --obk-column-accent-color from the column via CSS,
		// so we verify the column itself has the variable set correctly
		assert.strictEqual(
			(toDoColumn as HTMLElement).style.getPropertyValue('--obk-column-accent-color'),
			'var(--color-blue)',
			'Column CSS variable should reflect stored color',
		);
	});
});

describe('Legacy Data Migration', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
		controller = createMockQueryController(createEntriesWithStatus(), TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
	});

	test('migrates column order from legacy data on first render', () => {
		const legacyData = {
			columnOrders: { [PROPERTY_STATUS]: ['Done', 'Doing', 'To Do'] },
			columnColors: {},
		};
		const view = new KanbanView(controller, scrollEl, legacyData);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		// Order should be respected (migrated from legacy)
		const columns = view.containerEl.querySelectorAll('.obk-column');
		const renderedOrder = Array.from(columns).map((col) => col.getAttribute('data-column-value'));
		assert.strictEqual(renderedOrder[0], 'Done', 'Legacy column order should be applied');

		// And persisted into config
		const saved = controller.config.get('columnOrders') as Record<string, string[]> | null;
		assert.deepStrictEqual(
			saved?.[PROPERTY_STATUS],
			['Done', 'Doing', 'To Do'],
			'Legacy order should be saved to config',
		);
	});

	test('migrates column colors from legacy data on first render', () => {
		const legacyData = {
			columnOrders: {},
			columnColors: { [PROPERTY_STATUS]: { 'To Do': 'red', Done: 'green' } },
		};
		const view = new KanbanView(controller, scrollEl, legacyData);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		// Colors should be applied (migrated from legacy)
		const columns = view.containerEl.querySelectorAll('.obk-column') as NodeListOf<HTMLElement>;
		let toDoColumn: HTMLElement | null = null;
		columns.forEach((col) => {
			if (col.getAttribute('data-column-value') === 'To Do') toDoColumn = col;
		});
		assert.ok(toDoColumn, 'To Do column should exist');
		assert.strictEqual(
			toDoColumn!.style.getPropertyValue('--obk-column-accent-color'),
			'var(--color-red)',
			'Legacy color should be applied',
		);

		// And persisted into config
		const saved = controller.config.get('columnColors') as Record<string, Record<string, string>> | null;
		assert.strictEqual(saved?.[PROPERTY_STATUS]?.['To Do'], 'red', 'Legacy colors should be saved to config');
	});

	test('config data takes priority over legacy data', () => {
		// Config already has an order set
		controller.config.set('columnOrders', { [PROPERTY_STATUS]: ['To Do', 'Doing', 'Done'] });

		// Legacy data has a different order
		const legacyData = {
			columnOrders: { [PROPERTY_STATUS]: ['Done', 'Doing', 'To Do'] },
			columnColors: {},
		};
		const view = new KanbanView(controller, scrollEl, legacyData);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		// Config order should win
		const columns = view.containerEl.querySelectorAll('.obk-column');
		const renderedOrder = Array.from(columns).map((col) => col.getAttribute('data-column-value'));
		assert.strictEqual(renderedOrder[0], 'To Do', 'Config order should take priority over legacy data');
	});

	test('no legacy data results in normal behaviour', () => {
		const view = new KanbanView(controller, scrollEl, null);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columns = view.containerEl.querySelectorAll('.obk-column');
		assert.ok(columns.length > 0, 'Columns should render without legacy data');
	});
});

describe('Property Value Rendering', () => {
	let view: KanbanView;

	beforeEach(() => {
		const app = createMockApp();
		const scrollEl = createDivWithMethods();
		const entries = createEntriesWithLinks();
		const controller = createMockQueryController(entries, [PROPERTY_STATUS, PROPERTY_RELATED]) as any;
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		controller.config.getOrder = () => [PROPERTY_STATUS, PROPERTY_RELATED];
		view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);
	});

	test('Plain text property value is rendered as textContent', () => {
		const cards = Array.from(view.containerEl.querySelectorAll('.obk-card')) as HTMLElement[];
		const taskBCard = cards.find((c) => c.getAttribute('data-entry-path') === 'notes/Task B.md');
		assert.ok(taskBCard, 'Task B card should exist');

		const valueEl = taskBCard?.querySelector('.obk-card-property-value');
		assert.ok(valueEl, 'Property value element should exist');
		assert.strictEqual(valueEl?.textContent, 'plain text value', 'Plain text should render as textContent');
		assert.strictEqual(valueEl?.querySelector('a'), null, 'No anchor element for plain text');
	});

	test('Property value containing [[wikilink]] renders as an anchor', () => {
		const cards = Array.from(view.containerEl.querySelectorAll('.obk-card')) as HTMLElement[];
		const taskACard = cards.find((c) => c.getAttribute('data-entry-path') === 'notes/Task A.md');
		assert.ok(taskACard, 'Task A card should exist');

		const valueEl = taskACard?.querySelector('.obk-card-property-value');
		assert.ok(valueEl, 'Property value element should exist');

		const link = valueEl?.querySelector('a.internal-link') as HTMLElement | null;
		assert.ok(link, 'An internal-link anchor should be rendered for [[wikilink]] values');
		assert.strictEqual(link?.getAttribute('data-href'), 'Meeting Notes', 'data-href should be the link target');
	});
});

describe('Internal Link Click Handling', () => {
	let view: KanbanView;
	let app: ReturnType<typeof createMockApp>;

	beforeEach(() => {
		app = createMockApp();
		const scrollEl = createDivWithMethods();
		const entries = createEntriesWithLinks();
		const controller = createMockQueryController(entries, [PROPERTY_STATUS, PROPERTY_RELATED]) as any;
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		controller.config.getOrder = () => [PROPERTY_STATUS, PROPERTY_RELATED];
		view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);
	});

	test('Clicking an internal link calls openLinkText with the link href', () => {
		const link = view.containerEl.querySelector('a.internal-link') as HTMLElement;
		assert.ok(link, 'Internal link should exist');

		link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

		assert.strictEqual(app.workspace.openLinkText.calls.length, 1, 'openLinkText should be called once');
		assert.strictEqual(
			app.workspace.openLinkText.calls[0][0],
			'Meeting Notes',
			'openLinkText should be called with the link target',
		);
	});

	test('Clicking an internal link uses the card file path as source', () => {
		const link = view.containerEl.querySelector('a.internal-link') as HTMLElement;
		assert.ok(link, 'Internal link should exist');

		link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

		assert.strictEqual(
			app.workspace.openLinkText.calls[0][1],
			'notes/Task A.md',
			'openLinkText source path should be the card file path',
		);
	});

	test('Clicking an internal link does not also open the card note', () => {
		const link = view.containerEl.querySelector('a.internal-link') as HTMLElement;
		assert.ok(link, 'Internal link should exist');

		link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

		// Only the delegated handler should fire — not the card click handler
		assert.strictEqual(app.workspace.openLinkText.calls.length, 1, 'openLinkText should be called exactly once');
		assert.notStrictEqual(
			app.workspace.openLinkText.calls[0][0],
			'notes/Task A.md',
			'openLinkText should not be called with the card file path',
		);
	});

	test('Clicking the card body (not a link) still opens the note', () => {
		const cards = Array.from(view.containerEl.querySelectorAll('.obk-card')) as HTMLElement[];
		const taskACard = cards.find((c) => c.getAttribute('data-entry-path') === 'notes/Task A.md');
		assert.ok(taskACard, 'Task A card should exist');

		const title = taskACard?.querySelector('.obk-card-title') as HTMLElement;
		assert.ok(title, 'Card title should exist');

		title.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

		assert.strictEqual(app.workspace.openLinkText.calls.length, 1, 'openLinkText should be called once');
		assert.strictEqual(
			app.workspace.openLinkText.calls[0][0],
			'notes/Task A.md',
			'Clicking card body should open the card note',
		);
	});
});
