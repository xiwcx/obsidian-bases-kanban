import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BasesPropertyId } from 'obsidian';
import { KanbanView } from '../src/kanbanView.ts';
import { cardDragAnimation, MAX_ANIMATED_CARDS } from '../src/utils/dragAnimation.ts';
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

test('large cells disable animation; small cells retain it', () => {
	assert.ok(cardDragAnimation(MAX_ANIMATED_CARDS) > 0);
	assert.equal(cardDragAnimation(MAX_ANIMATED_CARDS + 1), 0);
	assert.equal(cardDragAnimation(800), 0);
});

test('an 800-card update does not detach and reappend unchanged cards', (t) => {
	const status = 'note.status' as BasesPropertyId;
	const label = 'note.label' as BasesPropertyId;
	const entries = Array.from({ length: 800 }, (_, i) =>
		createMockBasesEntry(createMockTFile(`Prism-${i}.md`), { [status]: 'Amber', [label]: 'Original' }),
	);
	const app = createMockApp();
	const controller: any = createMockQueryController(entries, [status]);
	controller.app = app;
	controller.config.getAsPropertyId = (key: string) => (key === 'groupByProperty' ? status : null);
	controller.config.getOrder = () => [label];
	const view = new KanbanView(controller, createDivWithMethods());
	setupKanbanViewWithApp(view, app);
	triggerDataUpdate(view);
	const body = view.containerEl.querySelector<HTMLElement>('.obk-column-body')!;
	const originalCards = Array.from(body.children);
	const append = t.mock.method(body, 'appendChild');
	const insert = t.mock.method(body, 'insertBefore');
	const replace = t.mock.method(body, 'replaceChild');
	assert.equal((view as any)._columnSortables.get('Amber').options.animation, 0);
	triggerDataUpdate(view);
	assert.equal(append.mock.callCount(), 0);
	assert.equal(insert.mock.callCount(), 0);
	assert.equal(replace.mock.callCount(), 0);
	originalCards.forEach((card, i) => assert.equal(body.children[i], card));

	// Cached fingerprints must still detect edits, without replacing neighbours.
	entries[400] = createMockBasesEntry(createMockTFile('Prism-400.md'), { [status]: 'Amber', [label]: 'Changed' });
	triggerDataUpdate(view);
	assert.equal(replace.mock.callCount(), 1);
	assert.notEqual(body.children[400], originalCards[400]);
	assert.ok(body.children[400]?.textContent?.includes('Changed'));
	originalCards[400] = body.children[400]!;
	originalCards.forEach((card, i) => assert.equal(body.children[i], card));
	replace.mock.resetCalls();

	// An external move out of the large cell must not shuffle its 799 survivors.
	controller.data.data = entries.slice(1);
	triggerDataUpdate(view);
	assert.equal(append.mock.callCount(), 0);
	assert.equal(insert.mock.callCount(), 0);
	assert.equal(replace.mock.callCount(), 0);
	originalCards.slice(1).forEach((card, i) => assert.equal(body.children[i], card));

	// Size changes on the patch path restore normal small-board animation.
	controller.data.data = entries.slice(1, 3);
	triggerDataUpdate(view);
	assert.ok((view as any)._columnSortables.get('Amber').options.animation > 0);
	view.onClose();
});
