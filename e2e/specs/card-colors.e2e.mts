import { mkdir } from 'node:fs/promises';
import { browser, expect } from '@wdio/globals';
import { card, expectInitialBoard, fixture, openBoard } from '../helpers/board.mjs';

describe('Property-based card accents', () => {
	it('colors categories, reacts to edits and clearing, and persists across restart', async () => {
		await browser.reloadObsidian({ vault: fixture, copy: true });
		await browser.executeObsidian(async ({ app }) => {
			const base = app.vault.getFileByPath('Polygon laboratory.base');
			if (!base) throw new Error('Missing fixture');
			await app.vault.process(
				base,
				(text) => `${text}    cardColorProperty: note.project\n    order:\n      - note.project\n`,
			);
			for (const [name, project] of [
				['Prism-001', 'red'],
				['Prism-002', 'Project cobalt'],
				['Prism-003', 'Project cobalt'],
			]) {
				const note = app.vault.getFileByPath(`Specimens/${name}.md`);
				if (!note) throw new Error('Missing specimen');
				await app.fileManager.processFrontMatter(note, (fm: Record<string, unknown>) => {
					fm.project = project;
				});
			}
		});
		await openBoard();
		await expectInitialBoard();
		const accent = (name: string) => browser.$(card(name)).getAttribute('style');
		await expect(browser.$(card('Prism-001'))).toHaveElementClass('obk-card--colored');
		expect(await accent('Prism-002')).toBe(await accent('Prism-003'));
		await expect(browser.$(card('Prism-004'))).not.toHaveElementClass('obk-card--colored');
		if (process.env.CAPTURE_SCREENSHOTS) {
			await mkdir('docs/screenshots', { recursive: true });
			await browser.$('.obk-board').saveScreenshot('docs/screenshots/card-colors.png');
		}
		await browser.executeObsidian(async ({ app }) => {
			const note = app.vault.getFileByPath('Specimens/Prism-001.md');
			if (!note) throw new Error('Missing fixture');
			await app.fileManager.processFrontMatter(note, (fm: Record<string, unknown>) => {
				fm.project = '#00ff00';
			});
		});
		await expect(browser.$(card('Prism-001'))).toHaveAttribute('style', expect.stringContaining('#00ff00'));
		await browser.reloadObsidian();
		await openBoard();
		await expect(browser.$(card('Prism-001'))).toHaveAttribute('style', expect.stringContaining('#00ff00'));
		await browser.executeObsidian(async ({ app }) => {
			const note = app.vault.getFileByPath('Specimens/Prism-001.md');
			if (!note) throw new Error('Missing fixture');
			await app.fileManager.processFrontMatter(note, (fm: Record<string, unknown>) => {
				delete fm.project;
			});
		});
		await expect(browser.$(card('Prism-001'))).not.toHaveElementClass('obk-card--colored');
	});
});
