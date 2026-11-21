import assert from 'node:assert/strict';
import { test } from 'node:test';
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

function setup() {
	const app = createMockApp();
	const controller: any = createMockQueryController([], []);
	controller.app = app;
	const view = new KanbanView(controller, createDivWithMethods());
	setupKanbanViewWithApp(view, app);
	return { view };
}

test('new card placement defaults to bottom and preserves saved relative order', () => {
	const { view } = setup();
	const entries = ['new', 'second', 'first'].map((name) => createMockBasesEntry(createMockTFile(`${name}.md`), {}));
	assert.deepEqual(
		(view as any).applyCardOrder(entries, ['first.md', 'second.md']).map((e: any) => e.file.path),
		['first.md', 'second.md', 'new.md'],
	);
	view.onClose();
});

test('top placement puts unsaved cards before saved cards without reversing either group', () => {
	const { view } = setup();
	view.config.set('newCardPosition', 'top');
	const entries = ['new-a', 'second', 'new-b', 'first'].map((name) =>
		createMockBasesEntry(createMockTFile(`${name}.md`), {}),
	);
	assert.deepEqual(
		(view as any).applyCardOrder(entries, ['first.md', 'hidden.md', 'second.md']).map((e: any) => e.file.path),
		['new-a.md', 'new-b.md', 'first.md', 'second.md'],
	);
	view.onClose();
});

test('external grouping changes put relocated saved cards at the configured edge and retain hidden cards', () => {
	for (const position of ['top', 'bottom']) {
		const { view } = setup();
		view.config.set('newCardPosition', position);
		const internal = view as any;
		internal._prefs.cardOrders = { source: ['moved.md', 'hidden.md'], target: ['existing.md'] };
		assert.ok(
			internal._pruneCardOrders(
				new Map([
					['moved.md', 'target'],
					['existing.md', 'target'],
				]),
			),
		);
		assert.deepEqual(internal._prefs.cardOrders.source, ['hidden.md']);
		assert.deepEqual(
			internal._prefs.cardOrders.target,
			position === 'top' ? ['moved.md', 'existing.md'] : ['existing.md', 'moved.md'],
		);
		view.onClose();
	}
});
