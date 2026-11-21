import { mkdir } from 'node:fs/promises';
import { browser, expect } from '@wdio/globals';
import { card, expectInitialBoard, fixture, openBoard } from '../helpers/board.mjs';

describe('Markdown property links', () => {
	it('renders web and application links without opening the card note', async () => {
		await browser.reloadObsidian({ vault: fixture, copy: true });
		await browser.executeObsidian(async ({ app }) => {
			const base = app.vault.getFileByPath('Polygon laboratory.base');
			const note = app.vault.getFileByPath('Specimens/Prism-001.md');
			if (!base || !note) throw new Error('Missing fixture');
			await app.fileManager.processFrontMatter(note, (fm: Record<string, unknown>) => {
				fm.website = '[Project documentation](https://example.invalid/docs)';
				fm.workspace = '[Open workspace](vscode://file/synthetic/project.code-workspace)';
			});
			await app.vault.process(base, (text) => `${text}    order:\n      - note.website\n      - note.workspace\n`);
		});
		await openBoard();
		await expectInitialBoard();
		const web = browser.$(`${card('Prism-001')} [data-label="note.website"] a`);
		await expect(web).toHaveText('Project documentation');
		await expect(web).toHaveAttribute('href', 'https://example.invalid/docs');
		await expect(browser.$(`${card('Prism-001')} [data-label="note.workspace"] a`)).toHaveAttribute(
			'href',
			'vscode://file/synthetic/project.code-workspace',
		);
		// Prevent OS/browser navigation; still dispatch through the real DOM
		// to verify the link click does not fall through to the card handler.
		await browser.execute(() =>
			document.addEventListener('click', (event) => event.preventDefault(), { once: true, capture: true }),
		);
		await web.click();
		expect(await browser.executeObsidian(({ app }) => app.workspace.getLeavesOfType('markdown').length)).toBe(0);
		if (process.env.CAPTURE_SCREENSHOTS) {
			await mkdir('docs/screenshots', { recursive: true });
			await browser.$('.obk-board').saveScreenshot('docs/screenshots/markdown-links.png');
		}
		await browser.executeObsidian(async ({ app }) => {
			const note = app.vault.getFileByPath('Specimens/Prism-001.md');
			if (!note) throw new Error('Missing fixture');
			await app.fileManager.processFrontMatter(note, (fm: Record<string, unknown>) => {
				fm.website = '[Documentation](https://example.invalid) ![Remote image](https://example.invalid/pixel.png)';
			});
		});
		const property = browser.$(`${card('Prism-001')} [data-label="note.website"]`);
		await expect(property).toHaveText(expect.stringContaining('![Remote image]'));
		await expect(property.$$('img')).toBeElementsArrayOfSize(0);
	});
});
