import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { browser, expect } from '@wdio/globals';
import { card, cell, expectCard, expectProperties, openBoard, pointerDrag, sandboxPath } from '../helpers/board.mjs';

declare global {
	interface Window {
		obkLoadProbe: { reads: number };
	}
}

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
		// Instrument the real browser, not the plugin. Sortable's animation
		// capture used to measure every child repeatedly during each dragover.
		await browser.execute(() => {
			// The wrapper below deliberately supplies the original receiver via call.
			// eslint-disable-next-line @typescript-eslint/unbound-method -- wrapper preserves the receiver via call
			const original = Element.prototype.getBoundingClientRect;
			const state = { reads: 0 };
			window.obkLoadProbe = state;
			Element.prototype.getBoundingClientRect = function () {
				if (this.classList.contains('obk-card')) state.reads++;
				return original.call(this);
			};
		});
		await pointerDrag(card('Load-0000'), `${cell('Violet')} .obk-column-body`, 0.001);
		await expectProperties('Load-0000', 'Violet', 'Upper');
		await expectCard('Load-0000', 'Violet');
		await pointerDrag(card('Load-0000'), card('Load-0001'), 0.6);
		await expectProperties('Load-0000', 'Amber', 'Upper');
		await expectCard('Load-0000', 'Amber');
		const reads = await browser.execute(() => window.obkLoadProbe.reads);
		console.info('Large-column card geometry reads across two drags:', reads);
		// Diagnostic only: pointer hit-testing varies with runtime/layout. Fast
		// tests assert animation policy and zero DOM moves for unchanged cards.
		await expect(browser.$$(card('Load-0000'))).toBeElementsArrayOfSize(1);
		await browser.reloadObsidian();
		await openBoard();
		await expectCard('Load-0000', 'Amber');
	});
});
