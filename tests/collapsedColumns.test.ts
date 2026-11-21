import assert from 'node:assert/strict';
import { test } from 'node:test';
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

test('column collapse is shared across lanes, scoped by grouping, and writes only its own preferences', () => {
	const status = 'note.status' as BasesPropertyId;
	const category = 'note.category' as BasesPropertyId;
	const lane = 'note.lane' as BasesPropertyId;
	let group = status;
	const app = createMockApp();
	const entries = ['Upper', 'Lower'].map((value, i) =>
		createMockBasesEntry(createMockTFile(`Prism-${i}.md`), { [status]: 'Amber', [category]: 'Amber', [lane]: value }),
	);
	const controller: any = createMockQueryController(entries, [status, category, lane]);
	controller.app = app;
	controller.config.getAsPropertyId = (key: string) =>
		key === 'groupByProperty' ? group : key === 'swimlaneByProperty' ? lane : null;
	const view = new KanbanView(controller, createDivWithMethods());
	setupKanbanViewWithApp(view, app);
	triggerDataUpdate(view);
	const toggle = () => view.containerEl.querySelector<HTMLButtonElement>('.obk-column-toggle')!.click();
	controller.config.set('columnColors', { [status]: { Amber: 'blue' } });
	toggle();
	assert.equal(view.containerEl.querySelectorAll('.obk-column--collapsed').length, 2);
	assert.deepEqual(controller.config.get('collapsedColumns'), { [status]: ['Amber'] });
	assert.deepEqual(controller.config.get('columnColors'), { [status]: { Amber: 'blue' } });
	assert.equal(view.containerEl.querySelectorAll('.obk-card').length, 2);
	group = category;
	triggerDataUpdate(view);
	assert.equal(view.containerEl.querySelectorAll('.obk-column--collapsed').length, 0);
	group = status;
	triggerDataUpdate(view);
	assert.equal(view.containerEl.querySelectorAll('.obk-column--collapsed').length, 2);
	toggle();
	assert.equal(view.containerEl.querySelectorAll('.obk-column--collapsed').length, 0);
	assert.deepEqual(controller.config.get('collapsedColumns'), { [status]: [] });
	view.onClose();
});
