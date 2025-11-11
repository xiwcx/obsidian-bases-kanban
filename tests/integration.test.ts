import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { KanbanView } from '../src/kanbanView.ts';
import {
	setupTestEnvironment,
	createDivWithMethods,
	createMockQueryController,
	createMockApp,
	mockSortable,
	addClosestPolyfill,
	createMockBasesEntry,
	createMockTFile,
	setupKanbanViewWithApp,
} from './helpers.ts';
import {
	createEntriesWithStatus,
	createEntriesWithMixedProperties,
	PROPERTY_STATUS,
	PROPERTY_PRIORITY,
	TEST_PROPERTIES,
} from './fixtures.ts';

setupTestEnvironment();

describe('Integration Tests - Full Workflow', () => {
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

	test('Complete kanban workflow', async () => {
		// Initialize view with mock data
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		view.onDataUpdated();

		// Verify board is rendered with multiple columns
		const board = view.containerEl.querySelector('.kanban-board');
		assert.ok(board, 'Board should be rendered');

		const columns = view.containerEl.querySelectorAll('.kanban-column');
		assert.ok(columns.length >= 2, 'Should have multiple columns');

		// Verify entries are in correct columns
		const toDoColumn = Array.from(columns).find((col) =>
			col.getAttribute('data-column-value')?.includes('To Do')
		);
		assert.ok(toDoColumn, 'To Do column should exist');
		const toDoCards = toDoColumn?.querySelectorAll('.kanban-card');
		assert.strictEqual(toDoCards?.length, 2, 'To Do should have 2 cards');

		// Simulate drag-and-drop operation
		const doingColumn = Array.from(columns).find((col) =>
			col.getAttribute('data-column-value')?.includes('Doing')
		) as HTMLElement;
		assert.ok(doingColumn, 'Doing column should exist');

		const card = toDoColumn?.querySelector('.kanban-card') as HTMLElement;
		const entryPath = card.getAttribute('data-entry-path');
		const toDoBody = toDoColumn?.querySelector('.kanban-column-body') as HTMLElement;
		const doingBody = doingColumn.querySelector('.kanban-column-body') as HTMLElement;

		const mockEvent = {
			item: card,
			from: toDoBody,
			to: doingBody,
			oldIndex: 0,
			newIndex: 0,
		};

		// Perform drop
		await (view as any).handleCardDrop(mockEvent);

		// Verify property is updated
		assert.strictEqual(
			app.fileManager.processFrontMatter.calls.length,
			1,
			'processFrontMatter should be called'
		);

		// Verify the call arguments
		const callArgs = app.fileManager.processFrontMatter.calls[0];
		assert.ok(callArgs, 'processFrontMatter should have been called');
		
		// The first argument should be the file
		const fileArg = callArgs[0];
		assert.ok(fileArg, 'File should be passed to processFrontMatter');
	});

	test('View updates automatically after property change', async () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		view.onDataUpdated();

		// Get initial state
		const initialColumns = view.containerEl.querySelectorAll('.kanban-column');
		const toDoColumn = Array.from(initialColumns).find((col) =>
			col.getAttribute('data-column-value')?.includes('To Do')
		);
		const initialToDoCount = toDoColumn?.querySelectorAll('.kanban-card').length || 0;

		// Simulate property update by modifying entry data
		// In a real scenario, this would happen via file system change
		// For testing, we'll simulate by updating the entry's property value
		const entry = entries[0];
		(entry as any).getValue = (propId: string) => {
			if (propId === PROPERTY_STATUS) {
				return 'Doing'; // Changed from 'To Do'
			}
			return null;
		};

		// Trigger data update
		view.onDataUpdated();

		// Verify view re-rendered
		const updatedColumns = view.containerEl.querySelectorAll('.kanban-column');
		const updatedToDoColumn = Array.from(updatedColumns).find((col) =>
			col.getAttribute('data-column-value')?.includes('To Do')
		);
		const updatedToDoCount = updatedToDoColumn?.querySelectorAll('.kanban-card').length || 0;

		// To Do should have one less card
		assert.strictEqual(
			updatedToDoCount,
			initialToDoCount - 1,
			'To Do column should have one less card after update'
		);
	});
});

describe('Integration Tests - Property Selection', () => {
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

	test('Changing group by property updates view', () => {
		const entries = createEntriesWithMixedProperties();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;

		const view = new KanbanView(controller, scrollEl);

		// First, use STATUS property
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		view.onDataUpdated();

		const statusColumns = view.containerEl.querySelectorAll('.kanban-column');
		const statusColumnValues = Array.from(statusColumns).map((col) =>
			col.getAttribute('data-column-value')
		);
		
		// Verify STATUS-based columns exist
		assert.ok(
			statusColumnValues.some((val) => val?.includes('To Do')),
			'Should have To Do column based on STATUS'
		);
		assert.ok(
			statusColumnValues.some((val) => val?.includes('Doing')),
			'Should have Doing column based on STATUS'
		);

		// Now change to PRIORITY property
		controller.config.getAsPropertyId = () => PROPERTY_PRIORITY;
		view.onDataUpdated();

		const priorityColumns = view.containerEl.querySelectorAll('.kanban-column');
		const priorityColumnValues = Array.from(priorityColumns).map((col) =>
			col.getAttribute('data-column-value')
		);

		// Verify PRIORITY-based columns exist
		assert.ok(
			priorityColumnValues.some((val) => val?.includes('High')),
			'Should have High column based on PRIORITY'
		);
		assert.ok(
			priorityColumnValues.some((val) => val?.includes('Medium')),
			'Should have Medium column based on PRIORITY'
		);
		assert.ok(
			priorityColumnValues.some((val) => val?.includes('Low')),
			'Should have Low column based on PRIORITY'
		);

		// Verify entries are regrouped correctly
		const allCards = view.containerEl.querySelectorAll('.kanban-card');
		assert.strictEqual(allCards.length, entries.length, 'All entries should be present');
	});

	test('Entries are regrouped correctly when property changes', () => {
		const entries = createEntriesWithMixedProperties();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;

		const view = new KanbanView(controller, scrollEl);

		// Use STATUS property
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		view.onDataUpdated();

		const statusCards = view.containerEl.querySelectorAll('.kanban-card');
		const statusCardCount = statusCards.length;

		// Change to PRIORITY property
		controller.config.getAsPropertyId = () => PROPERTY_PRIORITY;
		view.onDataUpdated();

		const priorityCards = view.containerEl.querySelectorAll('.kanban-card');
		const priorityCardCount = priorityCards.length;

		// Card count should remain the same (all entries should still be present)
		assert.strictEqual(
			statusCardCount,
			priorityCardCount,
			'Card count should remain the same after property change'
		);
		assert.strictEqual(
			priorityCardCount,
			entries.length,
			'All entries should be present'
		);
	});
});

describe('Integration Tests - Multiple Views', () => {
	let app: any;
	let sortableMock: any;

	beforeEach(() => {
		app = createMockApp();
		sortableMock = mockSortable();
		(global as any).Sortable = sortableMock.Sortable;
	});

	test('Multiple instances work independently', () => {
		const entries1 = createEntriesWithStatus();
		const entries2 = createEntriesWithMixedProperties();

		const controller1 = createMockQueryController(entries1, TEST_PROPERTIES) as any;
		controller1.app = app;
		controller1.config.getAsPropertyId = () => PROPERTY_STATUS;

		const controller2 = createMockQueryController(entries2, TEST_PROPERTIES) as any;
		controller2.app = app;
		controller2.config.getAsPropertyId = () => PROPERTY_PRIORITY;

		const scrollEl1 = createDivWithMethods();
		const scrollEl2 = createDivWithMethods();

		const view1 = new KanbanView(controller1, scrollEl1);
		const view2 = new KanbanView(controller2, scrollEl2);
		setupKanbanViewWithApp(view1, app);
		setupKanbanViewWithApp(view2, app);

		view1.onDataUpdated();
		view2.onDataUpdated();

		// Verify each view maintains its own state
		assert.notStrictEqual(view1.containerEl, view2.containerEl, 'Views should have different containers');
		assert.notStrictEqual(view1.scrollEl, view2.scrollEl, 'Views should have different scroll elements');

		// Verify each view renders correctly
		const board1 = view1.containerEl.querySelector('.kanban-board');
		const board2 = view2.containerEl.querySelector('.kanban-board');
		assert.ok(board1, 'View1 should have board');
		assert.ok(board2, 'View2 should have board');

		// Verify different column counts (different properties)
		const columns1 = view1.containerEl.querySelectorAll('.kanban-column');
		const columns2 = view2.containerEl.querySelectorAll('.kanban-column');
		assert.ok(columns1.length > 0, 'View1 should have columns');
		assert.ok(columns2.length > 0, 'View2 should have columns');

		// Verify groupByPropertyId is independent
		assert.strictEqual(
			(view1 as any).groupByPropertyId,
			PROPERTY_STATUS,
			'View1 should have STATUS property'
		);
		assert.strictEqual(
			(view2 as any).groupByPropertyId,
			PROPERTY_PRIORITY,
			'View2 should have PRIORITY property'
		);
	});

	test('Cleanup does not affect other instances', () => {
		const entries = createEntriesWithStatus();
		const controller1 = createMockQueryController(entries, TEST_PROPERTIES) as any;
		controller1.app = app;
		controller1.config.getAsPropertyId = () => PROPERTY_STATUS;

		const controller2 = createMockQueryController(entries, TEST_PROPERTIES) as any;
		controller2.app = app;
		controller2.config.getAsPropertyId = () => PROPERTY_STATUS;

		const scrollEl1 = createDivWithMethods();
		const scrollEl2 = createDivWithMethods();

		const view1 = new KanbanView(controller1, scrollEl1);
		const view2 = new KanbanView(controller2, scrollEl2);
		setupKanbanViewWithApp(view1, app);
		setupKanbanViewWithApp(view2, app);

		view1.onDataUpdated();
		view2.onDataUpdated();

		const instancesBeforeClose = sortableMock.instances.length;

		// Close view1
		view1.onClose();

		// Verify view2 still works
		const board2 = view2.containerEl.querySelector('.kanban-board');
		assert.ok(board2, 'View2 should still have board after view1 cleanup');

		// Verify view2's Sortable instances are still active
		// (In real scenario, each view would have its own instances, but our mock shares them)
		// For this test, we verify that view2 can still render
		view2.onDataUpdated();
		const board2After = view2.containerEl.querySelector('.kanban-board');
		assert.ok(board2After, 'View2 should still render after view1 cleanup');
	});
});

describe('Integration Tests - Edge Cases', () => {
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

	test('Handles rapid property changes', () => {
		const entries = createEntriesWithMixedProperties();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;

		const view = new KanbanView(controller, scrollEl);

		// Rapidly change properties
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		view.onDataUpdated();

		controller.config.getAsPropertyId = () => PROPERTY_PRIORITY;
		view.onDataUpdated();

		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		view.onDataUpdated();

		// Should not crash and should render correctly
		const board = view.containerEl.querySelector('.kanban-board');
		assert.ok(board, 'Board should be rendered after rapid changes');
	});

	test('Handles entries with missing properties gracefully', () => {
		// Create entries where some don't have the selected property
		const entry1 = createMockBasesEntry(createMockTFile('Task1.md'), { [PROPERTY_STATUS]: 'To Do' });
		const entry2 = createMockBasesEntry(createMockTFile('Task2.md'), {}); // No status
		const entry3 = createMockBasesEntry(createMockTFile('Task3.md'), { [PROPERTY_STATUS]: 'Done' });

		const entries = [entry1, entry2, entry3];
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		view.onDataUpdated();

		// Should render without errors
		const board = view.containerEl.querySelector('.kanban-board');
		assert.ok(board, 'Board should be rendered');

		// Entry without property should go to Uncategorized
		const uncategorizedColumn = Array.from(
			view.containerEl.querySelectorAll('.kanban-column')
		).find((col) => col.getAttribute('data-column-value')?.includes('Uncategorized'));

		assert.ok(uncategorizedColumn, 'Uncategorized column should exist');
		const uncategorizedCards = uncategorizedColumn?.querySelectorAll('.kanban-card');
		assert.ok(uncategorizedCards && uncategorizedCards.length >= 1, 'Should have at least one uncategorized card');
	});
});

