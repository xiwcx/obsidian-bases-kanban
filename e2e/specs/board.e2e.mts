import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
	baseFile,
	card,
	cell,
	dragCard,
	expectCard,
	expectInitialBoard,
	expectProperties,
	externallyChangePhase,
	fixture,
	openBoard,
	pluginId,
	pointerDrag,
	sandboxPath,
} from '../helpers/board.mjs';

describe('Synthetic polygon laboratory in real Obsidian', () => {
	let firstTest = true;
	before(async () => {
		// Mocha hooks run after the service installs its browser commands.
		const versions = {
			app: browser.getObsidianVersion(),
			installer: browser.getObsidianInstallerVersion(),
			chromium: browser.capabilities.browserVersion,
		};
		console.info('Resolved Obsidian runtime:', JSON.stringify(versions));
		await mkdir('e2e-results', { recursive: true });
		await writeFile('e2e-results/runtime.json', JSON.stringify(versions, null, 2));
	});

	beforeEach(async () => {
		// Passing the fixture explicitly creates a new copy/profile, unlike a
		// no-argument restart which deliberately preserves the current test state.
		// The service already launches a fresh fixture for the first test.
		if (!firstTest) await browser.reloadObsidian({ vault: fixture, copy: true });
		firstTest = false;
		await openBoard();
		await expectInitialBoard();
	});

	it('registers the Bases view, groups specimens, and excludes the sentinel', async () => {
		await expect(browser.$$('.obk-swimlane')).toBeElementsArrayOfSize(2);
		await expect(browser.$$('.obk-card')).toBeElementsArrayOfSize(4);
		await expectCard('Prism-001', 'Amber');
		await expectCard('Prism-003', 'Cobalt', 'Lower');
		await expect(browser.$('.obk-column[data-column-value="Forbidden"]')).not.toExist();
	});

	it('moves a card across columns through real pointer input and persists the note', async () => {
		await dragCard('Prism-001', 'Cobalt');
		await expectProperties('Prism-001', 'Cobalt', 'Upper');
		await expectCard('Prism-001', 'Cobalt');
		await browser.reloadObsidian();
		await openBoard();
		await expectCard('Prism-001', 'Cobalt');
	});

	it('moves across both grouping axes and handles consecutive drags without duplicates', async () => {
		await dragCard('Prism-001', 'Cobalt', 'Lower');
		await expectProperties('Prism-001', 'Cobalt', 'Lower');
		await expectCard('Prism-001', 'Cobalt', 'Lower');
		await dragCard('Prism-001', 'Violet');
		await expectProperties('Prism-001', 'Violet', 'Upper');
		await expectCard('Prism-001', 'Violet');
		await expect(browser.$$('.obk-card')).toBeElementsArrayOfSize(4);
	});

	it('persists column color and collapsed lanes through a real app restart', async () => {
		await browser.$(`${cell('Amber')} .obk-column-color-btn`).click();
		await browser.$('.obk-column-color-swatch[title="purple"]').click();
		await expect(browser.$(cell('Amber'))).toHaveAttribute('data-column-color', 'purple');
		await browser.$('.obk-swimlane[data-swimlane-value="Lower"] .obk-swimlane-toggle').click();
		await expect(browser.$('.obk-swimlane[data-swimlane-value="Lower"]')).toHaveElementClass('obk-swimlane--collapsed');
		const vault = await sandboxPath();
		await browser.waitUntil(async () => {
			const content = await readFile(path.join(vault, baseFile), 'utf8');
			return content.includes('purple') && content.includes('collapsedLanes');
		});
		await browser.reloadObsidian();
		await openBoard();
		await expect(browser.$(cell('Amber'))).toHaveAttribute('data-column-color', 'purple');
		await expect(browser.$('.obk-swimlane[data-swimlane-value="Lower"]')).toHaveElementClass('obk-swimlane--collapsed');
	});

	it('persists pointer-driven card and column ordering after restart', async () => {
		const upper = '.obk-swimlane[data-swimlane-value="Upper"]';
		const cards = () => browser.$$(`${cell('Amber')} .obk-card`).map((el) => el.getAttribute('data-entry-path'));
		await pointerDrag(card('Prism-002'), card('Prism-001'), 0.1);
		await browser.waitUntil(async () => (await cards())[0] === 'Specimens/Prism-002.md');
		await pointerDrag(`${cell('Amber')} .obk-column-drag-handle`, `${cell('Violet')} .obk-column-header`);
		const columns = () => browser.$$(`${upper} .obk-column`).map((el) => el.getAttribute('data-column-value'));
		await browser.waitUntil(async () => (await columns())[0] !== 'Amber');
		const savedColumns = await columns();
		const savedCards = await cards();
		const vault = await sandboxPath();
		await browser.waitUntil(async () => (await readFile(path.join(vault, baseFile), 'utf8')).includes('cardOrders:'));
		await browser.reloadObsidian();
		await openBoard();
		await expectInitialBoard();
		expect(await columns()).toEqual(savedColumns);
		expect(await cards()).toEqual(savedCards);
	});

	it('quick-adds an invented specimen with both grouping properties', async () => {
		await browser.$(`${cell('Cobalt', 'Lower')} .obk-column-add-btn`).click();
		await browser.$('.obk-quick-add-input').setValue('Prism-900');
		await browser.keys('Enter');
		await expectProperties('Prism-900', 'Cobalt', 'Lower');
		await expectCard('Prism-900', 'Cobalt', 'Lower');
		await expect(browser.$$('.obk-card')).toBeElementsArrayOfSize(5);
	});

	it('reacts to an external filesystem edit through the real watcher and Bases query', async () => {
		await externallyChangePhase('Prism-002', 'Violet');
		await expectProperties('Prism-002', 'Violet', 'Upper');
		await expectCard('Prism-002', 'Violet');
	});

	it('can disable and re-enable the plugin without duplicate boards or cards', async () => {
		// Obsidian can retain an existing custom view after unregistration. Close
		// its leaf before unloading, then create a fresh view after registration.
		await browser.executeObsidian(async ({ app }) => {
			await app.workspace.getLeaf(false).setViewState({ type: 'empty' });
		});
		await obsidianPage.disablePlugin(pluginId);
		await expect(browser.$('.obk-board')).not.toExist();
		await obsidianPage.enablePlugin(pluginId);
		await openBoard();
		await expect(browser.$$('.obk-board')).toBeElementsArrayOfSize(1);
		await expect(browser.$$('.obk-card')).toBeElementsArrayOfSize(4);
		await expect(browser.$$(card('Prism-001'))).toBeElementsArrayOfSize(1);
	});
});
