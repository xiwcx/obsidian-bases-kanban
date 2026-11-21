import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
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

test('clicking × opens one confirmation without persisting; cancel retains saved order', () => {
	const { view, controller, remove } = setup();
	const saved = JSON.stringify(controller.config.get('columnOrders'));
	const write = mock.method(controller.config, 'set');
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
	mock.restoreAll();
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

test('confirmation refuses a stale grouping after the board switches axes', () => {
	const { view, controller, remove } = setup();
	remove.click();
	controller.config.getAsPropertyId = (key: string) => (key === 'groupByProperty' ? lane : null);
	triggerDataUpdate(view);
	confirmColumnRemoval();
	assert.ok(controller.config.get('columnOrders')[status].includes('Empty'));
	assert.ok(view.containerEl.querySelector('[data-column-value="Upper"]'));
	view.onClose();
});
