import { browser, expect } from '@wdio/globals';
import { mkdir } from 'node:fs/promises';
import { card, expectInitialBoard, fixture, openBoard } from '../helpers/board.mjs';

describe('Date property rendering', () => {
	it('renders date and date-time properties as readable text rather than clipped inputs', async () => {
		await browser.reloadObsidian({ vault: fixture, copy: true });
		await browser.executeObsidian(async ({ app }) => {
			const base = app.vault.getFileByPath('Polygon laboratory.base');
			const note = app.vault.getFileByPath('Specimens/Prism-001.md');
			if (!base || !note) throw new Error('Missing fixture');
			await app.fileManager.processFrontMatter(note, (fm: Record<string, unknown>) => {
				fm.due = '2026-11-20';
				fm.appointment = '2026-11-20T14:30:00';
			});
			await app.vault.process(
				base,
				(text) => `${text}    order:\n      - file.name\n      - note.due\n      - note.appointment\n      - file.mtime\n`,
			);
		});
		await openBoard();
		await expectInitialBoard();
		const properties = browser.$(`${card('Prism-001')}`);
		await expect(properties).toHaveText(expect.stringContaining('2026'));
		await expect(properties.$$('input')).toBeElementsArrayOfSize(0);
		await expect(properties.$('[data-label="note.appointment"]')).toHaveText(expect.stringContaining('14:30'));
		await expect(properties.$('[data-label="file.mtime"] .obk-card-property-value')).not.toHaveText('');
		if (process.env.CAPTURE_SCREENSHOTS) {
			await mkdir('docs/screenshots', { recursive: true });
			await browser.$('.obk-board').saveScreenshot('docs/screenshots/date-properties.png');
		}
	});
});
