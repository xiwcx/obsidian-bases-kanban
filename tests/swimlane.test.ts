import assert from 'node:assert';
import { beforeEach, describe, test } from 'node:test';
import type { BasesEntry } from 'obsidian';
import { KanbanView } from '../src/kanbanView.ts';
import { CSS_CLASSES, DATA_ATTRIBUTES, UNCATEGORIZED_LABEL } from '../src/constants.ts';
import {
	addClosestPolyfill,
	createDivWithMethods,
	createMockApp,
	createMockBasesEntry,
	createMockTFile,
	createMockQueryController,
	mockSortable,
	setupKanbanViewWithApp,
	setupTestEnvironment,
	triggerDataUpdate,
} from './helpers.ts';
import { PROPERTY_PRIORITY, PROPERTY_STATUS, TEST_PROPERTIES } from './fixtures.ts';

setupTestEnvironment();

// CSS.escape is used when syncing column order across swimlane boards.
// Provide a no-op polyfill if jsdom hasn't exposed it as a global.
if (typeof (global as any).CSS === 'undefined') {
	(global as any).CSS = { escape: (s: string) => s };
}

// ── Fixtures ────────────────────────────────────────────────────────────────

/**
 * 5 entries across 2 swimlane values (priority) × 2 column values (status):
 *   High / To Do  → Task 1, Task 5
 *   High / Done   → Task 2
 *   Low  / To Do  → Task 3
 *   Low  / Done   → Task 4
 */
function createSwimlaneEntries(): BasesEntry[] {
	return [
		createMockBasesEntry(createMockTFile('Task 1.md'), {
			[PROPERTY_STATUS]: 'To Do',
			[PROPERTY_PRIORITY]: 'High',
		}),
		createMockBasesEntry(createMockTFile('Task 2.md'), {
			[PROPERTY_STATUS]: 'Done',
			[PROPERTY_PRIORITY]: 'High',
		}),
		createMockBasesEntry(createMockTFile('Task 3.md'), {
			[PROPERTY_STATUS]: 'To Do',
			[PROPERTY_PRIORITY]: 'Low',
		}),
		createMockBasesEntry(createMockTFile('Task 4.md'), {
			[PROPERTY_STATUS]: 'Done',
			[PROPERTY_PRIORITY]: 'Low',
		}),
		createMockBasesEntry(createMockTFile('Task 5.md'), {
			[PROPERTY_STATUS]: 'To Do',
			[PROPERTY_PRIORITY]: 'High',
		}),
	];
}

function setupSwimlaneController(entries: BasesEntry[], groupBy = PROPERTY_STATUS, swimlaneBy = PROPERTY_PRIORITY) {
	const controller = createMockQueryController(entries, TEST_PROPERTIES) as any;
	controller.config.getAsPropertyId = (key: string) => {
		if (key === 'groupByProperty') return groupBy;
		if (key === 'swimlaneByProperty') return swimlaneBy;
		return null;
	};
	return controller;
}

// ── DOM Structure ────────────────────────────────────────────────────────────

describe('Swimlane Rendering - DOM Structure', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
		mockSortable();
		(global as any).Sortable = mockSortable().Sortable;
		addClosestPolyfill(document.createElement('div'));
	});

	test('Board gets swimlane modifier class when swimlane property is set', () => {
		controller = setupSwimlaneController(createSwimlaneEntries());
		controller.app = app;
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const board = view.containerEl.querySelector(`.${CSS_CLASSES.BOARD}`);
		assert.ok(board, 'Board should exist');
		assert.ok(board.classList.contains(CSS_CLASSES.BOARD_SWIMLANE), 'Board should have swimlane modifier class');
	});

	test('Flat board class is used when no swimlane property is set', () => {
		controller = createMockQueryController(createSwimlaneEntries(), TEST_PROPERTIES) as any;
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const board = view.containerEl.querySelector(`.${CSS_CLASSES.BOARD}`);
		assert.ok(board, 'Board should exist');
		assert.ok(
			!board.classList.contains(CSS_CLASSES.BOARD_SWIMLANE),
			'Board should NOT have swimlane modifier class in flat mode',
		);
	});

	test('One swimlane row per unique swimlane property value', () => {
		controller = setupSwimlaneController(createSwimlaneEntries());
		controller.app = app;
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const swimlanes = view.containerEl.querySelectorAll(`.${CSS_CLASSES.SWIMLANE}`);
		assert.strictEqual(swimlanes.length, 2, 'Should have 2 swimlane rows (High and Low)');
	});

	test('Each swimlane row has a data-swimlane-value attribute', () => {
		controller = setupSwimlaneController(createSwimlaneEntries());
		controller.app = app;
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const swimlanes = Array.from(view.containerEl.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.SWIMLANE}`));
		const values = swimlanes.map((sl) => sl.getAttribute(DATA_ATTRIBUTES.SWIMLANE_VALUE));
		assert.ok(values.includes('High'), 'High swimlane should exist');
		assert.ok(values.includes('Low'), 'Low swimlane should exist');
	});

	test('Each swimlane has a header with drag handle, title, and count', () => {
		controller = setupSwimlaneController(createSwimlaneEntries());
		controller.app = app;
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const swimlanes = view.containerEl.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.SWIMLANE}`);
		swimlanes.forEach((slEl) => {
			const header = slEl.querySelector(`.${CSS_CLASSES.SWIMLANE_HEADER}`);
			assert.ok(header, 'Swimlane should have a header');

			const dragHandle = header!.querySelector(`.${CSS_CLASSES.SWIMLANE_DRAG_HANDLE}`);
			assert.ok(dragHandle, 'Header should have a drag handle');

			const title = header!.querySelector(`.${CSS_CLASSES.SWIMLANE_TITLE}`);
			assert.ok(title, 'Header should have a title');

			const count = header!.querySelector(`.${CSS_CLASSES.SWIMLANE_COUNT}`);
			assert.ok(count, 'Header should have a count badge');
		});
	});

	test('Each swimlane has an inner board containing columns', () => {
		controller = setupSwimlaneController(createSwimlaneEntries());
		controller.app = app;
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const swimlanes = view.containerEl.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.SWIMLANE}`);
		swimlanes.forEach((slEl) => {
			const innerBoard = slEl.querySelector(`.${CSS_CLASSES.SWIMLANE_BOARD}`);
			assert.ok(innerBoard, 'Swimlane should have an inner board');

			const columns = innerBoard!.querySelectorAll(`.${CSS_CLASSES.COLUMN}`);
			assert.ok(columns.length > 0, 'Inner board should have columns');
		});
	});

	test('Swimlane count badge reflects number of entries in that row', () => {
		controller = setupSwimlaneController(createSwimlaneEntries());
		controller.app = app;
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const highSwimlane = Array.from(view.containerEl.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.SWIMLANE}`)).find(
			(sl) => sl.getAttribute(DATA_ATTRIBUTES.SWIMLANE_VALUE) === 'High',
		);

		assert.ok(highSwimlane, 'High swimlane should exist');
		const count = highSwimlane!.querySelector(`.${CSS_CLASSES.SWIMLANE_COUNT}`);
		assert.strictEqual(count?.textContent, '3', 'High swimlane should show 3 cards (Task 1, 2, 5)');
	});
});

// ── Card Placement ───────────────────────────────────────────────────────────

describe('Swimlane Rendering - Card Placement', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
		(global as any).Sortable = mockSortable().Sortable;
	});

	test('Cards appear in the correct swimlane row and column', () => {
		controller = setupSwimlaneController(createSwimlaneEntries());
		controller.app = app;
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		// High / To Do should have 2 cards
		const highSwimlane = view.containerEl.querySelector<HTMLElement>(`[${DATA_ATTRIBUTES.SWIMLANE_VALUE}="High"]`)!;
		const highToDoBody = highSwimlane.querySelector<HTMLElement>(
			`[${DATA_ATTRIBUTES.COLUMN_VALUE}="To Do"] .${CSS_CLASSES.COLUMN_BODY}`,
		);
		assert.ok(highToDoBody, 'High / To Do column body should exist');
		assert.strictEqual(
			highToDoBody!.querySelectorAll(`.${CSS_CLASSES.CARD}`).length,
			2,
			'High / To Do should have 2 cards (Task 1 and Task 5)',
		);

		// Low / Done should have 1 card
		const lowSwimlane = view.containerEl.querySelector<HTMLElement>(`[${DATA_ATTRIBUTES.SWIMLANE_VALUE}="Low"]`)!;
		const lowDoneBody = lowSwimlane.querySelector<HTMLElement>(
			`[${DATA_ATTRIBUTES.COLUMN_VALUE}="Done"] .${CSS_CLASSES.COLUMN_BODY}`,
		);
		assert.ok(lowDoneBody, 'Low / Done column body should exist');
		assert.strictEqual(
			lowDoneBody!.querySelectorAll(`.${CSS_CLASSES.CARD}`).length,
			1,
			'Low / Done should have 1 card (Task 4)',
		);
	});

	test('Total card count matches total number of entries', () => {
		const entries = createSwimlaneEntries();
		controller = setupSwimlaneController(entries);
		controller.app = app;
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const allCards = view.containerEl.querySelectorAll(`.${CSS_CLASSES.CARD}`);
		assert.strictEqual(allCards.length, entries.length, 'All entries should be rendered as cards');
	});

	test('Entry with missing swimlane property goes to Uncategorized swimlane', () => {
		const entries: BasesEntry[] = [
			createMockBasesEntry(createMockTFile('Task A.md'), { [PROPERTY_STATUS]: 'To Do', [PROPERTY_PRIORITY]: 'High' }),
			createMockBasesEntry(createMockTFile('Task B.md'), { [PROPERTY_STATUS]: 'To Do' }), // no priority
		];
		controller = setupSwimlaneController(entries);
		controller.app = app;
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const uncategorizedSwimlane = view.containerEl.querySelector<HTMLElement>(
			`[${DATA_ATTRIBUTES.SWIMLANE_VALUE}="${UNCATEGORIZED_LABEL}"]`,
		);
		assert.ok(uncategorizedSwimlane, 'Uncategorized swimlane should be created for missing property');

		const cards = uncategorizedSwimlane!.querySelectorAll(`.${CSS_CLASSES.CARD}`);
		assert.strictEqual(cards.length, 1, 'Uncategorized swimlane should have exactly 1 card');
	});
});

// ── Column Alignment ─────────────────────────────────────────────────────────

describe('Swimlane Rendering - Shared Column Set', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
		(global as any).Sortable = mockSortable().Sortable;
	});

	test('All swimlane rows show the same set of columns', () => {
		controller = setupSwimlaneController(createSwimlaneEntries());
		controller.app = app;
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const swimlanes = Array.from(view.containerEl.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.SWIMLANE}`));
		assert.ok(swimlanes.length >= 2, 'Should have at least 2 swimlanes');

		const getColumnValues = (sl: HTMLElement) =>
			Array.from(sl.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.COLUMN}`))
				.map((col) => col.getAttribute(DATA_ATTRIBUTES.COLUMN_VALUE))
				.sort();

		const firstRowColumns = getColumnValues(swimlanes[0]);
		for (let i = 1; i < swimlanes.length; i++) {
			assert.deepStrictEqual(
				getColumnValues(swimlanes[i]),
				firstRowColumns,
				`Swimlane row ${i} should have the same columns as row 0`,
			);
		}
	});

	test('Remove button is not shown on columns in swimlane mode', () => {
		const entries: BasesEntry[] = [
			createMockBasesEntry(createMockTFile('Task 1.md'), {
				[PROPERTY_STATUS]: 'To Do',
				[PROPERTY_PRIORITY]: 'High',
			}),
			// "Done" column exists only in High, not in Low — but still shown in Low (empty)
		];
		controller = setupSwimlaneController(entries);
		controller.app = app;
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const removeBtns = view.containerEl.querySelectorAll(`.${CSS_CLASSES.COLUMN_REMOVE_BTN}`);
		assert.strictEqual(removeBtns.length, 0, 'No remove buttons should appear in swimlane mode');
	});

	test('Swimlane property hidden from card body properties', () => {
		const entries: BasesEntry[] = [
			createMockBasesEntry(createMockTFile('Task 1.md'), {
				[PROPERTY_STATUS]: 'To Do',
				[PROPERTY_PRIORITY]: 'High',
			}),
		];
		controller = setupSwimlaneController(entries);
		controller.app = app;
		// Make both properties visible on the card
		controller.config.getOrder = () => [PROPERTY_STATUS, PROPERTY_PRIORITY];
		controller.config.getDisplayName = (id: string) => id;
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		// The card should not show the swimlane property (PROPERTY_PRIORITY) as a body row
		const card = view.containerEl.querySelector<HTMLElement>(`.${CSS_CLASSES.CARD}`);
		assert.ok(card, 'Card should exist');
		const propLabels = Array.from(card!.querySelectorAll(`.${CSS_CLASSES.CARD_PROPERTY_LABEL}`)).map(
			(el) => el.textContent,
		);
		assert.ok(!propLabels.includes(PROPERTY_PRIORITY), 'Swimlane property should be hidden from card body');
		assert.ok(!propLabels.includes(PROPERTY_STATUS), 'Group-by property should also be hidden from card body');
	});
});

// ── Mode Guards ──────────────────────────────────────────────────────────────

describe('Swimlane Mode - Activation Guards', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
		(global as any).Sortable = mockSortable().Sortable;
	});

	test('Flat mode is used when swimlane property equals group-by property', () => {
		const entries = createSwimlaneEntries();
		controller = createMockQueryController(entries, TEST_PROPERTIES) as any;
		controller.app = app;
		// Same property for both group-by and swimlane-by
		controller.config.getAsPropertyId = (key: string) => {
			if (key === 'groupByProperty') return PROPERTY_STATUS;
			if (key === 'swimlaneByProperty') return PROPERTY_STATUS; // same!
			return null;
		};
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const board = view.containerEl.querySelector(`.${CSS_CLASSES.BOARD}`)!;
		assert.ok(!board.classList.contains(CSS_CLASSES.BOARD_SWIMLANE), 'Should use flat mode when properties are equal');

		const swimlanes = view.containerEl.querySelectorAll(`.${CSS_CLASSES.SWIMLANE}`);
		assert.strictEqual(swimlanes.length, 0, 'No swimlane rows should be rendered');
	});

	test('Switching from flat to swimlane mode re-renders the board', () => {
		const entries = createSwimlaneEntries();

		// Start in flat mode
		controller = createMockQueryController(entries, TEST_PROPERTIES) as any;
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		assert.strictEqual(
			view.containerEl.querySelectorAll(`.${CSS_CLASSES.SWIMLANE}`).length,
			0,
			'No swimlane rows in flat mode',
		);

		// Switch to swimlane mode
		controller.config.getAsPropertyId = (key: string) => {
			if (key === 'groupByProperty') return PROPERTY_STATUS;
			if (key === 'swimlaneByProperty') return PROPERTY_PRIORITY;
			return null;
		};
		triggerDataUpdate(view);

		assert.ok(
			view.containerEl.querySelectorAll(`.${CSS_CLASSES.SWIMLANE}`).length > 0,
			'Swimlane rows should appear after switching to swimlane mode',
		);
	});

	test('Switching from swimlane to flat mode re-renders the board', () => {
		const entries = createSwimlaneEntries();

		// Start in swimlane mode
		controller = setupSwimlaneController(entries);
		controller.app = app;
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		assert.ok(
			view.containerEl.querySelectorAll(`.${CSS_CLASSES.SWIMLANE}`).length > 0,
			'Should be in swimlane mode initially',
		);

		// Switch to flat mode
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		triggerDataUpdate(view);

		assert.strictEqual(
			view.containerEl.querySelectorAll(`.${CSS_CLASSES.SWIMLANE}`).length,
			0,
			'Swimlane rows should be gone after switching to flat mode',
		);
		assert.ok(
			view.containerEl.querySelectorAll(`.${CSS_CLASSES.COLUMN}`).length > 0,
			'Regular columns should exist in flat mode',
		);
	});
});

// ── Column Ordering ───────────────────────────────────────────────────────────

describe('Swimlane Drag and Drop - Column Order Sync', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
		(global as any).Sortable = mockSortable().Sortable;
	});

	test('Dragging a column in one swimlane updates _prefs.columnOrder', () => {
		controller = setupSwimlaneController(createSwimlaneEntries());
		controller.app = app;
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const swimlaneBoards = Array.from(view.containerEl.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.SWIMLANE_BOARD}`));
		assert.ok(swimlaneBoards.length >= 2, 'Should have at least 2 swimlane boards');

		const firstBoard = swimlaneBoards[0];
		const columns = Array.from(firstBoard.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.COLUMN}`));
		const originalOrder = columns.map((col) => col.getAttribute(DATA_ATTRIBUTES.COLUMN_VALUE));

		// Reverse column order in the first board's DOM
		[...columns].reverse().forEach((col) => firstBoard.appendChild(col));

		// Trigger the column drop handler
		(view as any).handleColumnDropForSwimlane({}, firstBoard);

		const expectedOrder = [...originalOrder].reverse();
		assert.deepStrictEqual(
			(view as any)._prefs.columnOrder,
			expectedOrder,
			'_prefs.columnOrder should reflect the new column order',
		);
	});

	test('Dragging a column in one swimlane syncs order to all other rows', () => {
		controller = setupSwimlaneController(createSwimlaneEntries());
		controller.app = app;
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const swimlaneBoards = Array.from(view.containerEl.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.SWIMLANE_BOARD}`));
		const firstBoard = swimlaneBoards[0];
		const secondBoard = swimlaneBoards[1];

		// Reverse columns in the first board
		const columns = Array.from(firstBoard.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.COLUMN}`));
		[...columns].reverse().forEach((col) => firstBoard.appendChild(col));

		(view as any).handleColumnDropForSwimlane({}, firstBoard);

		// The second board should now have the same column order as the first board
		const firstBoardOrder = Array.from(firstBoard.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.COLUMN}`)).map((col) =>
			col.getAttribute(DATA_ATTRIBUTES.COLUMN_VALUE),
		);
		const secondBoardOrder = Array.from(secondBoard.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.COLUMN}`)).map((col) =>
			col.getAttribute(DATA_ATTRIBUTES.COLUMN_VALUE),
		);
		assert.deepStrictEqual(secondBoardOrder, firstBoardOrder, 'Second board should have same column order as first');
	});
});

// ── Swimlane Row Ordering ────────────────────────────────────────────────────

describe('Swimlane Drag and Drop - Row Order', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
		(global as any).Sortable = mockSortable().Sortable;
	});

	test('Dragging a swimlane row persists the new swimlane order', () => {
		controller = setupSwimlaneController(createSwimlaneEntries());
		controller.app = app;
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const board = view.containerEl.querySelector<HTMLElement>(`.${CSS_CLASSES.BOARD}`)!;
		const swimlanes = Array.from(board.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.SWIMLANE}`));
		assert.strictEqual(swimlanes.length, 2, 'Should have 2 swimlane rows');

		// Reverse swimlane row order in DOM
		[...swimlanes].reverse().forEach((sl) => board.appendChild(sl));

		(view as any).handleSwimlaneDrop({});

		const expectedOrder = [...swimlanes].reverse().map((sl) => sl.getAttribute(DATA_ATTRIBUTES.SWIMLANE_VALUE));
		assert.deepStrictEqual(
			(view as any)._swimlanePrefs.swimlaneOrder,
			expectedOrder,
			'_swimlanePrefs.swimlaneOrder should reflect the new row order',
		);
	});

	test('Swimlane order is persisted to config after row drag', () => {
		controller = setupSwimlaneController(createSwimlaneEntries());
		controller.app = app;
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const board = view.containerEl.querySelector<HTMLElement>(`.${CSS_CLASSES.BOARD}`)!;
		const swimlanes = Array.from(board.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.SWIMLANE}`));
		[...swimlanes].reverse().forEach((sl) => board.appendChild(sl));

		(view as any).handleSwimlaneDrop({});

		// Config should have been updated
		const savedOrders = controller.config.get('swimlaneOrders');
		assert.ok(savedOrders, 'swimlaneOrders should be saved to config');
		const savedOrder = (savedOrders as any)[PROPERTY_PRIORITY];
		assert.ok(Array.isArray(savedOrder), 'Should have an array order for the swimlane property');
		assert.deepStrictEqual(
			savedOrder,
			(view as any)._swimlanePrefs.swimlaneOrder,
			'Config order should match in-memory prefs',
		);
	});
});

// ── Card Drag and Drop ───────────────────────────────────────────────────────

describe('Swimlane Drag and Drop - Card Drop', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
		(global as any).Sortable = mockSortable().Sortable;
	});

	test('Same swimlane, same column — only updates card order (no frontmatter write)', async () => {
		controller = setupSwimlaneController(createSwimlaneEntries());
		controller.app = app;
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const highSwimlane = view.containerEl.querySelector<HTMLElement>(`[${DATA_ATTRIBUTES.SWIMLANE_VALUE}="High"]`)!;
		const todoBody = highSwimlane.querySelector<HTMLElement>(
			`[${DATA_ATTRIBUTES.COLUMN_VALUE}="To Do"] .${CSS_CLASSES.COLUMN_BODY}`,
		)!;
		const card = todoBody.querySelector<HTMLElement>(`.${CSS_CLASSES.CARD}`)!;

		await (view as any).handleCardDrop({ item: card, from: todoBody, to: todoBody, oldIndex: 0, newIndex: 1 });

		assert.strictEqual(
			app.fileManager.processFrontMatter.calls.length,
			0,
			'processFrontMatter should NOT be called for a same-column reorder',
		);
	});

	test('Same swimlane, different column — only column property updated in frontmatter', async () => {
		controller = setupSwimlaneController(createSwimlaneEntries());
		controller.app = app;
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const highSwimlane = view.containerEl.querySelector<HTMLElement>(`[${DATA_ATTRIBUTES.SWIMLANE_VALUE}="High"]`)!;
		const todoBody = highSwimlane.querySelector<HTMLElement>(
			`[${DATA_ATTRIBUTES.COLUMN_VALUE}="To Do"] .${CSS_CLASSES.COLUMN_BODY}`,
		)!;
		const doneBody = highSwimlane.querySelector<HTMLElement>(
			`[${DATA_ATTRIBUTES.COLUMN_VALUE}="Done"] .${CSS_CLASSES.COLUMN_BODY}`,
		)!;
		const card = todoBody.querySelector<HTMLElement>(`.${CSS_CLASSES.CARD}`)!;

		await (view as any).handleCardDrop({ item: card, from: todoBody, to: doneBody, oldIndex: 0, newIndex: 0 });

		assert.strictEqual(app.fileManager.processFrontMatter.calls.length, 1, 'processFrontMatter should be called once');

		// Invoke the frontmatter callback and check only the column property changed
		const callback = app.fileManager.processFrontMatter.calls[0][1];
		const frontmatter: Record<string, unknown> = { status: 'To Do', priority: 'High' };
		callback(frontmatter);

		assert.strictEqual(frontmatter['status'], 'Done', 'Column (status) property should be updated');
		assert.strictEqual(frontmatter['priority'], 'High', 'Swimlane (priority) property should remain unchanged');
	});

	test('Cross-swimlane drop — both column and swimlane properties updated in frontmatter', async () => {
		controller = setupSwimlaneController(createSwimlaneEntries());
		controller.app = app;
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const highSwimlane = view.containerEl.querySelector<HTMLElement>(`[${DATA_ATTRIBUTES.SWIMLANE_VALUE}="High"]`)!;
		const lowSwimlane = view.containerEl.querySelector<HTMLElement>(`[${DATA_ATTRIBUTES.SWIMLANE_VALUE}="Low"]`)!;

		const highTodoBody = highSwimlane.querySelector<HTMLElement>(
			`[${DATA_ATTRIBUTES.COLUMN_VALUE}="To Do"] .${CSS_CLASSES.COLUMN_BODY}`,
		)!;
		const lowDoneBody = lowSwimlane.querySelector<HTMLElement>(
			`[${DATA_ATTRIBUTES.COLUMN_VALUE}="Done"] .${CSS_CLASSES.COLUMN_BODY}`,
		)!;
		const card = highTodoBody.querySelector<HTMLElement>(`.${CSS_CLASSES.CARD}`)!;

		await (view as any).handleCardDrop({ item: card, from: highTodoBody, to: lowDoneBody, oldIndex: 0, newIndex: 0 });

		assert.strictEqual(app.fileManager.processFrontMatter.calls.length, 1, 'processFrontMatter should be called once');

		const callback = app.fileManager.processFrontMatter.calls[0][1];
		const frontmatter: Record<string, unknown> = { status: 'To Do', priority: 'High' };
		callback(frontmatter);

		assert.strictEqual(frontmatter['status'], 'Done', 'Column (status) property should be updated to Done');
		assert.strictEqual(frontmatter['priority'], 'Low', 'Swimlane (priority) property should be updated to Low');
	});

	test('Cross-swimlane, same column — only swimlane property updated in frontmatter', async () => {
		controller = setupSwimlaneController(createSwimlaneEntries());
		controller.app = app;
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const highSwimlane = view.containerEl.querySelector<HTMLElement>(`[${DATA_ATTRIBUTES.SWIMLANE_VALUE}="High"]`)!;
		const lowSwimlane = view.containerEl.querySelector<HTMLElement>(`[${DATA_ATTRIBUTES.SWIMLANE_VALUE}="Low"]`)!;

		// Move from High/To Do to Low/To Do (same column, different swimlane)
		const highTodoBody = highSwimlane.querySelector<HTMLElement>(
			`[${DATA_ATTRIBUTES.COLUMN_VALUE}="To Do"] .${CSS_CLASSES.COLUMN_BODY}`,
		)!;
		const lowTodoBody = lowSwimlane.querySelector<HTMLElement>(
			`[${DATA_ATTRIBUTES.COLUMN_VALUE}="To Do"] .${CSS_CLASSES.COLUMN_BODY}`,
		)!;
		const card = highTodoBody.querySelector<HTMLElement>(`.${CSS_CLASSES.CARD}`)!;

		await (view as any).handleCardDrop({ item: card, from: highTodoBody, to: lowTodoBody, oldIndex: 0, newIndex: 0 });

		assert.strictEqual(app.fileManager.processFrontMatter.calls.length, 1, 'processFrontMatter should be called once');

		const callback = app.fileManager.processFrontMatter.calls[0][1];
		const frontmatter: Record<string, unknown> = { status: 'To Do', priority: 'High' };
		callback(frontmatter);

		assert.strictEqual(frontmatter['status'], 'To Do', 'Column (status) property should remain unchanged');
		assert.strictEqual(frontmatter['priority'], 'Low', 'Swimlane (priority) property should be updated to Low');
	});
});

// ── Column Colors Across Swimlanes ───────────────────────────────────────────

describe('Swimlane Column Colors - Shared Across Rows', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
		(global as any).Sortable = mockSortable().Sortable;
		// Clean up any leftover popover from a previous test
		document.querySelectorAll('.obk-column-color-popover').forEach((el) => el.remove());
	});

	test('Stored column color is applied to all swimlane rows on initial render', () => {
		controller = setupSwimlaneController(createSwimlaneEntries());
		controller.app = app;
		// Pre-load a color for "To Do" in config
		controller.config.set('columnColors', { [PROPERTY_STATUS]: { 'To Do': 'red' } });

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const todoColumns = Array.from(
			view.containerEl.querySelectorAll<HTMLElement>(`[${DATA_ATTRIBUTES.COLUMN_VALUE}="To Do"]`),
		);
		assert.ok(todoColumns.length >= 2, 'There should be a "To Do" column in each swimlane');

		for (const col of todoColumns) {
			assert.strictEqual(
				col.style.getPropertyValue('--obk-column-accent-color'),
				'var(--color-red)',
				'Every "To Do" column across swimlanes should have the red accent',
			);
			assert.strictEqual(col.getAttribute('data-column-color'), 'red', 'data-column-color attribute should be set');
		}
	});

	test('Columns without a stored color have no accent in any swimlane row', () => {
		controller = setupSwimlaneController(createSwimlaneEntries());
		controller.app = app;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const allColumns = Array.from(view.containerEl.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.COLUMN}`));
		for (const col of allColumns) {
			assert.strictEqual(
				col.style.getPropertyValue('--obk-column-accent-color'),
				'',
				'Column without stored color should have no accent variable',
			);
			assert.strictEqual(col.getAttribute('data-column-color'), null, 'data-column-color should be absent');
		}
	});

	test('Picking a color via the picker immediately applies it to all swimlane rows', () => {
		controller = setupSwimlaneController(createSwimlaneEntries());
		controller.app = app;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		// Open the color picker on the "To Do" column in the first swimlane
		const firstSwimlane = view.containerEl.querySelector<HTMLElement>(`.${CSS_CLASSES.SWIMLANE}`)!;
		const todoColInFirst = firstSwimlane.querySelector<HTMLElement>(`[${DATA_ATTRIBUTES.COLUMN_VALUE}="To Do"]`)!;
		const colorBtn = todoColInFirst.querySelector<HTMLElement>(`.${CSS_CLASSES.COLUMN_COLOR_BTN}`)!;
		assert.ok(colorBtn, 'Color button should exist on the column header');

		colorBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		const popover = document.querySelector<HTMLElement>('.obk-column-color-popover');
		assert.ok(popover, 'Color picker popover should appear');

		// Click the first real color swatch (index 0 is "none", index 1 is the first palette color)
		const swatches = popover!.querySelectorAll<HTMLElement>('.obk-column-color-swatch');
		assert.ok(swatches.length > 1, 'Popover should have at least one color swatch');
		const firstColorSwatch = swatches[1];
		const pickedColor = firstColorSwatch.title;
		firstColorSwatch.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		// Every "To Do" column across all swimlanes should now have the picked color
		const todoColumns = Array.from(
			view.containerEl.querySelectorAll<HTMLElement>(`[${DATA_ATTRIBUTES.COLUMN_VALUE}="To Do"]`),
		);
		assert.ok(todoColumns.length >= 2, 'Should have "To Do" in multiple swimlanes');

		for (const col of todoColumns) {
			assert.strictEqual(
				col.style.getPropertyValue('--obk-column-accent-color'),
				`var(--color-${pickedColor})`,
				`All "To Do" columns should have the ${pickedColor} accent applied immediately`,
			);
		}
	});

	test('Picking a color for one column does not affect sibling columns in other swimlanes', () => {
		controller = setupSwimlaneController(createSwimlaneEntries());
		controller.app = app;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const firstSwimlane = view.containerEl.querySelector<HTMLElement>(`.${CSS_CLASSES.SWIMLANE}`)!;
		const todoColInFirst = firstSwimlane.querySelector<HTMLElement>(`[${DATA_ATTRIBUTES.COLUMN_VALUE}="To Do"]`)!;
		const colorBtn = todoColInFirst.querySelector<HTMLElement>(`.${CSS_CLASSES.COLUMN_COLOR_BTN}`)!;
		colorBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		const popover = document.querySelector<HTMLElement>('.obk-column-color-popover')!;
		const swatches = popover.querySelectorAll<HTMLElement>('.obk-column-color-swatch');
		swatches[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));

		// "Done" columns should be unaffected across all swimlanes
		const doneColumns = Array.from(
			view.containerEl.querySelectorAll<HTMLElement>(`[${DATA_ATTRIBUTES.COLUMN_VALUE}="Done"]`),
		);
		assert.ok(doneColumns.length >= 1, 'There should be "Done" columns');
		for (const col of doneColumns) {
			assert.strictEqual(
				col.style.getPropertyValue('--obk-column-accent-color'),
				'',
				'"Done" columns should remain uncolored when "To Do" color is set',
			);
		}
	});

	test('Selecting "no color" clears the accent from all swimlane rows', () => {
		controller = setupSwimlaneController(createSwimlaneEntries());
		controller.app = app;
		controller.config.set('columnColors', { [PROPERTY_STATUS]: { 'To Do': 'green' } });

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		// Verify the color is applied initially
		const todoColumns = Array.from(
			view.containerEl.querySelectorAll<HTMLElement>(`[${DATA_ATTRIBUTES.COLUMN_VALUE}="To Do"]`),
		);
		assert.ok(
			todoColumns.every((col) => col.style.getPropertyValue('--obk-column-accent-color') !== ''),
			'All "To Do" columns should have a color before clearing',
		);

		// Open the picker and click "no color" (swatch index 0)
		const firstSwimlane = view.containerEl.querySelector<HTMLElement>(`.${CSS_CLASSES.SWIMLANE}`)!;
		const colorBtn = firstSwimlane.querySelector<HTMLElement>(
			`[${DATA_ATTRIBUTES.COLUMN_VALUE}="To Do"] .${CSS_CLASSES.COLUMN_COLOR_BTN}`,
		)!;
		colorBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		const popover = document.querySelector<HTMLElement>('.obk-column-color-popover')!;
		const noneSwatch = popover.querySelectorAll<HTMLElement>('.obk-column-color-swatch')[0];
		noneSwatch.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		for (const col of todoColumns) {
			assert.strictEqual(
				col.style.getPropertyValue('--obk-column-accent-color'),
				'',
				'All "To Do" columns should have accent cleared after selecting "no color"',
			);
			assert.strictEqual(col.getAttribute('data-column-color'), null, 'data-column-color attribute should be removed');
		}
	});

	test('Color choice is persisted to config and keyed by column value (not swimlane)', () => {
		controller = setupSwimlaneController(createSwimlaneEntries());
		controller.app = app;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const firstSwimlane = view.containerEl.querySelector<HTMLElement>(`.${CSS_CLASSES.SWIMLANE}`)!;
		const colorBtn = firstSwimlane.querySelector<HTMLElement>(
			`[${DATA_ATTRIBUTES.COLUMN_VALUE}="To Do"] .${CSS_CLASSES.COLUMN_COLOR_BTN}`,
		)!;
		colorBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		const popover = document.querySelector<HTMLElement>('.obk-column-color-popover')!;
		const swatches = popover.querySelectorAll<HTMLElement>('.obk-column-color-swatch');
		const pickedColor = swatches[1].title;
		swatches[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));

		const savedColors = controller.config.get('columnColors') as Record<string, Record<string, string>> | null;
		assert.ok(savedColors, 'columnColors should be saved to config');
		assert.strictEqual(
			savedColors[PROPERTY_STATUS]?.['To Do'],
			pickedColor,
			'Color should be stored under the column value key, not a swimlane-composite key',
		);
	});
});

// ── Preference Persistence ────────────────────────────────────────────────────

describe('Swimlane Preferences - Loading and Persistence', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
		(global as any).Sortable = mockSortable().Sortable;
	});

	test('Column order is shared across swimlane rows (same _prefs.columnOrder)', () => {
		controller = setupSwimlaneController(createSwimlaneEntries());
		controller.app = app;
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columnOrder = (view as any)._prefs.columnOrder as string[];
		assert.ok(Array.isArray(columnOrder), '_prefs.columnOrder should be an array');
		assert.ok(columnOrder.length > 0, '_prefs.columnOrder should not be empty');
		assert.ok(columnOrder.includes('To Do'), 'Column order should include To Do');
		assert.ok(columnOrder.includes('Done'), 'Column order should include Done');
	});

	test('Swimlane order is initialised alphabetically on first render', () => {
		controller = setupSwimlaneController(createSwimlaneEntries());
		controller.app = app;
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const swimlaneOrder = (view as any)._swimlanePrefs.swimlaneOrder as string[];
		assert.deepStrictEqual(swimlaneOrder, [...swimlaneOrder].sort(), 'Initial swimlane order should be alphabetical');
	});

	test('Swimlane prefs are reloaded when the swimlane property changes', () => {
		const entries = createSwimlaneEntries();
		controller = setupSwimlaneController(entries);
		controller.app = app;
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		assert.strictEqual(
			(view as any)._swimlanePrefsPropertyId,
			PROPERTY_PRIORITY,
			'_swimlanePrefsPropertyId should match the swimlane property',
		);

		// Switch swimlane property to STATUS (different from current PRIORITY)
		controller.config.getAsPropertyId = (key: string) => {
			if (key === 'groupByProperty') return PROPERTY_PRIORITY;
			if (key === 'swimlaneByProperty') return PROPERTY_STATUS;
			return null;
		};
		triggerDataUpdate(view);

		assert.strictEqual(
			(view as any)._swimlanePrefsPropertyId,
			PROPERTY_STATUS,
			'_swimlanePrefsPropertyId should update when the swimlane property changes',
		);
	});

	test('Disabling swimlane clears _swimlanePrefsPropertyId', () => {
		const entries = createSwimlaneEntries();
		controller = setupSwimlaneController(entries);
		controller.app = app;
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		assert.strictEqual((view as any)._swimlanePrefsPropertyId, PROPERTY_PRIORITY, 'Should be set in swimlane mode');

		// Disable swimlane
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		triggerDataUpdate(view);

		assert.strictEqual(
			(view as any)._swimlanePrefsPropertyId,
			null,
			'_swimlanePrefsPropertyId should be null after disabling swimlane',
		);
	});
});

// ── Collapse Toggle ──────────────────────────────────────────────────────────

describe('Swimlane Collapse Toggle', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
		mockSortable();
		(global as any).Sortable = mockSortable().Sortable;
		addClosestPolyfill(document.createElement('div'));
		controller = setupSwimlaneController(createSwimlaneEntries());
		controller.app = app;
	});

	test('Each swimlane header has a toggle button', () => {
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const swimlanes = view.containerEl.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.SWIMLANE}`);
		swimlanes.forEach((slEl) => {
			const toggleBtn = slEl.querySelector(`.${CSS_CLASSES.SWIMLANE_TOGGLE}`);
			assert.ok(toggleBtn, 'Swimlane header should have a toggle button');
		});
	});

	test('Toggle button shows ▾ (expanded) by default', () => {
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const swimlanes = view.containerEl.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.SWIMLANE}`);
		swimlanes.forEach((slEl) => {
			const toggleBtn = slEl.querySelector<HTMLElement>(`.${CSS_CLASSES.SWIMLANE_TOGGLE}`);
			assert.strictEqual(toggleBtn?.textContent, '▾', 'Toggle button should show ▾ when expanded');
		});
	});

	test('Clicking toggle collapses the swimlane', () => {
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const firstSwimlane = view.containerEl.querySelector<HTMLElement>(`.${CSS_CLASSES.SWIMLANE}`);
		assert.ok(firstSwimlane, 'Swimlane should exist');

		const toggleBtn = firstSwimlane!.querySelector<HTMLElement>(`.${CSS_CLASSES.SWIMLANE_TOGGLE}`);
		assert.ok(toggleBtn, 'Toggle button should exist');

		toggleBtn!.click();

		assert.ok(
			firstSwimlane!.classList.contains(CSS_CLASSES.SWIMLANE_COLLAPSED),
			'Swimlane should have collapsed class after toggle',
		);
		assert.strictEqual(toggleBtn!.textContent, '▸', 'Toggle button should show ▸ when collapsed');
	});

	test('Clicking toggle again expands the swimlane', () => {
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const firstSwimlane = view.containerEl.querySelector<HTMLElement>(`.${CSS_CLASSES.SWIMLANE}`);
		const toggleBtn = firstSwimlane!.querySelector<HTMLElement>(`.${CSS_CLASSES.SWIMLANE_TOGGLE}`);

		toggleBtn!.click();
		toggleBtn!.click();

		assert.ok(
			!firstSwimlane!.classList.contains(CSS_CLASSES.SWIMLANE_COLLAPSED),
			'Swimlane should not have collapsed class after toggling twice',
		);
		assert.strictEqual(toggleBtn!.textContent, '▾', 'Toggle button should show ▾ when re-expanded');
	});

	test('Collapsing a swimlane updates _swimlanePrefs.collapsedSwimlanes', () => {
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const highSwimlane = Array.from(view.containerEl.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.SWIMLANE}`)).find(
			(sl) => sl.getAttribute(DATA_ATTRIBUTES.SWIMLANE_VALUE) === 'High',
		);
		assert.ok(highSwimlane, 'High swimlane should exist');

		const toggleBtn = highSwimlane!.querySelector<HTMLElement>(`.${CSS_CLASSES.SWIMLANE_TOGGLE}`);
		toggleBtn!.click();

		const collapsed = (view as any)._swimlanePrefs.collapsedSwimlanes as string[];
		assert.ok(collapsed.includes('High'), 'collapsedSwimlanes should include High');
	});

	test('Expanding a swimlane removes it from _swimlanePrefs.collapsedSwimlanes', () => {
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const highSwimlane = Array.from(view.containerEl.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.SWIMLANE}`)).find(
			(sl) => sl.getAttribute(DATA_ATTRIBUTES.SWIMLANE_VALUE) === 'High',
		);
		const toggleBtn = highSwimlane!.querySelector<HTMLElement>(`.${CSS_CLASSES.SWIMLANE_TOGGLE}`);

		toggleBtn!.click();
		toggleBtn!.click();

		const collapsed = (view as any)._swimlanePrefs.collapsedSwimlanes as string[];
		assert.ok(!collapsed.includes('High'), 'collapsedSwimlanes should not include High after re-expanding');
	});

	test('Collapsed state is persisted to config', () => {
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const highSwimlane = Array.from(view.containerEl.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.SWIMLANE}`)).find(
			(sl) => sl.getAttribute(DATA_ATTRIBUTES.SWIMLANE_VALUE) === 'High',
		);
		const toggleBtn = highSwimlane!.querySelector<HTMLElement>(`.${CSS_CLASSES.SWIMLANE_TOGGLE}`);
		toggleBtn!.click();

		const savedCollapsed = controller.config.get('swimlaneCollapsed');
		assert.ok(savedCollapsed, 'swimlaneCollapsed should be saved to config');
		const collapsedForProp = (savedCollapsed as any)[PROPERTY_PRIORITY] as string[];
		assert.ok(Array.isArray(collapsedForProp), 'Should have an array for the swimlane property');
		assert.ok(collapsedForProp.includes('High'), 'Persisted collapsed state should include High');
	});

	test('Collapsed state is restored from config on initial render', () => {
		// Pre-populate config with a collapsed swimlane
		controller.config.set('swimlaneCollapsed', { [PROPERTY_PRIORITY]: ['High'] });

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const highSwimlane = Array.from(view.containerEl.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.SWIMLANE}`)).find(
			(sl) => sl.getAttribute(DATA_ATTRIBUTES.SWIMLANE_VALUE) === 'High',
		);
		assert.ok(highSwimlane, 'High swimlane should exist');
		assert.ok(
			highSwimlane!.classList.contains(CSS_CLASSES.SWIMLANE_COLLAPSED),
			'High swimlane should be collapsed based on saved config',
		);

		const toggleBtn = highSwimlane!.querySelector<HTMLElement>(`.${CSS_CLASSES.SWIMLANE_TOGGLE}`);
		assert.strictEqual(toggleBtn?.textContent, '▸', 'Toggle button should show ▸ for collapsed swimlane');

		const lowSwimlane = Array.from(view.containerEl.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.SWIMLANE}`)).find(
			(sl) => sl.getAttribute(DATA_ATTRIBUTES.SWIMLANE_VALUE) === 'Low',
		);
		assert.ok(!lowSwimlane!.classList.contains(CSS_CLASSES.SWIMLANE_COLLAPSED), 'Low swimlane should remain expanded');
	});

	test('Only the clicked swimlane collapses; others remain expanded', () => {
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const swimlanes = Array.from(view.containerEl.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.SWIMLANE}`));
		assert.strictEqual(swimlanes.length, 2, 'Should have 2 swimlanes');

		const firstToggle = swimlanes[0].querySelector<HTMLElement>(`.${CSS_CLASSES.SWIMLANE_TOGGLE}`);
		firstToggle!.click();

		assert.ok(swimlanes[0].classList.contains(CSS_CLASSES.SWIMLANE_COLLAPSED), 'First swimlane should be collapsed');
		assert.ok(!swimlanes[1].classList.contains(CSS_CLASSES.SWIMLANE_COLLAPSED), 'Second swimlane should remain expanded');
	});
});
