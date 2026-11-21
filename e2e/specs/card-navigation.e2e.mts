import { browser, expect } from '@wdio/globals';
import { card, expectInitialBoard, fixture, openBoard } from '../helpers/board.mjs';

describe('Modified card navigation (#121)', () => {
	for (const linkTitle of [false, true]) {
		it(`opens one tab for a ${linkTitle ? 'link-rendered' : 'plain'} title`, async () => {
			await browser.reloadObsidian({ vault: fixture, copy: true });
			if (linkTitle) {
				await browser.executeObsidian(async ({ app }) => {
					const base = app.vault.getFileByPath('Polygon laboratory.base');
					const note = app.vault.getFileByPath('Specimens/Prism-001.md');
					if (!base || !note) throw new Error('Missing fixture');
					await app.fileManager.processFrontMatter(note, (fm: Record<string, unknown>) => {
						fm.related = '[[Specimens/Prism-001]]';
					});
					await app.vault.process(base, (text) => `${text}    cardTitleProperty: note.related\n`);
				});
			}
			await openBoard();
			await expectInitialBoard();
			const modifier = await browser.executeObsidian(({ obsidian }) => (obsidian.Platform.isMacOS ? 'Meta' : 'Control'));
			const files = () =>
				browser.executeObsidian(({ app }) =>
					app.workspace.getLeavesOfType('markdown').map((leaf) => leaf.getViewState().state?.file),
				);
			await browser.keys(modifier);
			try {
				// Newer Obsidian versions render internal links as spans rather
				// than anchors. Exercise either native representation.
				await browser.$(`${card('Prism-001')} .obk-card-title${linkTitle ? ' .internal-link' : ''}`).click();
			} finally {
				await browser.keys('NULL');
			}
			await browser.waitUntil(async () => (await files()).includes('Specimens/Prism-001.md'));
			expect(await files()).toEqual(['Specimens/Prism-001.md']);
		});
	}
});
