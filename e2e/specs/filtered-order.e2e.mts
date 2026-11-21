import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { browser, expect } from '@wdio/globals';
import { baseFile, card, cell, openBoard, pointerDrag, sandboxPath } from '../helpers/board.mjs';

describe('Filtered card ordering', () => {
	it('retains hidden saved positions after a real filtered drag and restart', async () => {
		await openBoard();
		const vault = await sandboxPath();
		const basePath = path.join(vault, baseFile);
		const original = await readFile(basePath, 'utf8');
		await writeFile(
			path.join(vault, 'Specimens/Prism-005.md'),
			'---\nphase: Amber\nband: Upper\n---\nSynthetic hidden specimen.\n',
		);
		const ordered = `${original}    cardOrders:\n      "note.phase\\u001fnote.band":\n        "Upper\\u001fAmber":\n          - Specimens/Prism-001.md\n          - Specimens/Prism-005.md\n          - Specimens/Prism-002.md\n`;
		await writeFile(basePath, ordered);
		await browser.reloadObsidian();
		await openBoard();
		const paths = () => browser.$$(`${cell('Amber')} .obk-card`).map((el) => el.getAttribute('data-entry-path'));
		await browser.waitUntil(async () => (await paths()).length === 3);
		const filtered = ordered.replace(
			'    - file.inFolder("Specimens")',
			'    - file.inFolder("Specimens")\n    - \'!file.path.contains("Prism-005")\'',
		);
		await writeFile(basePath, filtered);
		await browser.reloadObsidian();
		await openBoard();
		await browser.waitUntil(async () => (await paths()).length === 2);
		await pointerDrag(card('Prism-002'), card('Prism-001'), 0.1);
		await browser.waitUntil(async () => (await paths())[0] === 'Specimens/Prism-002.md');
		await browser.waitUntil(async () => {
			const saved = await readFile(basePath, 'utf8');
			return saved.includes('Specimens/Prism-005.md') && saved.indexOf('Prism-002.md') < saved.indexOf('Prism-001.md');
		});
		const persisted = await readFile(basePath, 'utf8');
		await writeFile(
			basePath,
			persisted
				.split('\n')
				.filter((line) => !line.includes('!file.path.contains'))
				.join('\n'),
		);
		await browser.reloadObsidian();
		await openBoard();
		await browser.waitUntil(async () => (await paths()).length === 3);
		expect(await paths()).toEqual(['Specimens/Prism-002.md', 'Specimens/Prism-001.md', 'Specimens/Prism-005.md']);
	});
});
