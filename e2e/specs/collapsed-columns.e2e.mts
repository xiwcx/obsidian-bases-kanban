import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { browser, expect } from '@wdio/globals';
import { baseFile, card, cell, expectInitialBoard, fixture, openBoard, sandboxPath } from '../helpers/board.mjs';

describe('Collapsed columns', () => {
	it('collapses matching columns in every lane into narrow pills, persists, and expands with the keyboard', async () => {
		await browser.reloadObsidian({ vault: fixture, copy: true });
		await openBoard();
		await expectInitialBoard();
		await browser.$(`${cell('Amber')} button[aria-label="Collapse column: Amber"]`).click();
		await expect(browser.$$('.obk-column--collapsed')).toBeElementsArrayOfSize(2);
		await expect(browser.$(card('Prism-001'))).not.toBeDisplayed();
		expect((await browser.$(cell('Amber')).getSize()).width).toBeLessThan(60);
		expect((await browser.$(cell('Cobalt')).getSize()).width).toBeGreaterThan(200);
		const vault = await sandboxPath();
		await browser.waitUntil(async () =>
			(await readFile(path.join(vault, baseFile), 'utf8')).includes('collapsedColumns:'),
		);
		if (process.env.CAPTURE_SCREENSHOTS) {
			await mkdir('docs/screenshots', { recursive: true });
			await browser.$('.obk-board').saveScreenshot('docs/screenshots/collapsed-columns.png');
		}
		await browser.reloadObsidian();
		await openBoard();
		await expect(browser.$$('.obk-column--collapsed')).toBeElementsArrayOfSize(2);
		await browser.$(`${cell('Amber')} button[aria-label="Expand column: Amber"]`).click();
		await expect(browser.$(card('Prism-001'))).toBeDisplayed();
		await browser.keys('Enter');
		await expect(browser.$$('.obk-column--collapsed')).toBeElementsArrayOfSize(2);
	});
});
