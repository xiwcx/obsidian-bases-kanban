import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import type { BasesPropertyId } from 'obsidian';
import { KanbanView } from '../src/kanbanView.ts';
import {
	setupTestEnvironment,
	createDivWithMethods,
	createMockQueryController,
	createMockApp,
	mockSortable,
	addClosestPolyfill,
	setupKanbanViewWithApp,
} from './helpers.ts';
import {
	createEntriesWithStatus,
	createEntriesWithEmptyValues,
	createEmptyEntries,
	createEntriesWithMixedProperties,
	PROPERTY_STATUS,
	PROPERTY_PRIORITY,
	TEST_PROPERTIES,
} from './fixtures.ts';

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
		assert.strictEqual(
			view.containerEl.className,
			'kanban-view-container',
			'containerEl should have correct class'
		);
		assert.strictEqual(view.scrollEl, scrollEl, 'scrollEl reference should be stored');
		assert.strictEqual(
			(view as any).groupByPropertyId,
			null,
			'groupByPropertyId should be null initially'
		);
		assert.strictEqual(
			(view as any).sortableInstances.length,
			0,
			'sortableInstances array should be empty'
		);
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
		view.onDataUpdated();

		assert.strictEqual(
			(view as any).groupByPropertyId,
			testPropertyId,
			'groupByPropertyId should be set from config'
		);
	});

	test('loadConfig handles null/undefined config values', () => {
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);

		// Mock config.getAsPropertyId to return null
		controller.config.getAsPropertyId = (): BasesPropertyId | null => null;

		view.onDataUpdated();

		assert.strictEqual(
			(view as any).groupByPropertyId,
			null,
			'groupByPropertyId should remain null when config returns null'
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
		view.onDataUpdated();

		const emptyState = view.containerEl.querySelector('.kanban-empty-state');
		assert.ok(emptyState, 'Empty state element should exist');
		assert.ok(
			emptyState?.textContent?.includes('No entries found'),
			'Empty state should show "No entries found" message'
		);
	});

	test('Renders empty state when no properties', () => {
		const controllerNoProps = createMockQueryController([], []) as any; // Empty properties array
		controllerNoProps.app = app;
		const view = new KanbanView(controllerNoProps, scrollEl);
		setupKanbanViewWithApp(view, app);

		// Set a property ID that doesn't exist in the empty properties list
		controllerNoProps.config.getAsPropertyId = () => PROPERTY_STATUS;
		view.onDataUpdated();

		const emptyState = view.containerEl.querySelector('.kanban-empty-state');
		assert.ok(emptyState, 'Empty state element should exist');
		// The code will try to use the first available property, but since there are none,
		// it should show the "No properties found" message
		assert.ok(
			emptyState?.textContent?.includes('No properties found') || 
			emptyState?.textContent?.includes('No entries found'),
			'Empty state should show appropriate message when no properties available'
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
		view.onDataUpdated();

		// Check that columns were created
		const columns = view.containerEl.querySelectorAll('.kanban-column');
		assert.ok(columns.length > 0, 'Columns should be created');

		// Verify "To Do" column has 2 entries
		const toDoColumn = Array.from(columns).find((col) =>
			col.getAttribute('data-column-value')?.includes('To Do')
		);
		assert.ok(toDoColumn, 'To Do column should exist');
		const toDoCards = toDoColumn?.querySelectorAll('.kanban-card');
		assert.strictEqual(toDoCards?.length, 2, 'To Do column should have 2 cards');
	});

	test('Handles null/undefined property values (map to Uncategorized)', () => {
		const entries = createEntriesWithEmptyValues();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		view.onDataUpdated();

		// Check for Uncategorized column
		const columns = view.containerEl.querySelectorAll('.kanban-column');
		const uncategorizedColumn = Array.from(columns).find((col) =>
			col.getAttribute('data-column-value')?.includes('Uncategorized')
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
		view.onDataUpdated();

		const columns = view.containerEl.querySelectorAll('.kanban-column');
		const uncategorizedColumn = Array.from(columns).find((col) =>
			col.getAttribute('data-column-value')?.includes('Uncategorized')
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
		view.onDataUpdated();

		const columns = view.containerEl.querySelectorAll('.kanban-column');
		assert.ok(columns.length > 0, 'Columns should be created');

		const firstColumn = columns[0] as HTMLElement;
		assert.ok(
			firstColumn.getAttribute('data-column-value'),
			'Column should have data-column-value attribute'
		);

		const header = firstColumn.querySelector('.kanban-column-header');
		assert.ok(header, 'Column header should exist');

		const title = header?.querySelector('.kanban-column-title');
		assert.ok(title, 'Column title should exist');

		const count = header?.querySelector('.kanban-column-count');
		assert.ok(count, 'Column count should exist');

		const body = firstColumn.querySelector('.kanban-column-body');
		assert.ok(body, 'Column body should exist');
		assert.ok(
			body?.getAttribute('data-sortable-container'),
			'Column body should have data-sortable-container attribute'
		);
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
		view.onDataUpdated();

		const cards = view.containerEl.querySelectorAll('.kanban-card');
		assert.ok(cards.length > 0, 'Cards should be created');

		const firstCard = cards[0] as HTMLElement;
		assert.ok(
			firstCard.getAttribute('data-entry-path'),
			'Card should have data-entry-path attribute'
		);

		const title = firstCard.querySelector('.kanban-card-title');
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
		view.onDataUpdated();

		const card = view.containerEl.querySelector('.kanban-card') as HTMLElement;
		assert.ok(card, 'Card should exist');

		const entryPath = card.getAttribute('data-entry-path');
		card.click();

		// Verify openLinkText was called
		assert.strictEqual(app.workspace.openLinkText.calls.length, 1, 'openLinkText should be called');
		assert.strictEqual(
			app.workspace.openLinkText.calls[0][0],
			entryPath,
			'openLinkText should be called with entry path'
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
		view.onDataUpdated();

		const board = view.containerEl.querySelector('.kanban-board');
		assert.ok(board, 'Board container should be created');

		const columns = view.containerEl.querySelectorAll('.kanban-column');
		assert.ok(columns.length > 0, 'Columns should be created');

		// Verify columns are sorted alphabetically
		const columnValues = Array.from(columns).map((col) =>
			col.getAttribute('data-column-value')
		);
		const sortedValues = [...columnValues].sort();
		assert.deepStrictEqual(
			columnValues,
			sortedValues,
			'Columns should be sorted alphabetically'
		);

		// Verify all entries appear in columns
		const allCards = view.containerEl.querySelectorAll('.kanban-card');
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
		view.onDataUpdated();

		// Verify Sortable instances were created
		// The view stores instances in sortableInstances array
		const viewInstances = (view as any).sortableInstances || [];
		assert.ok(viewInstances.length > 0, 'Sortable instances should be created in view');
		
		// Verify that initializeSortable was called by checking we have instances
		// The fact that instances exist means Sortable constructor was called
		// which means initializeSortable set up drag-and-drop correctly
		
		// Verify the instance structure
		const firstInstance = viewInstances[0];
		assert.ok(firstInstance, 'Sortable instance should exist');
		
		// Verify that initializeSortable found column bodies to attach to
		// This is the key functionality - it should find all .kanban-column-body elements
		const columnBodies = view.containerEl.querySelectorAll('.kanban-column-body[data-sortable-container]');
		assert.ok(columnBodies.length > 0, 'Should have column bodies for Sortable');
		assert.strictEqual(
			viewInstances.length,
			columnBodies.length,
			'Should have one Sortable instance per column body'
		);
		
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
		view.onDataUpdated();

		const instances = sortableMock.getInstances ? sortableMock.getInstances() : sortableMock.instances;
		const firstCallCount = instances.length;
		const firstInstances = [...instances];

		// Call onDataUpdated again
		view.onDataUpdated();

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
		view.onDataUpdated();

		// Find a card in "To Do" column
		const columns = view.containerEl.querySelectorAll('.kanban-column');
		const toDoColumn = Array.from(columns).find((col) =>
			col.getAttribute('data-column-value')?.includes('To Do')
		) as HTMLElement;
		const doingColumn = Array.from(columns).find((col) =>
			col.getAttribute('data-column-value')?.includes('Doing')
		) as HTMLElement;

		assert.ok(toDoColumn, 'To Do column should exist');
		assert.ok(doingColumn, 'Doing column should exist');

		const card = toDoColumn.querySelector('.kanban-card') as HTMLElement;
		assert.ok(card, 'Card should exist');

		const entryPath = card.getAttribute('data-entry-path');
		const toDoBody = toDoColumn.querySelector('.kanban-column-body') as HTMLElement;
		const doingBody = doingColumn.querySelector('.kanban-column-body') as HTMLElement;

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
		assert.strictEqual(
			app.fileManager.processFrontMatter.calls.length,
			1,
			'processFrontMatter should be called'
		);
	});

	test('Skip update if dropped in same column', async () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		view.onDataUpdated();

		const columns = view.containerEl.querySelectorAll('.kanban-column');
		const toDoColumn = Array.from(columns).find((col) =>
			col.getAttribute('data-column-value')?.includes('To Do')
		) as HTMLElement;

		const card = toDoColumn.querySelector('.kanban-card') as HTMLElement;
		const toDoBody = toDoColumn.querySelector('.kanban-column-body') as HTMLElement;

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
			'processFrontMatter should not be called for same column drop'
		);
	});

	test('Handle "Uncategorized" value (set to empty string)', async () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		view.onDataUpdated();

		const columns = view.containerEl.querySelectorAll('.kanban-column');
		const toDoColumn = Array.from(columns).find((col) =>
			col.getAttribute('data-column-value')?.includes('To Do')
		) as HTMLElement;
		const uncategorizedColumn = Array.from(columns).find((col) =>
			col.getAttribute('data-column-value')?.includes('Uncategorized')
		) as HTMLElement;

		if (!uncategorizedColumn) {
			// Create uncategorized column if it doesn't exist
			const uncatDiv = document.createElement('div');
			uncatDiv.className = 'kanban-column';
			uncatDiv.setAttribute('data-column-value', 'Uncategorized');
			const uncatBody = document.createElement('div');
			uncatBody.className = 'kanban-column-body';
			uncatDiv.appendChild(uncatBody);
			view.containerEl.querySelector('.kanban-board')?.appendChild(uncatDiv);
		}

		const card = toDoColumn.querySelector('.kanban-card') as HTMLElement;
		const toDoBody = toDoColumn.querySelector('.kanban-column-body') as HTMLElement;
		const uncatBody = (uncategorizedColumn || view.containerEl.querySelector('[data-column-value="Uncategorized"]'))?.querySelector('.kanban-column-body') as HTMLElement;

		const mockEvent = {
			item: card,
			from: toDoBody,
			to: uncatBody,
			oldIndex: 0,
			newIndex: 0,
		};

		await (view as any).handleCardDrop(mockEvent);

		// Verify processFrontMatter was called with empty string logic
		assert.strictEqual(
			app.fileManager.processFrontMatter.calls.length,
			1,
			'processFrontMatter should be called'
		);
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
		view.onDataUpdated();

		const card = document.createElement('div');
		card.className = 'kanban-card';
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
		assert.strictEqual(
			app.fileManager.processFrontMatter.calls.length,
			0,
			'processFrontMatter should not be called'
		);
	});

	test('Handle missing column elements', async () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		view.onDataUpdated();

		const card = document.createElement('div');
		card.className = 'kanban-card';
		card.setAttribute('data-entry-path', 'test.md');

		const mockEvent = {
			item: card,
			from: document.createElement('div'), // Not a column body
			to: document.createElement('div'), // Not a column body
			oldIndex: 0,
			newIndex: 0,
		};

		await (view as any).handleCardDrop(mockEvent);

		assert.strictEqual(
			app.fileManager.processFrontMatter.calls.length,
			0,
			'processFrontMatter should not be called'
		);
	});
});

describe('Error Handling - Error Display', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
	});

	test('displayError shows error UI', () => {
		const controller = createMockQueryController([], []) as any;
		controller.app = app;
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);

		const error = new Error('Test error');
		const stack = 'Error: Test error\n    at test.js:1:1';

		(view as any).displayError('Test error message', stack);

		const errorContainer = view.containerEl.querySelector('.kanban-error-container');
		assert.ok(errorContainer, 'Error container should exist');

		const errorHeader = errorContainer?.querySelector('.kanban-error-header');
		assert.ok(errorHeader, 'Error header should exist');

		const errorIcon = errorHeader?.querySelector('.kanban-error-icon');
		assert.ok(errorIcon, 'Error icon should exist');

		const errorTitle = errorHeader?.querySelector('.kanban-error-title');
		assert.ok(errorTitle, 'Error title should exist');
		assert.ok(
			errorTitle?.textContent?.includes('Kanban View Error'),
			'Error title should match'
		);

		const errorMessage = errorContainer?.querySelector('.kanban-error-message');
		assert.ok(errorMessage, 'Error message should exist');
		assert.ok(
			errorMessage?.textContent?.includes('Test error message'),
			'Error message should match'
		);
	});

	test('Stack trace toggle works (show/hide)', () => {
		const controller = createMockQueryController([], []) as any;
		controller.app = app;
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);

		const stack = 'Error: Test error\n    at test.js:1:1';
		(view as any).displayError('Test error message', stack);

		const stackToggle = view.containerEl.querySelector('.kanban-error-stack-toggle') as HTMLElement;
		const stackContent = view.containerEl.querySelector('.kanban-error-stack') as HTMLElement;

		assert.ok(stackToggle, 'Stack toggle should exist');
		assert.ok(stackContent, 'Stack content should exist');

		// Initially hidden
		assert.strictEqual(stackContent.style.display, 'none', 'Stack should be hidden initially');

		// Click to show
		stackToggle.click();
		assert.strictEqual(stackContent.style.display, 'block', 'Stack should be visible after click');

		// Click to hide
		stackToggle.click();
		assert.strictEqual(stackContent.style.display, 'none', 'Stack should be hidden after second click');
	});

	test('Retry button triggers onDataUpdated', () => {
		const controller = createMockQueryController([], []) as any;
		controller.app = app;
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);

		// Set up spy on onDataUpdated
		let onDataUpdatedCalled = false;
		const originalOnDataUpdated = view.onDataUpdated.bind(view);
		view.onDataUpdated = function() {
			onDataUpdatedCalled = true;
			return originalOnDataUpdated();
		};

		(view as any).displayError('Test error message');

		const retryButton = view.containerEl.querySelector('.kanban-error-retry') as HTMLElement;
		assert.ok(retryButton, 'Retry button should exist');

		retryButton.click();

		assert.strictEqual(onDataUpdatedCalled, true, 'onDataUpdated should be called on retry');
	});
});

describe('Error Handling - Error Context', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
	});

	test('handleError logs errors correctly', () => {
		const controller = createMockQueryController([], []) as any;
		controller.app = app;
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);

		const originalConsoleError = console.error;
		const errorLogs: string[] = [];
		console.error = (...args: any[]) => {
			errorLogs.push(args.join(' '));
		};

		const error = new Error('Test error');
		error.stack = 'Error: Test error\n    at test.js:1:1';

		(view as any).handleError(error, 'testContext');

		// Restore console.error
		console.error = originalConsoleError;

		assert.strictEqual((view as any).lastError, error, 'lastError should be stored');
		assert.ok(errorLogs.length > 0, 'Error should be logged to console');
		assert.ok(
			errorLogs.some((log) => log.includes('testContext')),
			'Error log should include context'
		);
	});
});

describe('Error Handling - Error Recovery', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
	});

	test('Render skips when lastError exists', () => {
		const entries = createEntriesWithStatus();
		const controller = createMockQueryController(entries, TEST_PROPERTIES) as any;
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		
		// Set an error
		(view as any).lastError = new Error('Test error');
		
		// Clear container to verify render doesn't add content
		view.containerEl.innerHTML = '';
		
		(view as any).render();

		// Container should remain empty (or have error display)
		const board = view.containerEl.querySelector('.kanban-board');
		assert.strictEqual(board, null, 'Board should not be rendered when error exists');
	});

	test('Retry clears error and re-renders', () => {
		const entries = createEntriesWithStatus();
		const controller = createMockQueryController(entries, TEST_PROPERTIES) as any;
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		
		// Set an error and display it
		const error = new Error('Test error');
		(view as any).handleError(error, 'test');
		
		// Clear the error for retry
		(view as any).lastError = null;
		
		// Simulate retry
		view.onDataUpdated();

		// Should render board now
		const board = view.containerEl.querySelector('.kanban-board');
		assert.ok(board, 'Board should be rendered after retry');
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
		
		(view as any).loadConfig = function() {
			loadConfigCalled = true;
			return originalLoadConfig();
		};
		
		(view as any).render = function() {
			renderCalled = true;
			return originalRender();
		};

		view.onDataUpdated();

		assert.strictEqual(loadConfigCalled, true, 'loadConfig should be called');
		assert.strictEqual(renderCalled, true, 'render should be called');
	});

	test('onDataUpdated handles errors', () => {
		const controller = createMockQueryController([], []) as any;
		controller.app = app;
		
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		
		// Make loadConfig throw
		(view as any).loadConfig = function() {
			throw new Error('Config error');
		};

		view.onDataUpdated();

		// Should have error displayed
		const errorContainer = view.containerEl.querySelector('.kanban-error-container');
		assert.ok(errorContainer, 'Error should be displayed');
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
		view.onDataUpdated();

		// Verify instances exist - check view's internal array
		const viewInstancesBefore = (view as any).sortableInstances || [];
		assert.ok(viewInstancesBefore.length > 0, 'Sortable instances should exist');

		// Call onClose
		view.onClose();

		// Verify instances were destroyed - check view's internal array
		const viewInstancesAfter = (view as any).sortableInstances || [];
		assert.strictEqual(viewInstancesAfter.length, 0, 'All instances should be cleaned up');
		
		// Also verify they were destroyed if we can access them
		viewInstancesBefore.forEach((instance: any) => {
			if (instance && typeof instance.destroyed !== 'undefined') {
				assert.strictEqual(instance.destroyed, true, 'Instance should be destroyed');
			}
		});

		// Verify array is cleared
		assert.strictEqual(
			(view as any).sortableInstances.length,
			0,
			'sortableInstances array should be cleared'
		);
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
		view.onDataUpdated();

		const columns = view.containerEl.querySelectorAll('.kanban-column');
		assert.ok(columns.length > 0, 'Columns should exist');

		columns.forEach((column) => {
			const header = column.querySelector('.kanban-column-header');
			assert.ok(header, 'Column header should exist');
			
			const dragHandle = header?.querySelector('.kanban-column-drag-handle');
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
		view.onDataUpdated();

		const dragHandle = view.containerEl.querySelector('.kanban-column-drag-handle');
		assert.ok(dragHandle, 'Drag handle should exist');
		assert.ok(
			dragHandle?.classList.contains('kanban-column-drag-handle'),
			'Drag handle should have correct CSS class'
		);
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
		view.onDataUpdated();

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
		view.onDataUpdated();

		const columnSortable = (view as any).columnSortable;
		assert.ok(columnSortable, 'Column Sortable should exist');
		
		// Check the columnSortable instance directly
		assert.ok(columnSortable.options, 'Column Sortable should have options');
		assert.strictEqual(
			columnSortable.options.handle,
			'.kanban-column-drag-handle',
			'Column Sortable should use drag handle selector'
		);
	});

	test('Column Sortable is destroyed on cleanup', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		view.onDataUpdated();

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
	let mockPlugin: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
		mockPlugin = {
			columnOrders: {},
			async saveColumnOrder(propertyId: string, order: string[]) {
				this.columnOrders[propertyId] = order;
			},
			getColumnOrder(propertyId: string): string[] | null {
				return this.columnOrders[propertyId] || null;
			},
		};
		// Mock plugin access
		(app as any).plugins = {
			plugins: {
				'kanban-bases-view': mockPlugin,
			},
		};
	});

	test('handleColumnDrop saves order to storage', async () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		view.onDataUpdated();

		const columns = view.containerEl.querySelectorAll('.kanban-column');
		const boardEl = view.containerEl.querySelector('.kanban-board') as HTMLElement;
		
		// Simulate column reorder: move first column to end
		const firstColumn = columns[0] as HTMLElement;
		const lastColumn = columns[columns.length - 1] as HTMLElement;

		const mockEvent = {
			item: firstColumn,
			from: boardEl,
			to: boardEl,
			oldIndex: 0,
			newIndex: columns.length - 1,
		};

		await (view as any).handleColumnDrop(mockEvent);

		// Verify order was saved
		const savedOrder = mockPlugin.getColumnOrder(PROPERTY_STATUS);
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
		mockPlugin.columnOrders[PROPERTY_STATUS] = savedOrder;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		view.onDataUpdated();

		const columns = view.containerEl.querySelectorAll('.kanban-column');
		const renderedOrder = Array.from(columns).map((col) =>
			col.getAttribute('data-column-value')
		);

		// Should match saved order (filtered to only include existing values)
		const expectedOrder = savedOrder.filter(v => 
			['Done', 'Doing', 'To Do'].includes(v)
		);
		assert.deepStrictEqual(
			renderedOrder,
			expectedOrder,
			'Columns should be rendered in saved order'
		);
	});

	test('New columns appear at end of existing columns', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		// Set saved order with only some columns
		const savedOrder = ['Done', 'Doing'];
		mockPlugin.columnOrders[PROPERTY_STATUS] = savedOrder;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		view.onDataUpdated();

		const columns = view.containerEl.querySelectorAll('.kanban-column');
		const renderedOrder = Array.from(columns).map((col) =>
			col.getAttribute('data-column-value')
		);

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
		mockPlugin.columnOrders[PROPERTY_STATUS] = savedOrder;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		view.onDataUpdated();

		// Verify initial order
		let columns = view.containerEl.querySelectorAll('.kanban-column');
		let renderedOrder = Array.from(columns).map((col) =>
			col.getAttribute('data-column-value')
		);
		assert.deepStrictEqual(renderedOrder, savedOrder, 'Initial order should match saved order');

		// Switch to different property
		controller.config.getAsPropertyId = () => PROPERTY_PRIORITY;
		view.onDataUpdated();

		// Switch back to original property
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		view.onDataUpdated();

		// Verify order is preserved
		columns = view.containerEl.querySelectorAll('.kanban-column');
		renderedOrder = Array.from(columns).map((col) =>
			col.getAttribute('data-column-value')
		);
		assert.deepStrictEqual(
			renderedOrder,
			savedOrder,
			'Order should be preserved after property toggle'
		);
	});

	test('Multiple properties have independent orders', () => {
		const entries = createEntriesWithMixedProperties();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;

		// Set different orders for different properties
		mockPlugin.columnOrders[PROPERTY_STATUS] = ['Done', 'Doing', 'To Do'];
		mockPlugin.columnOrders[PROPERTY_PRIORITY] = ['Low', 'Medium', 'High'];

		// Test status property
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		const view1 = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view1, app);
		view1.onDataUpdated();

		let columns = view1.containerEl.querySelectorAll('.kanban-column');
		let order1 = Array.from(columns).map((col) =>
			col.getAttribute('data-column-value')
		);
		assert.strictEqual(order1[0], 'Done', 'Status order should be respected');

		// Test priority property
		controller.config.getAsPropertyId = () => PROPERTY_PRIORITY;
		const view2 = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view2, app);
		view2.onDataUpdated();

		columns = view2.containerEl.querySelectorAll('.kanban-column');
		const order2 = Array.from(columns).map((col) =>
			col.getAttribute('data-column-value')
		);
		assert.strictEqual(order2[0], 'Low', 'Priority order should be independent');
		assert.notDeepStrictEqual(order1, order2, 'Orders should be different');
	});

	test('Fallback to alphabetical when no saved order', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		// No saved order
		mockPlugin.columnOrders = {};

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		view.onDataUpdated();

		const columns = view.containerEl.querySelectorAll('.kanban-column');
		const renderedOrder = Array.from(columns).map((col) =>
			col.getAttribute('data-column-value')
		);

		// Should be alphabetical
		const expectedOrder = [...renderedOrder].sort();
		assert.deepStrictEqual(
			renderedOrder,
			expectedOrder,
			'Columns should be alphabetical when no saved order'
		);
	});

	test('Handle null/undefined saved order gracefully', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		// Mock getColumnOrder to return null
		mockPlugin.getColumnOrder = (): string[] | null => null;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		view.onDataUpdated();

		const columns = view.containerEl.querySelectorAll('.kanban-column');
		assert.ok(columns.length > 0, 'Columns should still be rendered');
		
		const renderedOrder = Array.from(columns).map((col) =>
			col.getAttribute('data-column-value')
		);
		const expectedOrder = [...renderedOrder].sort();
		assert.deepStrictEqual(
			renderedOrder,
			expectedOrder,
			'Should fallback to alphabetical when order is null'
		);
	});
});

