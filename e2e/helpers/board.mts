import { readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

export const fixture = path.resolve('e2e/vault');
export const baseFile = 'Polygon laboratory.base';
export const pluginId = 'kanban-bases-view';

// No caller may substitute another vault. Check the actual application's path,
// not just the runner's requested capabilities, before filesystem access.
export async function sandboxPath(): Promise<string> {
	const vault = await realpath(obsidianPage.getVaultPath());
	const actual = await browser.executeObsidian(({ app, obsidian }) => {
		if (!(app.vault.adapter instanceof obsidian.FileSystemAdapter)) throw new Error('Expected desktop fixture adapter');
		return app.vault.adapter.getBasePath();
	});
	if (vault === (await realpath(fixture)) || vault !== (await realpath(actual))) {
		throw new Error('Refusing to use a vault other than the disposable fixture copy');
	}
	const marker = await readFile(path.join(vault, 'SYNTHETIC-VAULT.md'), 'utf8');
	if (!marker.startsWith('OBK-E2E-POLYGON-LABORATORY-ONLY\n')) {
		throw new Error('Synthetic vault marker missing; refusing vault access');
	}
	return vault;
}

export async function openBoard(): Promise<void> {
	await sandboxPath();
	await browser.executeObsidian(async ({ app }, fileName) => {
		const file = app.vault.getFileByPath(fileName);
		if (!file) throw new Error('Synthetic board not indexed');
		app.workspace.leftSplit.collapse();
		await app.workspace.getLeaf(false).openFile(file);
	}, baseFile);
	await expect(browser.$('.obk-board')).toBeDisplayed();
	await browser.waitUntil(async () => (await browser.$$('.obk-card').length) === 4, {
		timeoutMsg: 'Synthetic specimens did not finish indexing/rendering',
	});
}

export function cell(phase: string, band = 'Upper'): string {
	return `.obk-swimlane[data-swimlane-value="${band}"] .obk-column[data-column-value="${phase}"]`;
}

export function card(name: string): string {
	return `.obk-card[data-entry-path="Specimens/${name}.md"]`;
}

export async function expectCard(name: string, phase: string, band = 'Upper'): Promise<void> {
	await expect(browser.$(`${cell(phase, band)} ${card(name)}`)).toBeDisplayed();
	await expect(browser.$$(card(name))).toBeElementsArrayOfSize(1);
}

export async function readNote(name: string): Promise<string> {
	return readFile(path.join(await sandboxPath(), 'Specimens', `${name}.md`), 'utf8');
}

export async function expectProperties(name: string, phase: string, band: string): Promise<void> {
	await browser.waitUntil(
		async () => {
			const content = await readNote(name);
			return content.includes(`phase: ${phase}`) && content.includes(`band: ${band}`);
		},
		{ timeoutMsg: `Frontmatter was not persisted for ${name}` },
	);
	await browser.waitUntil(
		async () =>
			browser.executeObsidian(
				({ app }, name, phase, band) => {
					const file = app.vault.getFileByPath(`Specimens/${name}.md`);
					const fm = file && app.metadataCache.getFileCache(file)?.frontmatter;
					return fm?.phase === phase && fm?.band === band;
				},
				name,
				phase,
				band,
			),
		{ timeoutMsg: `Metadata cache did not converge for ${name}` },
	);
}

export async function dragCard(name: string, phase: string, band = 'Upper'): Promise<void> {
	await pointerDrag(card(name), `${cell(phase, band)} .obk-column-body`);
}

export async function pointerDrag(sourceSelector: string, targetSelector: string, targetY = 0.2): Promise<void> {
	// Real WebDriver pointer actions through SortableJS, never a handler call.
	const source = browser.$(sourceSelector);
	const target = browser.$(targetSelector);
	await source.scrollIntoView();
	await target.scrollIntoView();
	const from = await source.getLocation();
	const size = await source.getSize();
	const to = await target.getLocation();
	const targetSize = await target.getSize();
	const x = Math.round(from.x + size.width / 2);
	const y = Math.round(from.y + size.height / 2);
	const endX = Math.round(to.x + targetSize.width / 2);
	const endY = Math.round(to.y + targetSize.height * targetY);
	const gesture = browser
		.action('pointer', { parameters: { pointerType: 'mouse' } })
		.move({ x, y })
		.down({ button: 0 })
		.pause(150)
		.move({ x: x + 8, y: y + 8, duration: 100 });
	for (let step = 1; step <= 8; step++) {
		gesture.move({
			x: Math.round(x + ((endX - x) * step) / 8),
			y: Math.round(y + ((endY - y) * step) / 8),
			duration: 80,
		});
	}
	// Gesture dwell times model human input/dragover, not application readiness.
	await gesture.pause(250).up({ button: 0 }).perform();
}

export async function externallyChangePhase(name: string, phase: string): Promise<void> {
	const file = path.join(await sandboxPath(), 'Specimens', `${name}.md`);
	await writeFile(file, (await readFile(file, 'utf8')).replace(/^phase: .*$/m, `phase: ${phase}`));
}
