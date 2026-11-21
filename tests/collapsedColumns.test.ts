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

test('headers group title and count, order visible actions, and use a native trash button', () => {
	const status = 'note.status' as BasesPropertyId;
	const app = createMockApp();
	const controller: any = createMockQueryController(
		[createMockBasesEntry(createMockTFile('Prism.md'), { [status]: 'Amber' })],
		[status],
	);
	controller.app = app;
	controller.config.getAsPropertyId = (key: string) => (key === 'groupByProperty' ? status : null);
	controller.config.set('columnOrders', { [status]: ['Amber', 'Empty'] });
	controller.config.set('quickAddFolder', 'Specimens');
	const view = new KanbanView(controller, createDivWithMethods());
	setupKanbanViewWithApp(view, app);
	triggerDataUpdate(view);
	const header = view.containerEl.querySelector<HTMLElement>('[data-column-value="Empty"] .obk-column-header')!;
	assert.deepEqual(
		[...header.children].map((element) => element.classList[0]),
		[
			'obk-column-drag-handle',
			'obk-column-color-btn',
			'obk-column-heading',
			'obk-column-add-btn',
			'obk-column-toggle',
			'obk-column-remove-btn',
		],
	);
	assert.equal(header.querySelector('.obk-column-heading .obk-column-title')?.textContent, 'Empty');
	assert.equal(header.querySelector('.obk-column-heading .obk-column-count')?.textContent, '0');
	const remove = header.querySelector<HTMLButtonElement>('.obk-column-remove-btn')!;
	assert.equal(remove.tagName, 'BUTTON');
	assert.equal(remove.type, 'button');
	assert.equal(remove.querySelector('svg')?.getAttribute('data-icon'), 'trash-2');
	assert.equal(view.containerEl.querySelector('[data-column-value="Amber"] .obk-column-remove-btn'), null);
	remove.click();
	assert.ok(document.querySelector('.obk-column-remove-dialog'));
	assert.ok(view.containerEl.querySelector('[data-column-value="Empty"]'), 'removal still requires confirmation');
	view.onClose();
});
