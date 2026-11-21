import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { browser, expect } from '@wdio/globals';
import { card, cell, expectCard, expectProperties, openBoard, pointerDrag, sandboxPath } from '../helpers/board.mjs';

describe('Large synthetic columns', () => {
	it('persists pointer-driven moves into and out of an 800-card column', async () => {
		await openBoard();
		const vault = await sandboxPath();
		await Promise.all(
			Array.from({ length: 800 }, (_, i) =>
				writeFile(
					path.join(vault, `Specimens/Load-${String(i).padStart(4, '0')}.md`),
					'---\nphase: Amber\nband: Upper\n---\nSynthetic load specimen.\n',
				),
			),
		);
		await browser.reloadObsidian();
		await openBoard();
		await expect(browser.$$(`${cell('Amber')} .obk-card`)).toBeElementsArrayOfSize(802);
		await pointerDrag(card('Load-0000'), `${cell('Violet')} .obk-column-body`, 0.001);
		await expectProperties('Load-0000', 'Violet', 'Upper');
		await expectCard('Load-0000', 'Violet');
		await pointerDrag(card('Load-0000'), card('Load-0001'), 0.6);
		await expectProperties('Load-0000', 'Amber', 'Upper');
		await expectCard('Load-0000', 'Amber');
		await expect(browser.$$(card('Load-0000'))).toBeElementsArrayOfSize(1);
		await browser.reloadObsidian();
		await openBoard();
		await expectCard('Load-0000', 'Amber');
	});
});
