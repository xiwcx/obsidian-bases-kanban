import { browser } from '@wdio/globals';
import { baseFile, sandboxPath } from './board.mjs';

// Edit the public .base format through the vault, not plugin view internals.
export async function configureBase(patch: Record<string, unknown>): Promise<void> {
	await sandboxPath();
	await browser.executeObsidian(
		async ({ app, obsidian }, fileName, patch) => {
			const file = app.vault.getFileByPath(fileName);
			if (!file) throw new Error('Synthetic board not indexed');
			const config = obsidian.parseYaml(await app.vault.read(file)) as { views: Record<string, unknown>[] };
			Object.assign(config.views[0], patch);
			await app.vault.modify(file, obsidian.stringifyYaml(config));
		},
		baseFile,
		patch,
	);
}
