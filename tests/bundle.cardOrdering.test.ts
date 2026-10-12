import assert from 'node:assert';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { runInThisContext } from 'node:vm';
import type { BasesPropertyId } from 'obsidian';
import * as obsidian from './mocks/obsidian.ts';
import {
	createDivWithMethods,
	createMockApp,
	createMockBasesEntry,
	createMockQueryController,
	createMockTFile,
	setupTestEnvironment,
	triggerDataUpdate,
} from './helpers.ts';

const yaml = createRequire(import.meta.url)('yaml');
setupTestEnvironment();

// Exercise the shipped bundle, its real Sortable callback, real Markdown files,
// and a fresh view after persistence. Obsidian itself is represented by its API mock.
test('Production bundle persists Sortable drops to Markdown and restores them in a new view', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'kanban-bundle-'));
	const status = 'note.status' as BasesPropertyId;
	const rank = 'note.rank' as BasesPropertyId;
	const files = ['A.md', 'B.md', 'C.md'];
	let view: any;
	try {
		for (const [index, file] of files.entries()) {
			await writeFile(
				join(directory, file),
				`---\nstatus: ${index === 2 ? 'Done' : 'To Do'}\nrank: ${index === 1 ? 2 : 1}\nkeep: untouched\n---\nBody ${file}\n`,
			);
		}
		const exports: any = {};
		const module = { exports };
		const runBundle = runInThisContext(
			`(function(module, exports, require) {\n${await readFile(new URL('../dist/main.js', import.meta.url), 'utf8')}\n})`,
		);
		runBundle(module, exports, (id: string) => {
			assert.strictEqual(id, 'obsidian');
			return obsidian;
		});
		const app: any = createMockApp();
		app.fileManager.processFrontMatter = async (file: any, update: (fm: Record<string, unknown>) => void) => {
			const path = join(directory, file.path);
			const content = await readFile(path, 'utf8');
			const [, raw, body] = content.split('---\n');
			const fm = yaml.parse(raw);
			update(fm);
			const updated = `---\n${yaml.stringify(fm)}---\n${body}`;
			if (updated !== content) await writeFile(path, updated);
		};
		app.vault.process = async (file: any, update: (content: string) => string) => {
			const path = join(directory, file.path);
			const original = await readFile(path, 'utf8');
			const updated = update(original);
			if (updated !== original) await writeFile(path, updated);
			return updated;
		};
		const entries = async () =>
			Promise.all(
				files.map(async (file) => {
					const content = await readFile(join(directory, file), 'utf8');
					const fm = yaml.parse(content.split('---\n')[1]);
					return createMockBasesEntry(createMockTFile(file), { [status]: fm.status, [rank]: fm.rank });
				}),
			);
		const controller: any = createMockQueryController(await entries(), [status, rank]);
		controller.app = app;
		controller.config.getAsPropertyId = (key: string) =>
			({ groupByProperty: status, cardOrderProperty: rank })[key] ?? null;
		controller.config.set('sort', [{ property: 'file.name', direction: 'DESC' }]);
		const plugin = new module.exports.default(app, {});
		let registration: any;
		plugin.loadData = async (): Promise<null> => null;
		plugin.registerBasesView = (type: string, options: any) => {
			assert.strictEqual(type, 'kanban-view');
			registration = options;
			return true;
		};
		await plugin.onload();
		assert.strictEqual(registration.name, 'Kanban');
		view = registration.factory(controller, createDivWithMethods());
		triggerDataUpdate(view);
		const body = (name: string): HTMLElement => {
			const result = view.containerEl.querySelector(`.obk-column[data-column-value="${name}"] .obk-column-body`);
			assert.ok(result);
			return result;
		};
		const paths = (element: HTMLElement) =>
			Array.from(element.querySelectorAll('.obk-card')).map((card) => card.getAttribute('data-entry-path'));
		let completion: Promise<void> | undefined;
		const handleDrop = view.handleCardDrop.bind(view);
		view.handleCardDrop = (event: any) => {
			completion = handleDrop(event);
			return completion;
		};
		const sortable = view._columnSortables.get('To Do');
		assert.strictEqual(typeof sortable.option, 'function', 'The bundle must use real SortableJS');
		const from = body('To Do');
		const [a, b] = Array.from(from.querySelectorAll<HTMLElement>('.obk-card'));
		from.insertBefore(b, a);
		sortable.option('onEnd')({ item: b, from, to: from, oldIndex: 1, newIndex: 0 });
		assert.ok(completion);
		await completion;
		assert.strictEqual(yaml.parse((await readFile(join(directory, 'B.md'), 'utf8')).split('---\n')[1]).rank, 1);
		assert.strictEqual(yaml.parse((await readFile(join(directory, 'A.md'), 'utf8')).split('---\n')[1]).rank, 2);
		const to = body('Done');
		to.insertBefore(b, to.firstChild);
		sortable.option('onEnd')({ item: b, from, to, oldIndex: 0, newIndex: 0 });
		await completion;
		view.onClose();
		controller.data = { data: await entries() };
		view = registration.factory(controller, createDivWithMethods());
		triggerDataUpdate(view);
		assert.deepStrictEqual(paths(body('To Do')), ['A.md']);
		assert.deepStrictEqual(paths(body('Done')), ['B.md', 'C.md']);
		for (const [file, expectedStatus, expectedRank] of [
			['A.md', 'To Do', 1],
			['B.md', 'Done', 1],
			['C.md', 'Done', 2],
		]) {
			const content = await readFile(join(directory, String(file)), 'utf8');
			const fm = yaml.parse(content.split('---\n')[1]);
			assert.strictEqual(fm.status, expectedStatus);
			assert.strictEqual(fm.rank, expectedRank);
			assert.strictEqual(fm.keep, 'untouched');
			assert.ok(content.endsWith(`Body ${file}\n`));
		}
	} finally {
		view?.onClose();
		await rm(directory, { recursive: true, force: true });
	}
});
