import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { browser, expect } from '@wdio/globals';
import { baseFile, cell, dragCard, expectProperties, openBoard, sandboxPath } from '../helpers/board.mjs';

describe('Column removal confirmation', () => {
	it('requires explicit approval; cancel and Escape preserve saved configuration', async () => {
		await openBoard();
		// Empty Amber across all lanes through normal pointer gestures.
		await dragCard('Prism-001', 'Violet');
		await expectProperties('Prism-001', 'Violet', 'Upper');
		await dragCard('Prism-002', 'Violet');
		await expectProperties('Prism-002', 'Violet', 'Upper');
		const vault = await sandboxPath();
		const basePath = path.join(vault, baseFile);
		await browser.waitUntil(async () => (await readFile(basePath, 'utf8')).includes('cardOrders:'));
		const saved = await readFile(basePath, 'utf8');
		const remove = `${cell('Amber')} .obk-column-remove-btn`;
		await browser.$(remove).click();
		await expect(browser.$('.obk-column-remove-dialog')).toBeDisplayed();
		await expect(browser.$(cell('Amber'))).toExist();
		expect(await readFile(basePath, 'utf8')).toEqual(saved);
		await browser.$('.obk-column-remove-cancel').click();
		await expect(browser.$('.obk-column-remove-dialog')).not.toExist();
		await expect(browser.$(cell('Amber'))).toExist();
		await browser.$(remove).click();
		await browser.keys('Escape');
		await expect(browser.$('.obk-column-remove-dialog')).not.toExist();
		expect(await readFile(basePath, 'utf8')).toEqual(saved);
		await browser.$(remove).click();
		await browser.$('.obk-column-remove-confirm').click();
		await expect(browser.$(cell('Amber'))).not.toExist();
		await expect(browser.$(cell('Amber', 'Lower'))).not.toExist();
		await browser.waitUntil(async () => (await readFile(basePath, 'utf8')) !== saved);
		await browser.reloadObsidian();
		await openBoard();
		await expect(browser.$(cell('Amber'))).not.toExist();
		await expect(browser.$$('.obk-card')).toBeElementsArrayOfSize(4);
	});
});
