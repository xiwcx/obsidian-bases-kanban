import { mkdir } from 'node:fs/promises';
import { browser, expect } from '@wdio/globals';
import { dragCard, expectCard, expectInitialBoard, expectProperties, fixture, openBoard } from '../helpers/board.mjs';

describe('Empty swimlane drop targets', () => {
	it('keeps an emptied lane available through restart and accepts a real drag back into it', async () => {
		await browser.reloadObsidian({ vault: fixture, copy: true });
		await openBoard();
		await expectInitialBoard();
		await dragCard('Prism-003', 'Cobalt', 'Upper');
		await expectProperties('Prism-003', 'Cobalt', 'Upper');
		const lower = browser.$('.obk-swimlane[data-swimlane-value="Lower"]');
		await expect(lower).toBeDisplayed();
		await expect(lower.$$('.obk-card')).toBeElementsArrayOfSize(0);
		await browser.reloadObsidian();
		await openBoard();
		await expect(browser.$('.obk-swimlane[data-swimlane-value="Lower"]')).toBeDisplayed();
		if (process.env.CAPTURE_SCREENSHOTS) {
			await mkdir('docs/screenshots', { recursive: true });
			await browser.$('.obk-board').saveScreenshot('docs/screenshots/empty-swimlanes.png');
		}
		await dragCard('Prism-003', 'Cobalt', 'Lower');
		await expectProperties('Prism-003', 'Cobalt', 'Lower');
		await expectCard('Prism-003', 'Cobalt', 'Lower');
	});
});
