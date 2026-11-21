import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { browser } from '@wdio/globals';
import { sandboxPath } from './board.mjs';

export async function captureFailure(title: string): Promise<void> {
	const dir = path.resolve('e2e-results', `${Date.now()}-${title.replace(/[^a-z0-9]+/gi, '-').slice(0, 80)}`);
	await mkdir(dir, { recursive: true });
	// A broken renderer must not prevent the other artifacts being collected.
	const capture = async (name: string, action: () => Promise<unknown>) => {
		try {
			const value = await action();
			if (value !== undefined)
				await writeFile(path.join(dir, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2));
		} catch (error) {
			await writeFile(path.join(dir, `${name}.error.txt`), String(error));
		}
	};
	await capture('screenshot.png', async () => {
		await browser.saveScreenshot(path.join(dir, 'screenshot.png'));
	});
	await capture('dom.html', () => browser.getPageSource());
	await capture('console.json', () => browser.getLogs('browser'));
	await capture('versions.json', () =>
		browser.executeObsidian(({ app, obsidian }) => ({
			app: obsidian.apiVersion,
			vault: app.vault.getName(),
		})),
	);
	await capture('runtime.json', async () => ({
		app: browser.getObsidianVersion(),
		installer: browser.getObsidianInstallerVersion(),
		browser: browser.capabilities.browserVersion,
	}));
	await capture('capabilities.json', async () => browser.capabilities);
	await capture('vault.json', async () => {
		const vault = await sandboxPath();
		const files = [
			'Polygon laboratory.base',
			...(await readdir(path.join(vault, 'Specimens'))).map((name) => `Specimens/${name}`),
		];
		const contents: Record<string, string> = {};
		for (const name of files) contents[name] = await readFile(path.join(vault, name), 'utf8');
		return contents;
	});
}
