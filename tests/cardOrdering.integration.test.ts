import assert from 'node:assert';
import { test } from 'node:test';
import type { BasesPropertyId } from 'obsidian';
import { KanbanView } from '../src/kanbanView.ts';
import { getFrontMatterInfo, parseYaml, stringifyYaml } from './mocks/obsidian.ts';
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
const lane = 'note.priority' as BasesPropertyId;
const rank = 'note.rank' as BasesPropertyId;

function createBoard(queryLag = false) {
	const properties: Record<string, Record<string, unknown>> = {
		'A.md': { [status]: 'To Do', [lane]: 'High', [rank]: 1 },
		'B.md': { [status]: 'To Do', [lane]: 'High', [rank]: 2 },
		'C.md': { [status]: 'Done', [lane]: 'Low', [rank]: 1 },
	};
	const entries = Object.entries(properties).map(([path, values]) =>
		createMockBasesEntry(createMockTFile(path), queryLag ? { ...values } : values),
	);
	const app: any = createMockApp();
	const writes: Array<[string, Record<string, unknown>]> = [];
	app.fileManager.processFrontMatter = async (file: any, update: (values: Record<string, unknown>) => void) => {
		const frontmatter = Object.fromEntries(
			Object.entries(properties[file.path]).map(([key, value]) => [key.slice(5), value]),
		);
		const before = JSON.stringify(frontmatter);
		update(frontmatter);
		if (JSON.stringify(frontmatter) !== before) writes.push([file.path, { ...frontmatter }]);
		for (const [key, value] of Object.entries(frontmatter)) properties[file.path][`note.${key}`] = value;
	};
	app.vault.process = async (file: any, update: (content: string) => string) => {
		const frontmatter = Object.fromEntries(
			Object.entries(properties[file.path]).map(([key, value]) => [key.slice(5), value]),
		);
		const content = `---\n${stringifyYaml(frontmatter)}---\nBody\n`;
		const updated = update(content);
		const values = parseYaml(getFrontMatterInfo(updated).frontmatter) as Record<string, unknown>;
		if (updated !== content) writes.push([file.path, values]);
		for (const [key, value] of Object.entries(values)) properties[file.path][`note.${key}`] = value;
		return updated;
	};
	const controller = createMockQueryController(entries, [status, lane, rank]) as any;
	controller.app = app;
	controller.config.getAsPropertyId = (key: string) =>
		({ groupByProperty: status, swimlaneByProperty: lane, cardOrderProperty: rank })[key] ?? null;
	controller.config.set('sort', [{ property: 'file.name', direction: 'DESC' }]);
	controller.config.set('cardOrders', { [status]: { 'To Do': ['B.md', 'A.md'] } });
	const view = new KanbanView(controller, createDivWithMethods());
	setupKanbanViewWithApp(view, app);
	triggerDataUpdate(view);
	return { view, controller, app, properties, writes };
}

function cell(view: KanbanView, priority: string, column: string): HTMLElement {
	const body = view.containerEl.querySelector<HTMLElement>(
		`.obk-swimlane[data-swimlane-value="${priority}"] .obk-column[data-column-value="${column}"] .obk-column-body`,
	);
	assert.ok(body);
	return body;
}

function paths(body: HTMLElement): Array<string | null> {
	return Array.from(body.querySelectorAll('.obk-card')).map((card) => card.getAttribute('data-entry-path'));
}

test('Explicit order survives same-cell writes and refresh without migrating implicit order', async () => {
	const { view, controller, writes } = createBoard();
	const implicit = JSON.stringify(controller.config.get('cardOrders'));
	const body = cell(view, 'High', 'To Do');
	const [a, b] = Array.from(body.querySelectorAll<HTMLElement>('.obk-card'));
	body.insertBefore(b, a);
	await (view as any).handleCardDrop({ item: b, from: body, to: body, oldIndex: 1, newIndex: 0 });
	assert.deepStrictEqual(
		writes.map(([path, values]) => [path, values.rank]),
		[
			['B.md', 1],
			['A.md', 2],
		],
	);
	triggerDataUpdate(view);
	assert.deepStrictEqual(paths(cell(view, 'High', 'To Do')), ['B.md', 'A.md']);
	assert.strictEqual(JSON.stringify(controller.config.get('cardOrders')), implicit);
	writes.length = 0;
	await (view as any).handleCardDrop({ item: b, from: body, to: body, oldIndex: 0, newIndex: 0 });
	assert.strictEqual(writes.length, 0, 'Already correct positions must not rewrite notes');
	view.onClose();
});

test('Cross-lane drop writes grouping and position together and renumbers both cells', async () => {
	const { view, writes } = createBoard();
	const from = cell(view, 'High', 'To Do');
	const to = cell(view, 'Low', 'Done');
	const card = from.querySelector<HTMLElement>('.obk-card');
	assert.ok(card);
	to.insertBefore(card, to.firstChild);
	await (view as any).handleCardDrop({ item: card, from, to, oldIndex: 0, newIndex: 0 });
	assert.deepStrictEqual(writes[0], ['A.md', { status: 'Done', priority: 'Low', rank: 1 }]);
	assert.deepStrictEqual(
		new Map(writes.map(([path, values]) => [path, values.rank])),
		new Map([
			['A.md', 1],
			['B.md', 1],
			['C.md', 2],
		]),
	);
	triggerDataUpdate(view);
	assert.deepStrictEqual(paths(cell(view, 'High', 'To Do')), ['B.md']);
	assert.deepStrictEqual(paths(cell(view, 'Low', 'Done')), ['A.md', 'C.md']);
	view.onClose();
});

test('Same-cell property write failure is exposed to the caller', async () => {
	const { view, app } = createBoard();
	app.vault.process = async () => {
		throw new Error('write denied');
	};
	const body = cell(view, 'High', 'To Do');
	const [a, b] = Array.from(body.querySelectorAll<HTMLElement>('.obk-card'));
	body.insertBefore(b, a);
	await assert.rejects(
		(view as any).handleCardDrop({ item: b, from: body, to: body, oldIndex: 1, newIndex: 0 }),
		/write denied/,
	);
	view.onClose();
});

test('Consecutive drags persist the latest order while the Bases query is stale', async () => {
	const { view, properties } = createBoard(true);
	const body = cell(view, 'High', 'To Do');
	const [a, b] = Array.from(body.querySelectorAll<HTMLElement>('.obk-card'));
	body.insertBefore(b, a);
	await (view as any).handleCardDrop({ item: b, from: body, to: body, oldIndex: 1, newIndex: 0 });
	assert.strictEqual(properties['B.md'][rank], 1);
	assert.strictEqual(properties['A.md'][rank], 2);
	// The query still reports A=1, B=2, but the files already hold A=2, B=1.
	body.insertBefore(a, b);
	await (view as any).handleCardDrop({ item: a, from: body, to: body, oldIndex: 1, newIndex: 0 });
	assert.strictEqual(properties['A.md'][rank], 1);
	assert.strictEqual(properties['B.md'][rank], 2);
	view.onClose();
});

for (const property of ['file.mtime', 'formula.rank', lane]) {
	test(`Rejects unsafe card order property ${property} without writing notes`, () => {
		const { view, controller, writes } = createBoard();
		const getProperty = controller.config.getAsPropertyId;
		controller.config.getAsPropertyId = (key: string) => (key === 'cardOrderProperty' ? property : getProperty(key));
		triggerDataUpdate(view);
		assert.strictEqual(view.containerEl.querySelector('.obk-board'), null);
		assert.match(view.containerEl.textContent ?? '', /writable note property.*not used for grouping/);
		assert.strictEqual(writes.length, 0);
		view.onClose();
	});
}

test('Switching explicit and implicit order preserves both stores without migration', async () => {
	const { view, controller, properties, writes } = createBoard();
	const initialNotes = JSON.stringify(properties);
	const getProperty = controller.config.getAsPropertyId;
	let explicit = false;
	controller.config.getAsPropertyId = (key: string) =>
		key === 'cardOrderProperty' ? (explicit ? rank : null) : getProperty(key);
	triggerDataUpdate(view);
	const body = cell(view, 'High', 'To Do');
	const [a, b] = Array.from(body.querySelectorAll<HTMLElement>('.obk-card'));
	body.insertBefore(b, a);
	await (view as any).handleCardDrop({ item: b, from: body, to: body, oldIndex: 1, newIndex: 0 });
	assert.strictEqual(writes.length, 0);
	assert.strictEqual(JSON.stringify(properties), initialNotes);
	const implicit = JSON.stringify(controller.config.get('cardOrders'));
	explicit = true;
	triggerDataUpdate(view);
	assert.deepStrictEqual(paths(cell(view, 'High', 'To Do')), ['A.md', 'B.md']);
	assert.strictEqual(JSON.stringify(controller.config.get('cardOrders')), implicit);
	explicit = false;
	triggerDataUpdate(view);
	assert.deepStrictEqual(paths(cell(view, 'High', 'To Do')), ['B.md', 'A.md']);
	assert.strictEqual(JSON.stringify(properties), initialNotes);
	view.onClose();
});
