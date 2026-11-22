import { browser, expect } from '@wdio/globals';
import { configureBase } from '../helpers/baseConfig.mjs';
import { card, cell, expectInitialBoard, fixture, openBoard, pointerDrag, sandboxPath } from '../helpers/board.mjs';

const manualColumns = ['2026-07-24', '2026-08-01', '2026-07-16', '2026-07-23'];
const manualLanes = ['2026-07-21', '2026-07-12', '2026-07-14'];

async function expectAxes(columns: string[], lanes: string[]): Promise<void> {
	await browser.waitUntil(
		async () => {
			const actualLanes = await browser.$$('.obk-swimlane').map((el) => el.getAttribute('data-swimlane-value'));
			if (JSON.stringify(actualLanes) !== JSON.stringify(lanes)) return false;
			for (const lane of lanes) {
				const actualColumns = await browser
					.$$(`.obk-swimlane[data-swimlane-value="${lane}"] .obk-column`)
					.map((el) => el.getAttribute('data-column-value'));
				if (JSON.stringify(actualColumns) !== JSON.stringify(columns)) return false;
			}
			return true;
		},
		{ timeoutMsg: `Expected columns ${columns.join(', ')} and lanes ${lanes.join(', ')}` },
	);
}

describe('Independent date-axis sorting in real Obsidian (#103)', () => {
	beforeEach(async () => {
		await browser.reloadObsidian({ vault: fixture, copy: true });
		await openBoard();
		await expectInitialBoard();
		await sandboxPath();
		await browser.executeObsidian(async ({ app }) => {
			const values = [
				['2026-07-16', '2026-07-12'],
				['2026-07-24', '2026-07-21'],
				['2026-08-01', '2026-07-14'],
				['2026-07-24', '2026-07-21'],
			];
			for (const [index, [start, finish]] of values.entries()) {
				const file = app.vault.getFileByPath(`Specimens/Prism-00${index + 1}.md`);
				if (!file) throw new Error('Synthetic specimen missing');
				await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
					fm.start_date = start;
					fm.finish_date = finish;
				});
			}
			await app.workspace.getLeaf(false).setViewState({ type: 'empty' });
		});
		await configureBase({
			groupByProperty: 'note.start_date',
			swimlaneByProperty: 'note.finish_date',
			columnOrders: { 'note.start_date': manualColumns },
			swimlaneOrders: { 'note.start_date\u001Fnote.finish_date': manualLanes },
			sort: [{ property: 'file.name', direction: 'ASC' }],
		});
		await openBoard();
		await expectAxes(manualColumns, manualLanes);
	});

	it('sorts dates and empty columns independently, persists modes, and restores manual positions', async () => {
		await configureBase({ columnSort: 'asc' });
		await expectAxes([...manualColumns].sort(), manualLanes);
		await configureBase({ swimlaneSort: 'desc' });
		await expectAxes([...manualColumns].sort(), [...manualLanes].sort().reverse());
		await expect(browser.$(`${cell('2026-07-24', '2026-07-21')} .obk-column-drag-handle`)).toHaveAttribute(
			'aria-disabled',
			'true',
		);
		const laneHandle = '.obk-swimlane[data-swimlane-value="2026-07-12"] .obk-swimlane-drag-handle';
		await expect(browser.$(laneHandle)).toHaveAttribute('aria-disabled', 'true');
		await pointerDrag(
			`${cell('2026-07-16', '2026-07-12')} .obk-column-drag-handle`,
			`${cell('2026-07-24', '2026-07-12')} .obk-column-header`,
		);
		await expectAxes([...manualColumns].sort(), [...manualLanes].sort().reverse());
		await configureBase({ columnSort: 'desc', swimlaneSort: 'asc' });
		await expectAxes([...manualColumns].sort().reverse(), [...manualLanes].sort());
		await browser.reloadObsidian();
		await openBoard();
		await expectAxes([...manualColumns].sort().reverse(), [...manualLanes].sort());
		await configureBase({ columnSort: 'manual', swimlaneSort: 'manual' });
		await expectAxes(manualColumns, manualLanes);
		await expect(browser.$(`${cell('2026-07-24', '2026-07-21')} .obk-column-drag-handle`)).toHaveAttribute(
			'aria-disabled',
			'false',
		);
		await expect(browser.$(laneHandle)).toHaveAttribute('aria-disabled', 'false');
	});

	it('keeps card sorting and cross-cell dragging independent of automatic axes', async () => {
		await configureBase({ columnSort: 'asc', swimlaneSort: 'asc' });
		await expectAxes([...manualColumns].sort(), [...manualLanes].sort());
		const destination = cell('2026-07-24', '2026-07-21');
		await configureBase({ sort: [{ property: 'file.name', direction: 'DESC' }] });
		await browser.waitUntil(async () => {
			const paths = await browser.$$(`${destination} .obk-card`).map((el) => el.getAttribute('data-entry-path'));
			return JSON.stringify(paths) === JSON.stringify(['Specimens/Prism-004.md', 'Specimens/Prism-002.md']);
		});
		await expectAxes([...manualColumns].sort(), [...manualLanes].sort());
		await pointerDrag(card('Prism-001'), `${destination} .obk-column-body`, 0.9);
		await browser.waitUntil(async () => {
			const paths = await browser.$$(`${destination} .obk-card`).map((el) => el.getAttribute('data-entry-path'));
			return (
				JSON.stringify(paths) ===
				JSON.stringify(['Specimens/Prism-004.md', 'Specimens/Prism-002.md', 'Specimens/Prism-001.md'])
			);
		});
		await sandboxPath();
		expect(
			await browser.executeObsidian(({ app }) => {
				const file = app.vault.getFileByPath('Specimens/Prism-001.md');
				const fm: Record<string, unknown> | undefined | null = file && app.metadataCache.getFileCache(file)?.frontmatter;
				return [fm?.start_date, fm?.finish_date];
			}),
		).toEqual(['2026-07-24', '2026-07-21']);
	});
});
