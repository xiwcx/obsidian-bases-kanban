import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BasesPropertyId } from 'obsidian';
import { CSS_CLASSES } from '../src/constants.ts';
import { KanbanView } from '../src/kanbanView.ts';
import {
	confirmColumnRemoval,
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

function setup() {
	const app = createMockApp();
	const entries = [createMockBasesEntry(createMockTFile('Prism.md'), { [status]: 'Amber', [lane]: 'Upper' })];
	const controller: any = createMockQueryController(entries, [status, lane]);
	controller.app = app;
	controller.config.getAsPropertyId = (key: string) => (key === 'groupByProperty' ? status : null);
	controller.config.set('columnOrders', { [status]: ['Amber', 'Empty'] });
	const view = new KanbanView(controller, createDivWithMethods());
	setupKanbanViewWithApp(view, app);
	triggerDataUpdate(view);
	const remove = view.containerEl.querySelector<HTMLElement>('[data-column-value="Empty"] .obk-column-remove-btn')!;
	return { view, controller, remove };
}

test('clicking × opens one confirmation without persisting; cancel retains saved order', (t) => {
	const { view, controller, remove } = setup();
	const saved = JSON.stringify(controller.config.get('columnOrders'));
	const write = t.mock.method(controller.config, 'set');
	remove.click();
	remove.click();
	assert.equal(document.querySelectorAll(`.${CSS_CLASSES.COLUMN_REMOVE_DIALOG}`).length, 1);
	assert.equal(write.mock.callCount(), 0);
	assert.ok(document.querySelector(`.${CSS_CLASSES.COLUMN_REMOVE_DIALOG}`)?.textContent?.includes('embed'));
	const cancel = document.querySelector<HTMLButtonElement>(`.${CSS_CLASSES.COLUMN_REMOVE_CANCEL}`)!;
	assert.equal(document.activeElement, cancel, 'Cancel is the default keyboard action');
	cancel.click();
	assert.equal(document.querySelector(`.${CSS_CLASSES.COLUMN_REMOVE_DIALOG}`), null);
	assert.equal(JSON.stringify(controller.config.get('columnOrders')), saved);
	assert.ok(view.containerEl.querySelector('[data-column-value="Empty"]'));
	view.onClose();
});

test('dismissing the modal or closing the view never removes the column', () => {
	const { view, controller, remove } = setup();
	remove.click();
	(view as any).columnRemovalModal.close(); // Modal's Escape/backdrop close path.
	assert.ok(controller.config.get('columnOrders')[status].includes('Empty'));
	remove.click();
	view.onClose();
	assert.equal(document.querySelector(`.${CSS_CLASSES.COLUMN_REMOVE_DIALOG}`), null);
	assert.ok(controller.config.get('columnOrders')[status].includes('Empty'));
});

test('confirmation refuses a column populated while the dialog was open', () => {
	const { view, controller, remove } = setup();
	remove.click();
	controller.data.data.push(createMockBasesEntry(createMockTFile('New prism.md'), { [status]: 'Empty' }));
	// Even before the next rendered update, the current query prevents removal.
	confirmColumnRemoval();
	assert.ok(controller.config.get('columnOrders')[status].includes('Empty'));
	assert.ok(view.containerEl.querySelector('[data-column-value="Empty"]'));
	view.onClose();
});

for (const rendered of [false, true]) {
	test(`confirmation refuses a changed grouping (${rendered ? 'after' : 'before'} render)`, () => {
		const { view, controller, remove } = setup();
		remove.click();
		controller.config.getAsPropertyId = (key: string) => (key === 'groupByProperty' ? lane : null);
		if (rendered) triggerDataUpdate(view);
		confirmColumnRemoval();
		assert.ok(controller.config.get('columnOrders')[status].includes('Empty'));
		view.onClose();
	});
}

test('confirmation changes only the latest saved column order, not unrelated preferences', (t) => {
	const { view, controller, remove } = setup();
	remove.click();
	// Model another pane or an external .base edit while the modal is open.
	controller.config.set('columnOrders', { [status]: ['Later', 'Empty', 'Amber'], [lane]: ['Upper'] });
	controller.config.set('columnColors', { [status]: { Amber: 'purple' } });
	controller.config.set('cardOrders', { [status]: { Amber: ['New prism.md', 'Prism.md'] } });
	const writes = t.mock.method(controller.config, 'set');
	confirmColumnRemoval();
	assert.deepEqual(controller.config.get('columnOrders'), { [status]: ['Later', 'Amber'], [lane]: ['Upper'] });
	assert.deepEqual(controller.config.get('columnColors'), { [status]: { Amber: 'purple' } });
	assert.deepEqual(controller.config.get('cardOrders'), { [status]: { Amber: ['New prism.md', 'Prism.md'] } });
	assert.equal(writes.mock.callCount(), 1);
	assert.equal(writes.mock.calls[0]?.arguments[0], 'columnOrders');
	view.onClose();
});
