import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BasesPropertyId } from 'obsidian';
import { SWIMLANE_KEY_SEPARATOR as SEP } from '../src/constants.ts';
import { KanbanView } from '../src/kanbanView.ts';
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
const status = 'note.status' as BasesPropertyId;
const lane = 'note.lane' as BasesPropertyId;

for (const swimlanes of [false, true]) {
	test(`filtered drops preserve complete saved orders (${swimlanes ? 'swimlanes' : 'flat'})`, async (t) => {
		const entry = (path: string, column: string, band: string) =>
			createMockBasesEntry(createMockTFile(path), { [status]: column, [lane]: band });
		const a = entry('a.md', 'Todo', 'High');
		const b = entry('b.md', 'Todo', 'High');
		const c = entry('c.md', 'Done', 'Low');
		const hiddenA = entry('hiddenA.md', 'Todo', 'High');
		const hiddenC = entry('hiddenC.md', 'Done', 'Low');
		const app = createMockApp();
		const controller: any = createMockQueryController([a, b, c], [status, lane]);
		controller.app = app;
		controller.config.getAsPropertyId = (key: string) =>
			key === 'groupByProperty' ? status : key === 'swimlaneByProperty' && swimlanes ? lane : null;
		const scope = swimlanes ? `${status}${SEP}${lane}` : status;
		const source = swimlanes ? `High${SEP}Todo` : 'Todo';
		const target = swimlanes ? `Low${SEP}Done` : 'Done';
		controller.config.set('cardOrders', {
			[scope]: { [source]: ['a.md', 'hiddenA.md', 'b.md'], [target]: ['c.md', 'hiddenC.md'] },
		});
		const view = new KanbanView(controller, createDivWithMethods());
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);
		const card = (path: string) => view.containerEl.querySelector<HTMLElement>(`[data-entry-path="${path}"]`)!;
		const writes = t.mock.method(controller.config, 'set');
		const aCard = card('a.md');
		await (view as any).handleCardDrop({
			item: aCard,
			from: aCard.parentElement,
			to: aCard.parentElement,
			oldIndex: 0,
			newIndex: 0,
		});
		assert.deepEqual(controller.config.get('cardOrders')[scope][source], ['a.md', 'hiddenA.md', 'b.md']);
		assert.equal(writes.mock.callCount(), 0, 'An unchanged drag must not rewrite hidden positions');
		const bCard = card('b.md');
		const from = bCard.parentElement!;
		from.insertBefore(bCard, card('a.md'));
		await (view as any).handleCardDrop({ item: bCard, from, to: from, oldIndex: 1, newIndex: 0 });
		assert.deepEqual(controller.config.get('cardOrders')[scope][source], ['b.md', 'a.md', 'hiddenA.md']);

		const to = card('c.md').parentElement!;
		to.insertBefore(bCard, card('c.md'));
		await (view as any).handleCardDrop({ item: bCard, from, to });
		assert.deepEqual(controller.config.get('cardOrders')[scope][source], ['a.md', 'hiddenA.md']);
		assert.deepEqual(controller.config.get('cardOrders')[scope][target], ['b.md', 'c.md', 'hiddenC.md']);
		// Query still reports b in its old cell; #117's pending move must survive.
		triggerDataUpdate(view);
		assert.deepEqual(controller.config.get('cardOrders')[scope][target], ['b.md', 'c.md', 'hiddenC.md']);

		controller.data.data = [a, hiddenA, entry('b.md', 'Done', 'Low'), c, hiddenC];
		triggerDataUpdate(view);
		const paths = Array.from(card('c.md').parentElement!.children, (el) => el.getAttribute('data-entry-path'));
		assert.deepEqual(paths, ['b.md', 'c.md', 'hiddenC.md']);
		assert.deepEqual(controller.config.get('cardOrders')[scope][source], ['a.md', 'hiddenA.md']);
		view.onClose();
	});
}
