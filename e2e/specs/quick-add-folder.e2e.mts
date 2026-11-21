import { readdir } from 'node:fs/promises';
import { browser, expect } from '@wdio/globals';
import {
	cell,
	expectCard,
	expectInitialBoard,
	expectProperties,
	fixture,
	openBoard,
	sandboxPath,
} from '../helpers/board.mjs';

describe('Quick-add folder placement in real Obsidian', () => {
	for (const parent of ['', 'Specimens', 'Dashboards']) {
		it(`quick-adds without stray folders with the default note location set to ${parent || 'the vault root'}`, async () => {
			await browser.reloadObsidian({ vault: fixture, copy: true });
			await openBoard();
			await expectInitialBoard();
			const vault = await sandboxPath();
			console.info('Quick-add regression runtime:', browser.getObsidianVersion());
			await browser.executeObsidian(async ({ app }, parent) => {
				if (parent && !app.vault.getFolderByPath(parent)) await app.vault.createFolder(parent);
				// These are Obsidian's Files and links settings, not plugin internals.
				const config = app.vault as unknown as { setConfig(key: string, value: string): void };
				config.setConfig('newFileLocation', parent ? 'folder' : 'root');
				config.setConfig('newFileFolderPath', parent);
			}, parent);
			const folders = async () =>
				(await readdir(vault, { recursive: true, withFileTypes: true }))
					.filter((entry) => entry.isDirectory())
					.map((entry) => `${entry.parentPath}/${entry.name}`)
					.sort();
			const before = await folders();
			// In 1.13.7 Bases derives the parent from file.inFolder("Specimens"),
			// overriding these app defaults. In 1.10.6 the same API behaves differently.
			for (const name of ['Prism-900', 'Prism-900 1']) {
				await browser.$(`${cell('Cobalt', 'Lower')} .obk-column-add-btn`).click();
				await browser.$('.obk-quick-add-input').setValue('Prism-900');
				await browser.keys('Enter');
				await expectProperties(name, 'Cobalt', 'Lower');
				await expectCard(name, 'Cobalt', 'Lower');
			}
			await expect(browser.$$('.obk-card')).toBeElementsArrayOfSize(6);
			// A correct card path alone misses #105: the fallback move hides the
			// unwanted folder tree. Inspect the real filesystem after both adds.
			expect(await folders()).toEqual(before);
		});
	}
});
