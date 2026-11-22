import { browser, expect } from '@wdio/globals';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { obsidianPage } from 'wdio-obsidian-service';
import { card, fixture, openBoard, pluginId, sandboxPath } from '../helpers/board.mjs';

const selector = card('Prism-001');
const dateInputs = `${selector} input:is([type="date"], [type="datetime-local"])`;

async function inputValues(): Promise<string[]> {
	return browser.execute(
		(selector) =>
			Array.from(
				document.querySelectorAll<HTMLElement>(`${selector} .obk-card-property-value`),
				(value) => value.querySelector<HTMLInputElement>('input')?.value ?? value.textContent ?? '',
			),
		selector,
	);
}

async function assertNativeDates(): Promise<void> {
	await expect(browser.$$(`${selector} .obk-card-property-value`)).toBeElementsArrayOfSize(4);
	const values = await inputValues();
	const native = await browser.executeObsidian(({ app, obsidian }) => {
		const note = app.vault.getFileByPath('Specimens/Prism-001.md');
		if (!note) throw new Error('Missing fixture');
		return [
			'2026-11-20',
			'2026-11-20T14:30:00',
			new Date(note.stat.ctime).toISOString(),
			new Date(note.stat.mtime).toISOString(),
		].map((date) => {
			const value = obsidian.DateValue.parseFromString(date);
			if (!value) throw new Error('Invalid reference date');
			const el = createDiv();
			value.renderTo(el, app.renderContext);
			return el.querySelector<HTMLInputElement>('input')?.value ?? el.textContent ?? '';
		});
	});
	expect(values).toEqual(native);
	const inputCount = await browser.$$(dateInputs).length;
	if (inputCount === 0) {
		// Newer Obsidian versions render localized text. Do not force inputs or
		// apply legacy-input expectations to that native representation.
		for (const value of values) expect(value).not.toBe('');
		const fits = await browser.execute(
			(selector) =>
				Array.from(
					document.querySelectorAll<HTMLElement>(`${selector} .obk-card-property-value`),
					(el) => el.scrollWidth <= el.clientWidth,
				),
			selector,
		);
		expect(fits).toEqual([true, true, true, true]);
		return;
	}
	expect(inputCount).toBe(4);
	expect(values[0]).toBe('2026-11-20');
	// datetime-local must keep the wall-clock time, not convert it to a UTC string.
	expect(values[1]).toMatch(/^2026-11-20T14:30/);
	expect(values[2]).not.toBe('');
	expect(values[3]).not.toBe('');
	const geometry = await browser.execute(
		(selector) =>
			Array.from(document.querySelectorAll<HTMLInputElement>(selector), (input) => {
				const style = getComputedStyle(input);
				const rect = input.getBoundingClientRect();
				const cardRect = input.closest('.obk-card')!.getBoundingClientRect();
				const row = input.closest('.obk-card-property')!.getBoundingClientRect();
				return {
					border: style.borderTopWidth,
					padding: style.paddingLeft,
					background: style.backgroundColor,
					fits: rect.right <= cardRect.right && rect.left >= cardRect.left && rect.bottom <= row.bottom + 1,
					height: rect.height,
					disabled: input.disabled,
				};
			}),
		dateInputs,
	);
	for (const input of geometry) {
		expect(input.border).toBe('0px');
		expect(input.padding).toBe('0px');
		expect(input.background).toBe('rgba(0, 0, 0, 0)');
		expect(input.fits).toBe(true);
		expect(input.height).toBeGreaterThan(0);
		expect(input.height).toBeLessThan(28);
		expect(input.disabled).toBe(true);
	}
}

async function highlight(): Promise<void> {
	await browser.execute(
		(selector, annotation) => {
			document.querySelectorAll<HTMLElement>(`${selector} .obk-card-property`).forEach((row) => {
				// Documentation-only outlines do not affect layout or date formatting.
				row.setCssProps(annotation);
			});
		},
		selector,
		{ outline: '1px solid var(--color-purple)', 'outline-offset': '1px' },
	);
}

// Swap only the stylesheet in the guarded disposable vault. The native renderer,
// note values, timestamps, locale, timezone, and window remain identical.
async function captureComparison(baselineStyles: string): Promise<void> {
	const vault = await sandboxPath();
	const configDir = await browser.executeObsidian(({ app }) => app.vault.configDir);
	const stylesPath = path.join(vault, configDir, 'plugins', pluginId, 'styles.css');
	const fixedStyles = await readFile(stylesPath);
	const values = await inputValues();
	const reloadStyles = async (styles: Uint8Array) => {
		await browser.executeObsidian(async ({ app }) => {
			await app.workspace.getLeaf(false).setViewState({ type: 'empty' });
		});
		await obsidianPage.disablePlugin(pluginId);
		await writeFile(stylesPath, styles);
		await obsidianPage.enablePlugin(pluginId);
		await openBoard();
		await expect(browser.$$(dateInputs)).toBeElementsArrayOfSize(4);
		expect(await inputValues()).toEqual(values);
		await highlight();
	};
	await highlight();
	await browser.$(selector).saveScreenshot('docs/screenshots/date-properties-after.png');
	try {
		await reloadStyles(await readFile(baselineStyles));
		await browser.$(selector).saveScreenshot('docs/screenshots/date-properties-before.png');
	} finally {
		await reloadStyles(fixedStyles);
	}
	await assertNativeDates();
}

describe('Native date property rendering', () => {
	it('keeps local date inputs compact and within the card in light, dark, and narrow layouts', async () => {
		await browser.reloadObsidian({ vault: fixture, copy: true });
		await sandboxPath();
		await browser.executeObsidian(async ({ app, obsidian }) => {
			const base = app.vault.getFileByPath('Polygon laboratory.base');
			const note = app.vault.getFileByPath('Specimens/Prism-001.md');
			if (!base || !note) throw new Error('Missing fixture');
			await app.fileManager.processFrontMatter(note, (fm: Record<string, unknown>) => {
				fm.due = '2026-11-20';
				fm.appointment = '2026-11-20T14:30:00';
			});
			const config = obsidian.parseYaml(await app.vault.read(base)) as {
				filters: unknown;
				views: Record<string, unknown>[];
			};
			config.filters = { and: ['file.path == "Specimens/Prism-001.md"'] };
			delete config.views[0].swimlaneByProperty;
			config.views[0].order = ['note.due', 'note.appointment', 'file.ctime', 'file.mtime'];
			await app.vault.modify(base, obsidian.stringifyYaml(config));
		});
		await openBoard();
		await assertNativeDates();
		const nativeText = (await browser.$$(dateInputs).length) === 0;
		if (process.env.CAPTURE_SCREENSHOTS) {
			await mkdir('docs/screenshots', { recursive: true });
			if (nativeText) await browser.$(selector).saveScreenshot('docs/screenshots/date-properties-native-text.png');
			else if (process.env.DATE_BASELINE_STYLES) await captureComparison(process.env.DATE_BASELINE_STYLES);
		}
		const values = await inputValues();
		for (const theme of ['light', 'dark']) {
			await browser.execute(
				(theme, selector, sizing) => {
					document.body.classList.remove('theme-light', 'theme-dark');
					document.body.classList.add(`theme-${theme}`);
					document.querySelector<HTMLElement>(selector)!.setCssProps(sizing);
				},
				theme,
				selector,
				{ width: '240px', 'max-width': '240px' },
			);
			await browser.waitUntil(() =>
				browser.execute(
					(selector) =>
						document
							.querySelector(selector)!
							.getAnimations()
							.every((animation) => animation.playState !== 'running'),
					selector,
				),
			);
			await assertNativeDates();
			expect(await inputValues()).toEqual(values);
			if (process.env.CAPTURE_SCREENSHOTS) {
				await highlight();
				const suffix = nativeText ? '-native-text' : '';
				await browser.$(selector).saveScreenshot(`docs/screenshots/date-properties-narrow-${theme}${suffix}.png`);
			}
		}
	});
});
