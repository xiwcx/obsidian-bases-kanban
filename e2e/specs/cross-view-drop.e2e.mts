import { browser, expect } from '@wdio/globals';
import { baseFile, card, cell, expectProperties, openBoard, pointerDrag } from '../helpers/board.mjs';

describe('Cross-view drag rejection', () => {
	it('rejects a pointer drag between two open views of the same Base', async () => {
		await openBoard();
		await browser.executeObsidian(async ({ app }, filename) => {
			const file = app.vault.getFileByPath(filename);
			if (!file) throw new Error('Synthetic Base missing');
			await app.workspace.getLeaf('split', 'vertical').openFile(file);
		}, baseFile);
		await expect(browser.$$('.obk-board')).toBeElementsArrayOfSize(2);
		await browser.execute(() => {
			document.querySelectorAll('.obk-view-container').forEach((el, i) => el.setAttribute('data-e2e-view', `${i}`));
		});
		// Drag right-to-left so the path does not pass through another valid
		// column in the source view on the way to the foreign destination.
		const a = '[data-e2e-view="1"]';
		const b = '[data-e2e-view="0"]';
		await pointerDrag(`${a} ${card('Prism-001')}`, `${b} ${cell('Cobalt')} .obk-column-body`);
		await expectProperties('Prism-001', 'Amber', 'Upper');
		await expect(browser.$(`${a} ${cell('Amber')} ${card('Prism-001')}`)).toExist();
		await expect(browser.$(`${b} ${cell('Amber')} ${card('Prism-001')}`)).toExist();
		await expect(browser.$$(`${a} .obk-card`)).toBeElementsArrayOfSize(4);
		await expect(browser.$$(`${b} .obk-card`)).toBeElementsArrayOfSize(4);
		// Scoping must not disable legitimate moves within the original view.
		await pointerDrag(`${a} ${card('Prism-001')}`, `${a} ${cell('Cobalt')} .obk-column-body`);
		await expectProperties('Prism-001', 'Cobalt', 'Upper');
		await expect(browser.$(`${a} ${cell('Cobalt')} ${card('Prism-001')}`)).toExist();
	});
});
