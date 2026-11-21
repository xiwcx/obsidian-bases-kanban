import { browser, expect } from '@wdio/globals';
import { card, cell, expectInitialBoard, fixture, openBoard, sandboxPath } from '../helpers/board.mjs';

describe('Wikilink grouping titles in real Obsidian', () => {
	it('resolves both axes using pipe aliases, cached frontmatter aliases, and basenames without changing grouping keys', async () => {
		await browser.reloadObsidian({ vault: fixture, copy: true });
		await openBoard();
		await expectInitialBoard();
		await sandboxPath();
		await browser.executeObsidian(async ({ app }) => {
			await app.vault.createFolder('Labels');
			await app.vault.create('Labels/Cached target.md', '---\naliases:\n  - Cached display\n---\n');
			await app.vault.create('Labels/Basename target.md', '# Heading\n');
		});
		// Exercise the real metadata cache, not a stub or the display helper.
		await browser.waitUntil(async () =>
			browser.executeObsidian(({ app }) => {
				const file = app.metadataCache.getFirstLinkpathDest('Labels/Cached target', '');
				const aliases: unknown = file && app.metadataCache.getFileCache(file)?.frontmatter?.aliases;
				return Array.isArray(aliases) && aliases[0] === 'Cached display';
			}),
		);
		const cases = [
			{ name: 'Prism-001', value: '[[Labels/Cached target|Pipe display]]', display: 'Pipe display' },
			{ name: 'Prism-002', value: '[[Labels/Cached target]]', display: 'Cached display' },
			{ name: 'Prism-003', value: '[[Labels/Basename target#Heading]]', display: 'Basename target' },
			{ name: 'Prism-004', value: 'Plain text', display: 'Plain text' },
		];
		await browser.executeObsidian(async ({ app }, cases) => {
			for (const { name, value } of cases) {
				const file = app.vault.getFileByPath(`Specimens/${name}.md`);
				if (!file) throw new Error(`Missing specimen: ${name}`);
				await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
					frontmatter.phase = value;
					frontmatter.band = value;
				});
			}
		}, cases);

		for (const { name, value, display } of cases) {
			const lane = `.obk-swimlane[data-swimlane-value="${value}"]`;
			const laneTitle = browser.$(`${lane} .obk-swimlane-title`);
			await laneTitle.waitForExist();
			// Read the stored text: the theme's text-transform can capitalize labels.
			expect(await laneTitle.getProperty('textContent')).toBe(display);
			await expect(browser.$(`${lane} .obk-swimlane-drag-handle`)).toHaveAttribute(
				'aria-label',
				`Drag to reorder lane: ${display}`,
			);
			expect(await browser.$(`${cell(value, value)} .obk-column-title`).getProperty('textContent')).toBe(display);
			await expect(browser.$(`${cell(value, value)} ${card(name)}`)).toBeDisplayed();
			await expect(browser.$$(card(name))).toBeElementsArrayOfSize(1);
		}
		await expect(browser.$$('.obk-swimlane')).toBeElementsArrayOfSize(4);
		await expect(browser.$$('.obk-card')).toBeElementsArrayOfSize(4);
	});
});
