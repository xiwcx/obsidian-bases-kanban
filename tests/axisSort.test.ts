import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { BasesEntry, BasesPropertyId, BasesViewConfig, QueryController } from 'obsidian';
import { CSS_CLASSES, SWIMLANE_KEY_SEPARATOR, UNCATEGORIZED_LABEL } from '../src/constants.ts';
import { KanbanView } from '../src/kanbanView.ts';
import { parseAxisSort, sortAxisValues } from '../src/utils/axisSort.ts';
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

describe('Axis sorting', () => {
	test('invalid or missing modes fall back to manual', () => {
		for (const value of [null, undefined, '', 'ASC', 'invalid', {}, true]) {
			assert.equal(parseAxisSort(value), 'manual');
		}
		assert.equal(parseAxisSort('asc'), 'asc');
		assert.equal(parseAxisSort('desc'), 'desc');
	});

	test('sorts ISO dates chronologically without mutating the source', () => {
		const values = ['2026-08-01', '2026-07-24', '2026-07-16'];
		assert.deepEqual(sortAxisValues(values, 'asc'), ['2026-07-16', '2026-07-24', '2026-08-01']);
		assert.deepEqual(sortAxisValues(values, 'desc'), ['2026-08-01', '2026-07-24', '2026-07-16']);
		assert.deepEqual(values, ['2026-08-01', '2026-07-24', '2026-07-16']);
	});

	test('sorts numeric values including negatives and decimals numerically', () => {
		assert.deepEqual(sortAxisValues(['10', '-2', '2.5', '-10', '2'], 'asc'), ['-10', '-2', '2', '2.5', '10']);
		assert.deepEqual(sortAxisValues(['10', '-2', '2.5'], 'desc'), ['10', '2.5', '-2']);
		assert.deepEqual(sortAxisValues(['Phase 10', 'Phase 2', 'Phase 1'], 'asc'), ['Phase 1', 'Phase 2', 'Phase 10']);
		assert.deepEqual(sortAxisValues(['-3a', '-2', '-10'], 'asc'), ['-10', '-2', '-3a']);
	});

	test('keeps Uncategorized last in either direction', () => {
		const values = [UNCATEGORIZED_LABEL, 'Beta', 'Alpha'];
		assert.deepEqual(sortAxisValues(values, 'asc'), ['Alpha', 'Beta', UNCATEGORIZED_LABEL]);
		assert.deepEqual(sortAxisValues(values, 'desc'), ['Beta', 'Alpha', UNCATEGORIZED_LABEL]);
	});
});

const columnProperty: BasesPropertyId = 'note.status';
const laneProperty: BasesPropertyId = 'note.priority';
const scope = `${columnProperty}${SWIMLANE_KEY_SEPARATOR}${laneProperty}`;
const manualColumns = ['2026-07-24', '2026-08-01', '2026-07-16', '2026-07-23'];
const manualLanes = ['2026-07-21', '2026-07-12'];

function entry(name: string, column: string | null, lane: string | null): BasesEntry {
	return createMockBasesEntry(createMockTFile(`${name}.md`), {
		[columnProperty]: column,
		[laneProperty]: lane,
	});
}

function createView(swimlanes = true) {
	const entries = [
		entry('A', '2026-07-16', '2026-07-12'),
		entry('B', '2026-07-24', '2026-07-21'),
		entry('C', '2026-08-01', '2026-07-12'),
	];
	const controller = createMockQueryController(entries, [columnProperty, laneProperty]) as QueryController & {
		config: BasesViewConfig;
	};
	const app = createMockApp();
	controller.config.getAsPropertyId = (key: string) =>
		key === 'groupByProperty' ? columnProperty : key === 'swimlaneByProperty' && swimlanes ? laneProperty : null;
	controller.config.set('columnOrders', { [columnProperty]: manualColumns });
	controller.config.set('swimlaneOrders', { [scope]: manualLanes });
	const view = new KanbanView(controller, createDivWithMethods());
	setupKanbanViewWithApp(view, app);
	return { view, controller, entries };
}

function columns(root: HTMLElement): (string | null)[] {
	return Array.from(root.querySelectorAll(`.${CSS_CLASSES.COLUMN}`), (el) => el.getAttribute('data-column-value'));
}

function lanes(view: KanbanView): HTMLElement[] {
	return Array.from(view.containerEl.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.SWIMLANE}`));
}

describe('Independent column and swimlane sorting', () => {
	test('defaults to saved manual axis orders', () => {
		const { view } = createView();
		triggerDataUpdate(view);
		assert.deepEqual(
			lanes(view).map((el) => el.getAttribute('data-swimlane-value')),
			manualLanes,
		);
		for (const lane of lanes(view)) assert.deepEqual(columns(lane), manualColumns);
	});

	test('sorts both axes independently, including empty columns, then restores manual orders', () => {
		const { view, controller } = createView();
		triggerDataUpdate(view);
		controller.config.set('columnSort', 'asc');
		controller.config.set('swimlaneSort', 'desc');
		triggerDataUpdate(view);
		assert.deepEqual(
			lanes(view).map((el) => el.getAttribute('data-swimlane-value')),
			[...manualLanes].sort().reverse(),
		);
		for (const lane of lanes(view)) assert.deepEqual(columns(lane), [...manualColumns].sort());
		assert.deepEqual(controller.config.get('columnOrders'), { [columnProperty]: manualColumns });
		assert.deepEqual(controller.config.get('swimlaneOrders'), { [scope]: manualLanes });
		controller.config.set('columnSort', 'manual');
		controller.config.set('swimlaneSort', 'manual');
		triggerDataUpdate(view);
		assert.deepEqual(
			lanes(view).map((el) => el.getAttribute('data-swimlane-value')),
			manualLanes,
		);
		for (const lane of lanes(view)) assert.deepEqual(columns(lane), manualColumns);
	});

	test('sorts newly arriving groups on the patch path without rewriting saved positions', () => {
		const { view, controller, entries } = createView();
		controller.config.set('columnSort', 'asc');
		controller.config.set('swimlaneSort', 'asc');
		triggerDataUpdate(view);
		const board = view.containerEl.querySelector(`.${CSS_CLASSES.BOARD}`);
		entries.push(entry('D', '2026-07-20', '2026-07-14'), entry('E', null, null));
		triggerDataUpdate(view);
		assert.equal(view.containerEl.querySelector(`.${CSS_CLASSES.BOARD}`), board);
		assert.deepEqual(
			lanes(view).map((el) => el.getAttribute('data-swimlane-value')),
			['2026-07-12', '2026-07-14', '2026-07-21', UNCATEGORIZED_LABEL],
		);
		for (const lane of lanes(view)) {
			assert.deepEqual(columns(lane), [
				'2026-07-16',
				'2026-07-20',
				'2026-07-23',
				'2026-07-24',
				'2026-08-01',
				UNCATEGORIZED_LABEL,
			]);
		}
		controller.config.set('columnSort', 'manual');
		controller.config.set('swimlaneSort', 'manual');
		triggerDataUpdate(view);
		assert.deepEqual(columns(lanes(view)[0]), [...manualColumns, '2026-07-20', UNCATEGORIZED_LABEL]);
	});

	test('supports automatic columns without swimlanes and keeps Base card sorting independent', () => {
		const { view, controller } = createView(false);
		controller.config.set('columnSort', 'desc');
		controller.config.set('sort', [{ property: 'file.name', direction: 'ASC' }]);
		triggerDataUpdate(view);
		assert.deepEqual(columns(view.containerEl), [...manualColumns].sort().reverse());
		controller.config.set('columnSort', 'manual');
		triggerDataUpdate(view);
		assert.deepEqual(columns(view.containerEl), manualColumns);
	});

	test('automatic axis drop guards do not save accidental DOM reorderings', () => {
		const { view, controller } = createView();
		controller.config.set('columnSort', 'asc');
		controller.config.set('swimlaneSort', 'asc');
		triggerDataUpdate(view);
		const board = view.containerEl.querySelector<HTMLElement>(`.${CSS_CLASSES.BOARD}`)!;
		const firstLane = lanes(view)[0];
		const body = firstLane.querySelector<HTMLElement>(`.${CSS_CLASSES.SWIMLANE_BODY}`)!;
		body.appendChild(body.firstElementChild!);
		board.appendChild(firstLane);
		(view as any).handleSwimlaneColumnDrop({ to: body });
		(view as any).handleSwimlaneDrop(board);
		assert.deepEqual(controller.config.get('columnOrders'), { [columnProperty]: manualColumns });
		assert.deepEqual(controller.config.get('swimlaneOrders'), { [scope]: manualLanes });
		for (const lane of lanes(view)) assert.deepEqual(columns(lane), [...manualColumns].sort());
		assert.deepEqual(
			lanes(view).map((el) => el.getAttribute('data-swimlane-value')),
			[...manualLanes].sort(),
		);
	});

	test('view options expose opt-in manual/ascending/descending controls', () => {
		for (const key of ['columnSort', 'swimlaneSort']) {
			const option = KanbanView.getViewOptions().find((option) => 'key' in option && option.key === key);
			assert.ok(option && 'type' in option && option.type === 'dropdown');
			assert.equal(option.default, 'manual');
			assert.deepEqual(option.options, { manual: 'Manual', asc: 'Ascending', desc: 'Descending' });
		}
	});
});
