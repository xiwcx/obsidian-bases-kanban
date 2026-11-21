import { browser, expect } from '@wdio/globals';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { obsidianPage } from 'wdio-obsidian-service';
import { card, expectInitialBoard, fixture, openBoard, pluginId, sandboxPath } from '../helpers/board.mjs';

// Optional documentation capture: swap only the plugin bundle in the guarded
// disposable vault. Both images show exactly the same note and timestamps.
async function captureDateComparison(baselinePath: string): Promise<void> {
	const vault = await sandboxPath();
	await browser.executeObsidian(async ({ app, obsidian }) => {
		const base = app.vault.getFileByPath('Polygon laboratory.base');
		if (!base) throw new Error('Missing fixture');
		const config = obsidian.parseYaml(await app.vault.read(base)) as {
			filters: unknown;
			views: Record<string, unknown>[];
		};
		config.filters = { and: ['file.path == "Specimens/Prism-001.md"'] };
		const view = config.views[0];
		delete view.swimlaneByProperty;
		view.order = ['note.due', 'note.appointment', 'file.ctime', 'file.mtime'];
		await app.vault.modify(base, obsidian.stringifyYaml(config));
	});
	await expect(browser.$$('.obk-card')).toBeElementsArrayOfSize(1);
	const selector = card('Prism-001');
	await expect(browser.$(`${selector} [data-label="file.ctime"]`)).toExist();
	const highlight = () =>
		browser.execute(
			(selector, annotation) => {
				document.querySelectorAll<HTMLElement>(`${selector} .obk-card-property`).forEach((row) => {
					// Screenshot-only annotations; outlines do not change layout.
					row.setCssProps(annotation);
				});
			},
			selector,
			{ outline: '1px solid var(--color-purple)', 'outline-offset': '1px' },
		);
	await highlight();
	await browser.$(selector).saveScreenshot('docs/screenshots/date-properties-after.png');
	const configDir = await browser.executeObsidian(({ app }) => app.vault.configDir);
	const mainPath = path.join(vault, configDir, 'plugins', pluginId, 'main.js');
	const fixedBundle = await readFile(mainPath);
	const closeBoard = () =>
		browser.executeObsidian(async ({ app }) => {
			await app.workspace.getLeaf(false).setViewState({ type: 'empty' });
		});
	try {
		await closeBoard();
		await obsidianPage.disablePlugin(pluginId);
		await writeFile(mainPath, await readFile(baselinePath));
		await obsidianPage.enablePlugin(pluginId);
		await openBoard();
		await expect(browser.$$(`${selector} input`)).toBeElementsArrayOfSize(4);
		await highlight();
		await browser.$(selector).saveScreenshot('docs/screenshots/date-properties-before.png');
	} finally {
		await closeBoard();
		await obsidianPage.disablePlugin(pluginId);
		await writeFile(mainPath, fixedBundle);
		await obsidianPage.enablePlugin(pluginId);
		await openBoard();
	}
}

describe('Date property rendering', () => {
	it('renders date and date-time properties as readable text rather than clipped inputs', async () => {
		await browser.reloadObsidian({ vault: fixture, copy: true });
		await sandboxPath();
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
			if (process.env.DATE_BASELINE_BUNDLE) {
				await captureDateComparison(process.env.DATE_BASELINE_BUNDLE);
			} else {
				await browser.$('.obk-board').saveScreenshot('docs/screenshots/date-properties.png');
			}
		}
	});
});
