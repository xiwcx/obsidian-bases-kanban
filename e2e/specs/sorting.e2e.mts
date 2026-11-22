import { browser, expect } from '@wdio/globals';
import {
	card,
	cell,
	expectInitialBoard,
	expectProperties,
	fixture,
	openBoard,
	pointerDrag,
	sandboxPath,
} from '../helpers/board.mjs';
import { configureBase as configure } from '../helpers/baseConfig.mjs';

async function expectOrder(selector: string, names: string[]): Promise<void> {
	const paths = names.map((name) => `Specimens/${name}.md`);
	await browser.waitUntil(
		async () => {
			const actual = await browser.$$(`${selector} .obk-card`).map((el) => el.getAttribute('data-entry-path'));
			return JSON.stringify(actual) === JSON.stringify(paths);
		},
		{ timeoutMsg: `Expected ${selector} to contain ${names.join(', ')} in order` },
	);
}

for (const swimlanes of [false, true]) {
	describe(`Base sorting ${swimlanes ? 'with' : 'without'} swimlanes in real Obsidian`, () => {
		const amber = swimlanes ? cell('Amber') : '.obk-column[data-column-value="Amber"]';
		const cobalt = swimlanes ? cell('Cobalt', 'Lower') : '.obk-column[data-column-value="Cobalt"]';
		const scope = swimlanes ? 'note.phase\u001Fnote.band' : 'note.phase';
		const amberKey = swimlanes ? 'Upper\u001FAmber' : 'Amber';
		const cobaltKey = swimlanes ? 'Lower\u001FCobalt' : 'Cobalt';
		const manualOrders = {
			[scope]: {
				[amberKey]: ['Specimens/Prism-002.md', 'Specimens/Prism-001.md'],
				[cobaltKey]: ['Specimens/Prism-005.md', 'Specimens/Prism-003.md'],
			},
		};
		const sort = (direction: string) => [{ property: 'file.name', direction }];

		beforeEach(async () => {
			await browser.reloadObsidian({ vault: fixture, copy: true });
			await openBoard();
			await expectInitialBoard();
			await sandboxPath();
			await browser.executeObsidian(async ({ app }) => {
				await app.vault.create('Specimens/Prism-005.md', '---\nphase: Cobalt\nband: Lower\n---\nSynthetic specimen.');
				// Preferences are loaded when a view is created or an axis changes.
				// Seed them before opening the view, as a saved .base file would.
				await app.workspace.getLeaf(false).setViewState({ type: 'empty' });
			});
			await configure({
				swimlaneByProperty: swimlanes ? 'note.band' : null,
				cardOrders: manualOrders,
				columnOrders: { 'note.phase': ['Violet', 'Cobalt', 'Amber'] },
				swimlaneOrders: { 'note.phase\u001Fnote.band': ['Lower', 'Upper'] },
				sort: [],
			});
			await openBoard();
			await expectOrder(amber, ['Prism-002', 'Prism-001']);
			await expectOrder(cobalt, ['Prism-005', 'Prism-003']);
		});

		it('overrides saved card order, updates live, survives restart, and restores manual order', async () => {
			await configure({ sort: sort('ASC') });
			await expectOrder(amber, ['Prism-001', 'Prism-002']);
			await expectOrder(cobalt, ['Prism-003', 'Prism-005']);
			await configure({ sort: sort('DESC') });
			await expectOrder(amber, ['Prism-002', 'Prism-001']);
			await expectOrder(cobalt, ['Prism-005', 'Prism-003']);
			await configure({ sort: sort('ASC') });
			await expectOrder(amber, ['Prism-001', 'Prism-002']);
			await browser.reloadObsidian();
			await openBoard();
			await expectOrder(amber, ['Prism-001', 'Prism-002']);
			await expectOrder(cobalt, ['Prism-003', 'Prism-005']);
			const axis = swimlanes ? '.obk-swimlane[data-swimlane-value="Upper"] ' : '';
			expect(await browser.$$(`${axis}.obk-column`).map((el) => el.getAttribute('data-column-value'))).toEqual([
				'Violet',
				'Cobalt',
				'Amber',
			]);
			if (swimlanes) {
				expect(await browser.$$('.obk-swimlane').map((el) => el.getAttribute('data-swimlane-value'))).toEqual([
					'Lower',
					'Upper',
				]);
			}
			await configure({ sort: [] });
			await expectOrder(amber, ['Prism-002', 'Prism-001']);
			await expectOrder(cobalt, ['Prism-005', 'Prism-003']);
		});

		it('rejects manual reordering while sorted but allows moving between cells', async () => {
			await configure({ sort: sort('ASC') });
			await expectOrder(amber, ['Prism-001', 'Prism-002']);
			await pointerDrag(card('Prism-002'), card('Prism-001'), 0.1);
			await expect(browser.$('.notice')).toHaveText(expect.stringContaining('Sort is active'));
			await expectOrder(amber, ['Prism-001', 'Prism-002']);
			await pointerDrag(card('Prism-001'), `${cobalt} .obk-column-body`, 0.9);
			await expectProperties('Prism-001', 'Cobalt', swimlanes ? 'Lower' : 'Upper');
			await expectOrder(amber, ['Prism-002']);
			await expectOrder(cobalt, ['Prism-001', 'Prism-003', 'Prism-005']);
			await browser.reloadObsidian();
			await openBoard();
			await expectOrder(cobalt, ['Prism-001', 'Prism-003', 'Prism-005']);
		});
	});
}
