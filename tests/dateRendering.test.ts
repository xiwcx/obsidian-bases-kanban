import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BasesPropertyId } from 'obsidian';
import { DateValue, RelativeDateValue } from './mocks/obsidian.ts';
import { createCard, renderCardTitle } from '../src/components/card.ts';
import { KanbanView } from '../src/kanbanView.ts';
import {
	createDivWithMethods,
	createMockApp,
	createMockBasesEntry,
	createMockQueryController,
	createMockTFile,
	setupKanbanViewWithApp,
	setupTestEnvironment,
} from './helpers.ts';

setupTestEnvironment();

test('date titles, properties, and relative-date formulas retain their native renderer', (t) => {
	const app = createMockApp();
	const controller: any = createMockQueryController([], []);
	controller.app = app;
	const view = new KanbanView(controller, createDivWithMethods());
	setupKanbanViewWithApp(view, app);
	const property = 'note.due' as BasesPropertyId;
	const ctx = { ...(view as any)._buildCardCtx(), cardTitlePropertyId: property, order: [property] };
	for (const relative of [false, true]) {
		const value = relative
			? new RelativeDateValue(new Date('2026-11-20T14:30:00Z'))
			: new DateValue(new Date('2026-11-20T14:30:00Z'));
		const renderer = t.mock.method(value, 'renderTo', (el: HTMLElement) => {
			el.textContent = relative ? 'relative date' : 'localized date';
		});
		const entry = { ...createMockBasesEntry(createMockTFile('Prism.md')), getValue: () => value };
		const title = createDivWithMethods();
		renderCardTitle(title, entry, ctx);
		const card = createCard(entry, ctx, (view as any)._buildCardCallbacks());
		assert.equal(title.textContent, relative ? 'relative date' : 'localized date');
		assert.equal(
			card.querySelector('.obk-card-property-value')?.textContent,
			relative ? 'relative date' : 'localized date',
		);
		assert.equal(renderer.mock.callCount(), 3);
	}
	view.onClose();
});
