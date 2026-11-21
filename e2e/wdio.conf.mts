import path from 'node:path';
import { access } from 'node:fs/promises';
import { fixture } from './helpers/board.mjs';
import { captureFailure } from './helpers/diagnostics.mjs';
import runtime from './runtime.json' with { type: 'json' };

// Public, reproducible defaults. Latest stable is opt-in for scheduled CI.
const appVersion = process.env.OBSIDIAN_APP_VERSION || runtime.appVersion;
const installerVersion = process.env.OBSIDIAN_INSTALLER_VERSION || runtime.installerVersion;

export const config: WebdriverIO.Config = {
	runner: 'local',
	framework: 'mocha',
	specs: ['./specs/**/*.e2e.mts'],
	maxInstances: 1,
	capabilities: [
		{
			browserName: 'obsidian',
			browserVersion: appVersion,
			'wdio:obsidianOptions': {
				installerVersion,
				plugins: [path.resolve('dist')],
				vault: fixture,
				copy: true,
			},
			'goog:chromeOptions': {
				args: process.platform === 'linux' ? ['--ozone-platform=x11'] : [],
			},
		},
	],
	services: ['obsidian'],
	reporters: ['spec'],
	cacheDir: path.resolve('.obsidian-cache'),
	outputDir: path.resolve('e2e-results/logs'),
	logLevel: 'warn',
	waitforTimeout: 15000,
	connectionRetryCount: 1,
	mochaOpts: { ui: 'bdd', timeout: 90000 },
	onPrepare: async () => {
		for (const file of ['main.js', 'manifest.json', 'styles.css']) await access(path.resolve('dist', file));
	},
	afterTest: async (test, _context, { passed }) => {
		if (!passed) await captureFailure(test.title);
	},
};
