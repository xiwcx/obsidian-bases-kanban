import assert from 'node:assert';
import { beforeEach, describe, test } from 'node:test';
import { CardDetailView } from '../src/cardDetailView.ts';
import { CSS_CLASSES, VIEW_TYPE_CARD_DETAIL } from '../src/constants.ts';
import { createMockApp, createMockTFile, createMockWorkspaceLeaf, setupTestEnvironment } from './helpers.ts';

setupTestEnvironment();

/**
 * Create a CardDetailView wired to a mock app.
 * The leaf must carry the app so ItemView can pick it up via `(leaf as any).app`.
 */
function createView(app: any): CardDetailView {
	const leaf = createMockWorkspaceLeaf(app) as any;
	const view = new CardDetailView(leaf);
	// The mock ItemView base sets this.app = leaf.app
	return view;
}

describe('CardDetailView — metadata', () => {
	test('getViewType returns VIEW_TYPE_CARD_DETAIL', () => {
		const app = createMockApp();
		const view = createView(app);
		assert.strictEqual(view.getViewType(), VIEW_TYPE_CARD_DETAIL);
	});

	test('getDisplayText returns "Card Detail" when no file is loaded', () => {
		const app = createMockApp();
		const view = createView(app);
		assert.strictEqual(view.getDisplayText(), 'Card Detail');
	});

	test('getDisplayText returns file basename after openFile', async () => {
		const app = createMockApp();
		(app.vault.read as any) = async () => '';
		const file = createMockTFile('notes/MyTask.md', 'MyTask');
		const view = createView(app);
		await view.openFile(file);
		assert.strictEqual(view.getDisplayText(), 'MyTask');
	});

	test('getIcon returns "file-text"', () => {
		const app = createMockApp();
		const view = createView(app);
		assert.strictEqual(view.getIcon(), 'file-text');
	});
});

describe('CardDetailView — onOpen placeholder', () => {
	test('onOpen renders placeholder message', async () => {
		const app = createMockApp();
		const view = createView(app);
		await view.onOpen();

		assert.ok(
			view.contentEl.querySelector(`.${CSS_CLASSES.DETAIL_PLACEHOLDER}`),
			'Placeholder element should be rendered on open',
		);
		assert.match(
			view.contentEl.textContent ?? '',
			/Click a card/i,
			'Placeholder text should prompt the user to click a card',
		);
	});
});

describe('CardDetailView — openFile rendering', () => {
	let app: ReturnType<typeof createMockApp>;

	beforeEach(() => {
		app = createMockApp();
		// Default: vault.read returns empty content
		(app.vault.read as any) = async () => '';
	});

	test('renders file title in header', async () => {
		const file = createMockTFile('notes/Sprint Planning.md', 'Sprint Planning');
		const view = createView(app);
		await view.openFile(file);

		const titleEl = view.contentEl.querySelector(`.${CSS_CLASSES.DETAIL_TITLE}`);
		assert.ok(titleEl, 'Title element should exist');
		assert.strictEqual(titleEl?.textContent, 'Sprint Planning', 'Title should match file basename');
	});

	test('renders an "Open in editor" button in the header', async () => {
		const file = createMockTFile('notes/Task.md', 'Task');
		const view = createView(app);
		await view.openFile(file);

		const btn = view.contentEl.querySelector(`.${CSS_CLASSES.DETAIL_OPEN_BTN}`);
		assert.ok(btn, '"Open in editor" button should be present');
	});

	test('"Open in editor" button calls workspace.openLinkText', async () => {
		const file = createMockTFile('notes/Task.md', 'Task');
		const view = createView(app);
		await view.openFile(file);

		const btn = view.contentEl.querySelector<HTMLButtonElement>(`.${CSS_CLASSES.DETAIL_OPEN_BTN}`);
		assert.ok(btn, 'Button should exist');
		btn!.click();

		assert.strictEqual((app.workspace.openLinkText as any).calls.length, 1, 'openLinkText should be called');
		assert.strictEqual(
			(app.workspace.openLinkText as any).calls[0][0],
			'notes/Task.md',
			'openLinkText should receive the file path',
		);
	});

	test('renders frontmatter properties when present', async () => {
		const file = createMockTFile('notes/Task.md', 'Task');
		(app.metadataCache as any)._setFileCache('notes/Task.md', {
			frontmatter: {
				status: 'In Progress',
				priority: 'High',
			},
		});
		const view = createView(app);
		await view.openFile(file);

		const propsEl = view.contentEl.querySelector(`.${CSS_CLASSES.DETAIL_PROPERTIES}`);
		assert.ok(propsEl, 'Properties section should be rendered');

		const rows = propsEl?.querySelectorAll(`.${CSS_CLASSES.DETAIL_PROPERTY_ROW}`);
		assert.strictEqual(rows?.length, 2, 'Should render one row per frontmatter property');

		const keys = Array.from(rows ?? []).map((r) => r.querySelector(`.${CSS_CLASSES.DETAIL_PROPERTY_KEY}`)?.textContent);
		assert.ok(keys.includes('status'), 'status key should be rendered');
		assert.ok(keys.includes('priority'), 'priority key should be rendered');
	});

	test('skips the internal "position" frontmatter key', async () => {
		const file = createMockTFile('notes/Task.md', 'Task');
		(app.metadataCache as any)._setFileCache('notes/Task.md', {
			frontmatter: {
				position: { start: { line: 0 }, end: { line: 5 } },
				status: 'Done',
			},
		});
		const view = createView(app);
		await view.openFile(file);

		const rows = view.contentEl.querySelectorAll(`.${CSS_CLASSES.DETAIL_PROPERTY_ROW}`);
		assert.strictEqual(rows.length, 1, '"position" key should be filtered out');
		assert.strictEqual(
			rows[0]?.querySelector(`.${CSS_CLASSES.DETAIL_PROPERTY_KEY}`)?.textContent,
			'status',
			'Only "status" should be visible',
		);
	});

	test('renders array frontmatter values as comma-separated string', async () => {
		const file = createMockTFile('notes/Task.md', 'Task');
		(app.metadataCache as any)._setFileCache('notes/Task.md', {
			frontmatter: { tags: ['work', 'sprint', 'backend'] },
		});
		const view = createView(app);
		await view.openFile(file);

		const valueEl = view.contentEl.querySelector(`.${CSS_CLASSES.DETAIL_PROPERTY_VALUE}`);
		assert.strictEqual(valueEl?.textContent, 'work, sprint, backend', 'Array values should be comma-separated');
	});

	test('omits properties section when there is no frontmatter', async () => {
		const file = createMockTFile('notes/Bare.md', 'Bare');
		// No call to _setFileCache → getFileCache returns null
		const view = createView(app);
		await view.openFile(file);

		const propsEl = view.contentEl.querySelector(`.${CSS_CLASSES.DETAIL_PROPERTIES}`);
		assert.strictEqual(propsEl, null, 'Properties section should be absent when there is no frontmatter');
	});

	test('renders note body content', async () => {
		const file = createMockTFile('notes/Task.md', 'Task');
		(app.vault.read as any) = async () => '## My heading\n\nSome body text.';
		const view = createView(app);
		await view.openFile(file);

		const bodyEl = view.contentEl.querySelector(`.${CSS_CLASSES.DETAIL_BODY}`);
		assert.ok(bodyEl, 'Body element should be present');
		assert.ok(bodyEl!.textContent?.includes('My heading'), 'Body should contain heading text');
	});

	test('strips YAML frontmatter block before rendering body', async () => {
		const file = createMockTFile('notes/Task.md', 'Task');
		(app.vault.read as any) = async () => '---\nstatus: In Progress\n---\n\n## Heading\n\nActual content here.';
		const view = createView(app);
		await view.openFile(file);

		const bodyEl = view.contentEl.querySelector(`.${CSS_CLASSES.DETAIL_BODY}`);
		assert.ok(bodyEl, 'Body element should be present');
		assert.ok(!bodyEl!.textContent?.includes('status: In Progress'), 'Frontmatter YAML should not appear in body');
		assert.ok(bodyEl!.textContent?.includes('Actual content here'), 'Non-frontmatter content should appear in body');
	});

	test('shows "No content" placeholder for a note with only frontmatter', async () => {
		const file = createMockTFile('notes/Empty.md', 'Empty');
		(app.vault.read as any) = async () => '---\nstatus: Todo\n---\n';
		const view = createView(app);
		await view.openFile(file);

		const emptyEl = view.contentEl.querySelector(`.${CSS_CLASSES.DETAIL_EMPTY}`);
		assert.ok(emptyEl, '"No content" element should be shown for an empty body');
		assert.strictEqual(emptyEl?.textContent, 'No content');
	});

	test('shows "No content" placeholder for a completely empty note', async () => {
		const file = createMockTFile('notes/Empty.md', 'Empty');
		(app.vault.read as any) = async () => '';
		const view = createView(app);
		await view.openFile(file);

		const emptyEl = view.contentEl.querySelector(`.${CSS_CLASSES.DETAIL_EMPTY}`);
		assert.ok(emptyEl, '"No content" element should be shown for an empty note');
	});

	test('renders divider between properties and body', async () => {
		const file = createMockTFile('notes/Task.md', 'Task');
		(app.metadataCache as any)._setFileCache('notes/Task.md', { frontmatter: { status: 'Done' } });
		(app.vault.read as any) = async () => 'Some content.';
		const view = createView(app);
		await view.openFile(file);

		const divider = view.contentEl.querySelector(`.${CSS_CLASSES.DETAIL_DIVIDER}`);
		assert.ok(divider, 'Divider should separate properties from body');
	});

	test('re-renders cleanly when a second file is opened', async () => {
		const file1 = createMockTFile('notes/First.md', 'First');
		const file2 = createMockTFile('notes/Second.md', 'Second');
		(app.vault.read as any) = async () => '';
		const view = createView(app);

		await view.openFile(file1);
		assert.strictEqual(view.getDisplayText(), 'First');

		await view.openFile(file2);
		assert.strictEqual(view.getDisplayText(), 'Second', 'Display text should update to second file');

		const titles = view.contentEl.querySelectorAll(`.${CSS_CLASSES.DETAIL_TITLE}`);
		assert.strictEqual(titles.length, 1, 'Only one title element should exist after re-render');
		assert.strictEqual(titles[0]?.textContent, 'Second', 'Title should show second file name');
	});
});

describe('CardDetailView — onClose', () => {
	test('onClose empties contentEl and clears the current file', async () => {
		const app = createMockApp();
		(app.vault.read as any) = async () => 'Content';
		const file = createMockTFile('notes/Task.md', 'Task');
		const view = createView(app);

		await view.openFile(file);
		assert.ok(view.contentEl.children.length > 0, 'Content should exist before close');

		await view.onClose();
		assert.strictEqual(view.contentEl.children.length, 0, 'contentEl should be empty after close');
		assert.strictEqual(view.getDisplayText(), 'Card Detail', 'Display text should reset after close');
	});
});
