import assert from 'node:assert';
import { beforeEach, describe, test } from 'node:test';
import type { BasesEntry, BasesPropertyId } from 'obsidian';
import { CSS_CLASSES, DATA_ATTRIBUTES, SWIMLANE_KEY_SEPARATOR, UNCATEGORIZED_LABEL } from '../src/constants.ts';
import { isCardOrders, isCollapsedLanes, isColumnOrders, KanbanView } from '../src/kanbanView.ts';
import {
	createDivWithMethods,
	createMockApp,
	createMockBasesEntry,
	createMockQueryController,
	createMockTFile,
	setupKanbanViewWithApp,
	setupTestEnvironment,
	triggerDataUpdate,
} from './helpers.ts';

setupTestEnvironment();

const PROPERTY_STATUS = 'note.status' as BasesPropertyId;
const PROPERTY_PRIORITY = 'note.priority' as BasesPropertyId;
const PROPERTY_ASSIGNEE = 'note.assignee' as BasesPropertyId;
const TEST_PROPERTIES = [PROPERTY_STATUS, PROPERTY_PRIORITY, PROPERTY_ASSIGNEE];

function createSwimlaneEntries(): BasesEntry[] {
	return [
		createMockBasesEntry(createMockTFile('Task A.md'), {
			[PROPERTY_STATUS]: 'To Do',
			[PROPERTY_PRIORITY]: 'High',
			[PROPERTY_ASSIGNEE]: 'High',
		}),
		createMockBasesEntry(createMockTFile('Task B.md'), {
			[PROPERTY_STATUS]: 'To Do',
			[PROPERTY_PRIORITY]: 'High',
			[PROPERTY_ASSIGNEE]: 'High',
		}),
		createMockBasesEntry(createMockTFile('Task C.md'), {
			[PROPERTY_STATUS]: 'Done',
			[PROPERTY_PRIORITY]: 'Low',
			[PROPERTY_ASSIGNEE]: 'Alice',
		}),
	];
}

function createSwimlaneView(swimlaneProperty: () => BasesPropertyId | null): {
	view: KanbanView;
	controller: any;
	scrollEl: HTMLElement;
} {
	const scrollEl = createDivWithMethods();
	const controller: any = createMockQueryController(createSwimlaneEntries(), TEST_PROPERTIES);
	const app = createMockApp();
	controller.app = app;
	controller.config.getAsPropertyId = (key: string) => {
		if (key === 'groupByProperty') return PROPERTY_STATUS;
		if (key === 'swimlaneByProperty') return swimlaneProperty();
		return null;
	};

	const view = new KanbanView(controller, scrollEl);
	setupKanbanViewWithApp(view, app);
	return { view, controller, scrollEl };
}

function getLane(view: KanbanView, laneValue: string): HTMLElement {
	const lane = view.containerEl.querySelector<HTMLElement>(
		`.${CSS_CLASSES.SWIMLANE}[${DATA_ATTRIBUTES.SWIMLANE_VALUE}="${laneValue}"]`,
	);
	assert.ok(lane, `Expected lane ${laneValue} to exist`);
	return lane;
}

function getColumnWithin(root: HTMLElement, columnValue: string): HTMLElement {
	const column = Array.from(root.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.COLUMN}`)).find(
		(col) => col.getAttribute(DATA_ATTRIBUTES.COLUMN_VALUE) === columnValue,
	);
	assert.ok(column, `Expected column ${columnValue} to exist`);
	return column;
}

function getColumnOrder(body: HTMLElement): string[] {
	return Array.from(body.children)
		.filter((child): child is HTMLElement => child instanceof HTMLElement && child.classList.contains(CSS_CLASSES.COLUMN))
		.map((column) => column.getAttribute(DATA_ATTRIBUTES.COLUMN_VALUE))
		.filter((value): value is string => value !== null);
}

describe('SWIMLANE_KEY_SEPARATOR', () => {
	test('is the Unit Separator control character (U+001F)', () => {
		assert.strictEqual(SWIMLANE_KEY_SEPARATOR, '\u001F');
		assert.strictEqual(SWIMLANE_KEY_SEPARATOR.charCodeAt(0), 31);
	});

	test('is unlikely to appear in normal property values', () => {
		// The separator is a control character that shouldn't appear in
		// frontmatter values typed by humans, so it makes a safe key delimiter.
		const typicalValues = ['To Do', 'P1', 'High', 'in-progress', 'done!', 'value with spaces'];
		for (const v of typicalValues) {
			assert.ok(!v.includes(SWIMLANE_KEY_SEPARATOR), `value "${v}" must not contain separator`);
		}
	});
});

describe('isCardOrders type guard accepts swimlane composite keys', () => {
	test('flat-mode shape (column-only keys) is accepted', () => {
		const flat = { 'note.status': { 'To Do': ['a.md', 'b.md'], Done: ['c.md'] } };
		assert.ok(isCardOrders(flat));
	});

	test('swimlane-mode shape (composite keys) is accepted', () => {
		const composite = {
			'note.status': {
				[`P1${SWIMLANE_KEY_SEPARATOR}To Do`]: ['a.md'],
				[`P2${SWIMLANE_KEY_SEPARATOR}Done`]: ['b.md'],
			},
		};
		assert.ok(isCardOrders(composite));
	});

	test('rejects garbage shapes', () => {
		assert.ok(!isCardOrders(null));
		assert.ok(!isCardOrders('not an object'));
		assert.ok(!isCardOrders({ key: 'string-value' }));
		assert.ok(!isCardOrders({ key: { nested: 'string-not-array' } }));
		assert.ok(!isCardOrders({ key: { nested: [1, 2, 3] } }));
		assert.ok(!isCardOrders([]));
	});
});

describe('isCollapsedLanes type guard', () => {
	test('accepts a record of string arrays keyed by property id', () => {
		const valid: Record<string, string[]> = { 'note.priority': ['P1', 'P2'], 'note.assignee': [] };
		assert.ok(isCollapsedLanes(valid));
	});

	test('accepts an empty record', () => {
		assert.ok(isCollapsedLanes({}));
	});

	test('rejects records whose values are not arrays', () => {
		assert.ok(!isCollapsedLanes({ 'note.priority': 'P1' }));
		assert.ok(!isCollapsedLanes({ 'note.priority': { nested: 'value' } }));
		assert.ok(!isCollapsedLanes([]));
	});

	test('rejects arrays containing non-strings', () => {
		assert.ok(!isCollapsedLanes({ 'note.priority': [1, 2, 3] }));
		assert.ok(!isCollapsedLanes({ 'note.priority': [null] }));
		assert.ok(!isCollapsedLanes({ 'note.priority': ['ok', 42] }));
	});

	test('rejects null and primitives', () => {
		assert.ok(!isCollapsedLanes(null));
		assert.ok(!isCollapsedLanes(undefined));
		assert.ok(!isCollapsedLanes('string'));
	});
});

describe('swimlaneOrders persistence shape', () => {
	test('swimlaneOrders shares the columnOrders shape (Record<id, string[]>)', () => {
		// Persistence reuses the isColumnOrders type guard for swimlaneOrders;
		// this test pins that contract so a future refactor can't silently
		// diverge the two shapes without forcing a migration plan.
		const valid: Record<string, string[]> = { 'note.priority': ['P1', 'P2', 'P3'], 'note.assignee': [] };
		assert.ok(isColumnOrders(valid));
	});

	test('rejects nested-object shape used by columnColors', () => {
		const colorsShape = { 'note.priority': { P1: 'red', P2: 'blue' } };
		assert.ok(!isColumnOrders(colorsShape));
	});

	test('rejects top-level arrays and arrays with non-string values', () => {
		assert.ok(!isColumnOrders([]));
		assert.ok(!isColumnOrders({ 'note.priority': [1, 2, 3] }));
		assert.ok(!isColumnOrders({ 'note.priority': ['P1', null] }));
	});
});

describe('UNCATEGORIZED_LABEL handling in swimlane composite keys', () => {
	test('composite key with Uncategorized lane and column round-trips intact', () => {
		const key = `${UNCATEGORIZED_LABEL}${SWIMLANE_KEY_SEPARATOR}${UNCATEGORIZED_LABEL}`;
		const [lane, column] = key.split(SWIMLANE_KEY_SEPARATOR);
		assert.strictEqual(lane, UNCATEGORIZED_LABEL);
		assert.strictEqual(column, UNCATEGORIZED_LABEL);
	});
});

describe('Swimlane rendering behavior', () => {
	let swimlaneProperty: BasesPropertyId | null;

	beforeEach(() => {
		swimlaneProperty = PROPERTY_PRIORITY;
	});

	test('empty swimlane cells do not render global column remove buttons', () => {
		const { view } = createSwimlaneView(() => swimlaneProperty);
		triggerDataUpdate(view);

		const highLane = getLane(view, 'High');
		const emptyDoneCell = getColumnWithin(highLane, 'Done');

		assert.strictEqual(
			emptyDoneCell.querySelector(`.${CSS_CLASSES.COLUMN_REMOVE_BTN}`),
			null,
			'Empty swimlane cells should not offer a global remove-column action',
		);
	});

	test('dragging a column in one swimlane reorders that column across all lanes', () => {
		const { view, controller } = createSwimlaneView(() => swimlaneProperty);
		triggerDataUpdate(view);

		const highLane = getLane(view, 'High');
		const highBody = highLane.querySelector<HTMLElement>(`.${CSS_CLASSES.SWIMLANE_BODY}`);
		assert.ok(highBody, 'Expected High lane body to exist');

		const columns = Array.from(highBody.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.COLUMN}`));
		assert.deepStrictEqual(getColumnOrder(highBody), ['Done', 'To Do']);

		highBody.insertBefore(columns[1], columns[0]);
		(view as any).handleSwimlaneColumnDrop({ to: highBody });

		const savedOrders = controller.config.get('columnOrders') as Record<string, string[]>;
		assert.deepStrictEqual(savedOrders[PROPERTY_STATUS], ['To Do', 'Done']);

		const laneBodies = Array.from(view.containerEl.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.SWIMLANE_BODY}`));
		assert.ok(laneBodies.length > 1, 'Expected multiple lanes');
		for (const body of laneBodies) {
			assert.deepStrictEqual(getColumnOrder(body), ['To Do', 'Done']);
		}
	});

	test('collapsed lanes are scoped by both group and swimlane property', () => {
		const { view, controller } = createSwimlaneView(() => swimlaneProperty);
		triggerDataUpdate(view);

		const priorityHighLane = getLane(view, 'High');
		const toggle = priorityHighLane.querySelector<HTMLElement>(`.${CSS_CLASSES.SWIMLANE_TOGGLE}`);
		assert.ok(toggle, 'Expected collapse toggle to exist');
		toggle.click();

		const priorityScopedKey = `${PROPERTY_STATUS}${SWIMLANE_KEY_SEPARATOR}${PROPERTY_PRIORITY}`;
		const collapsed = controller.config.get('collapsedLanes') as Record<string, string[]>;
		assert.deepStrictEqual(collapsed[priorityScopedKey], ['High']);

		swimlaneProperty = PROPERTY_ASSIGNEE;
		triggerDataUpdate(view);

		const assigneeHighLane = getLane(view, 'High');
		assert.ok(
			!assigneeHighLane.classList.contains(CSS_CLASSES.SWIMLANE_COLLAPSED),
			'Same lane label from another swimlane property should not inherit collapsed state',
		);
	});

	test('swimlane card order is stored under the group plus swimlane property key', async () => {
		const { view, controller } = createSwimlaneView(() => swimlaneProperty);
		triggerDataUpdate(view);

		const highLane = getLane(view, 'High');
		const toDoColumn = getColumnWithin(highLane, 'To Do');
		const toDoBody = toDoColumn.querySelector<HTMLElement>(`.${CSS_CLASSES.COLUMN_BODY}`);
		assert.ok(toDoBody, 'Expected To Do column body to exist');

		const cards = Array.from(toDoBody.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.CARD}`));
		assert.strictEqual(cards.length, 2, 'Expected two cards in High / To Do');
		toDoBody.insertBefore(cards[1], cards[0]);

		await (view as any).handleCardDrop({ item: cards[1], from: toDoBody, to: toDoBody, oldIndex: 1, newIndex: 0 });

		const scopedKey = `${PROPERTY_STATUS}${SWIMLANE_KEY_SEPARATOR}${PROPERTY_PRIORITY}`;
		const savedOrders = controller.config.get('cardOrders') as Record<string, Record<string, string[]>>;
		assert.ok(savedOrders[scopedKey], 'Swimlane card order should use a group+swimlane storage key');
		assert.strictEqual(
			savedOrders[PROPERTY_STATUS],
			undefined,
			'Swimlane card order should not leak into flat card order',
		);
		assert.deepStrictEqual(savedOrders[scopedKey][`High${SWIMLANE_KEY_SEPARATOR}To Do`], ['Task B.md', 'Task A.md']);
	});
});
