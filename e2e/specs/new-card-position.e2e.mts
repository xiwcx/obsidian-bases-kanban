import { mkdir } from 'node:fs/promises';
import { browser, expect } from '@wdio/globals';
import { cell, expectInitialBoard, fixture, openBoard } from '../helpers/board.mjs';

describe('New card placement', () => {
	it('places new notes above saved cards and preserves the option after restart', async () => {
		await browser.reloadObsidian({ vault: fixture, copy: true });
		await browser.executeObsidian(async ({ app }) => {
			const base = app.vault.getFileByPath('Polygon laboratory.base');
			if (!base) throw new Error('Missing fixture');
			await app.vault.process(
				base,
				(text) => `${text}    newCardPosition: top
    cardOrders:
      "note.phase\\u001fnote.band":
        "Upper\\u001fAmber":
          - Specimens/Prism-002.md
          - Specimens/Prism-001.md
`,
			);
		});
		await openBoard();
		await expectInitialBoard();
		await browser.executeObsidian(async ({ app }) => {
			await app.vault.create('Specimens/New prism.md', '---\nphase: Amber\nband: Upper\n---\n');
		});
		const titles = () => browser.$$(`${cell('Amber')} .obk-card-title`).map((el) => el.getText());
		await browser.waitUntil(
			async () => JSON.stringify(await titles()) === JSON.stringify(['New prism', 'Prism-002', 'Prism-001']),
		);
		if (process.env.CAPTURE_SCREENSHOTS) {
			await mkdir('docs/screenshots', { recursive: true });
			await browser.$('.obk-board').saveScreenshot('docs/screenshots/new-card-position.png');
		}
		await browser.reloadObsidian();
		await openBoard();
		expect(await titles()).toEqual(['New prism', 'Prism-002', 'Prism-001']);
	});
});
