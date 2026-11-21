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

	it('keeps trash off collapsed rails, uses native icons, and provides vertical control padding', async () => {
		await browser.reloadObsidian({ vault: fixture, copy: true });
		await sandboxPath();
		await browser.executeObsidian(async ({ app, obsidian }) => {
			const base = app.vault.getFileByPath('Polygon laboratory.base');
			const note = app.vault.getFileByPath('Specimens/Prism-004.md');
			if (!base || !note) throw new Error('Missing fixture');
			await app.fileManager.processFrontMatter(note, (fm: Record<string, unknown>) => {
				fm.phase = 'Cobalt';
			});
			const config = obsidian.parseYaml(await app.vault.read(base)) as { views: Record<string, unknown>[] };
			Object.assign(config.views[0], {
				columnOrders: { 'note.phase': ['Archive', 'Amber', 'Cobalt', 'Backlog'] },
				columnColors: { 'note.phase': { Amber: 'orange', Cobalt: 'blue' } },
				collapsedColumns: { 'note.phase': ['Archive'] },
			});
			await app.vault.modify(base, obsidian.stringifyYaml(config));
		});
		await openBoard();
		await expectInitialBoard();
		// Amber is empty only in Lower, so it must not offer removal there.
		await expect(browser.$(`${cell('Amber', 'Lower')} .obk-column-remove-btn`)).not.toExist();
		await expect(browser.$(`${cell('Backlog')} .obk-column-remove-btn .lucide-trash-2`)).toExist();
		for (const lane of ['Lower', 'Upper']) {
			await expect(browser.$(`${cell('Archive', lane)} .obk-column-remove-btn`)).not.toBeDisplayed();
			await expect(browser.$(`${cell('Archive', lane)} .obk-column-add-btn`)).not.toBeDisplayed();
			await expect(browser.$(`${cell('Archive', lane)} .obk-column-color-btn`)).toBeDisplayed();
		}
		const geometry = await browser.execute((selector) => {
			const column = document.querySelector<HTMLElement>(selector)!;
			const controls = ['.obk-column-drag-handle', '.obk-column-toggle'].map((name) => {
				const control = column.querySelector<HTMLElement>(name)!;
				const style = getComputedStyle(control);
				return { height: control.getBoundingClientRect().height, top: style.paddingTop, bottom: style.paddingBottom };
			});
			const header = document.querySelector<HTMLElement>('.obk-column:not(.obk-column--collapsed) .obk-column-header')!;
			const title = header.querySelector('.obk-column-title')!.getBoundingClientRect();
			const count = header.querySelector('.obk-column-count')!.getBoundingClientRect();
			return { width: column.getBoundingClientRect().width, controls, titleCountGap: count.left - title.right };
		}, cell('Archive'));
		expect(geometry.width).toBe(44);
		for (const control of geometry.controls) {
			expect(control.height).toBe(48);
			expect(control.top).toBe('16px');
			expect(control.bottom).toBe('16px');
		}
		expect(geometry.titleCountGap).toBe(6);
		if (process.env.CAPTURE_SCREENSHOTS) {
			await mkdir('docs/screenshots', { recursive: true });
			await browser.$('.obk-board').saveScreenshot('docs/screenshots/column-controls.png');
			await browser.execute(() => {
				document.body.classList.remove('theme-light');
				document.body.classList.add('theme-dark');
			});
			await browser.$('.obk-board').saveScreenshot('docs/screenshots/column-controls-dark.png');
		}
		await browser.$(`${cell('Backlog')} .obk-column-toggle`).click();
		for (const lane of ['Lower', 'Upper']) {
			await expect(browser.$(`${cell('Backlog', lane)} .obk-column-remove-btn`)).not.toBeDisplayed();
		}
		if (process.env.CAPTURE_SCREENSHOTS) {
			await browser.$('.obk-board').saveScreenshot('docs/screenshots/collapsed-empty-column.png');
		}
		await browser.$(`${cell('Backlog')} .obk-column-toggle`).click();
		await expect(browser.$(`${cell('Backlog')} .obk-column-remove-btn`)).toBeDisplayed();
		// The native button supports keyboard activation and still confirms.
		await browser.$(`${cell('Backlog')} .obk-column-remove-btn`).execute((button) => button.focus());
		await browser.keys('Enter');
		await expect(browser.$('.obk-column-remove-dialog')).toBeDisplayed();
		await browser.$('.obk-column-remove-cancel').click();
		await expect(browser.$(cell('Backlog'))).toExist();
	});
});
