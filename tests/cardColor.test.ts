import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COLOR_PALETTE } from '../src/constants.ts';
import { cardColor } from '../src/utils/cardColor.ts';
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

test('card accents accept theme colors and strictly validated hex colors', () => {
	assert.equal(cardColor(' RED '), COLOR_PALETTE.find((color) => color.name === 'red')!.cssVar);
	assert.equal(cardColor('#aBc123'), '#aBc123');
	assert.equal(cardColor('#f00'), '#f00');
	assert.equal(cardColor(''), null);
	assert.equal(cardColor('null'), null);
});

test('categorical values have stable palette accents independent of discovery order', () => {
	const first = cardColor('Project prism');
	cardColor('Another project');
	assert.equal(cardColor('Project prism'), first);
	assert.ok(COLOR_PALETTE.some((color) => color.cssVar === first));
	assert.ok(COLOR_PALETTE.some((color) => color.cssVar === cardColor('url(https://example.invalid)')));
});

test('color-only edits and option changes invalidate cards even when the color property is not displayed', () => {
	const group = 'note.status' as BasesPropertyId;
	const project = 'note.project' as BasesPropertyId;
	let selected: BasesPropertyId | null = null;
	const file = createMockTFile('Prism.md');
	const app = createMockApp();
	const controller: any = createMockQueryController(
		[createMockBasesEntry(file, { [group]: 'Amber', [project]: 'red' })],
		[group, project],
	);
	controller.app = app;
	controller.config.getAsPropertyId = (key: string) =>
		key === 'groupByProperty' ? group : key === 'cardColorProperty' ? selected : null;
	controller.config.getOrder = (): BasesPropertyId[] => [];
	const view = new KanbanView(controller, createDivWithMethods());
	setupKanbanViewWithApp(view, app);
	const card = () => view.containerEl.querySelector<HTMLElement>('.obk-card')!;
	triggerDataUpdate(view);
	assert.equal(card().classList.contains('obk-card--colored'), false);
	selected = project;
	triggerDataUpdate(view);
	assert.equal(card().style.getPropertyValue('--obk-card-accent-color'), 'var(--color-red)');
	controller.data.data = [createMockBasesEntry(file, { [group]: 'Amber', [project]: 'green' })];
	triggerDataUpdate(view);
	assert.equal(card().style.getPropertyValue('--obk-card-accent-color'), 'var(--color-green)');
	selected = null;
	triggerDataUpdate(view);
	assert.equal(card().classList.contains('obk-card--colored'), false);
	assert.equal(card().style.getPropertyValue('--obk-card-accent-color'), '');
	view.onClose();
});
