import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import type { BasesPropertyId } from 'obsidian';
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

test('views have independent drag groups while cells within each view share a group', async () => {
	const status = 'note.status' as BasesPropertyId;
	const lane = 'note.lane' as BasesPropertyId;
	const entries = [
		createMockBasesEntry(createMockTFile('Prism-a.md'), { [status]: 'Amber', [lane]: 'Upper' }),
		createMockBasesEntry(createMockTFile('Prism-b.md'), { [status]: 'Cobalt', [lane]: 'Lower' }),
	];
	const app = createMockApp();
	const write = mock.method(app.fileManager, 'processFrontMatter');
	const make = () => {
		const controller: any = createMockQueryController(entries, [status, lane]);
		controller.app = app;
		controller.config.getAsPropertyId = (key: string) =>
			key === 'groupByProperty' ? status : key === 'swimlaneByProperty' ? lane : null;
		const view = new KanbanView(controller, createDivWithMethods());
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);
		return { view, controller };
	};
	const a = make();
	const b = make();
	const groups = (view: KanbanView): Set<string> =>
		new Set(Array.from((view as any)._columnSortables.values(), (s: any) => s.options.group));
	assert.equal(groups(a.view).size, 1, 'Columns and swimlanes in one view may exchange cards');
	assert.notEqual([...groups(a.view)][0], [...groups(b.view)][0], 'Separate views cannot exchange cards');

	const card = a.view.containerEl.querySelector<HTMLElement>('[data-entry-path="Prism-a.md"]')!;
	const from = card.parentElement!;
	const to = b.view.containerEl.querySelector<HTMLElement>('[data-column-value="Cobalt"] .obk-column-body')!;
	const beforeA = JSON.stringify(a.controller.config.get('cardOrders'));
	const beforeB = JSON.stringify(b.controller.config.get('cardOrders'));
	to.appendChild(card);
	await (a.view as any).handleCardDrop({ item: card, from, to, oldIndex: 0 });
	assert.equal(card.parentElement, from, 'Unexpected foreign drop must restore the source preview');
	assert.equal(JSON.stringify(a.controller.config.get('cardOrders')), beforeA);
	assert.equal(JSON.stringify(b.controller.config.get('cardOrders')), beforeB);
	assert.equal(write.mock.callCount(), 0);
	a.view.onClose();
	b.view.onClose();
	mock.restoreAll();
});
