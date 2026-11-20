import { once } from 'node:events';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ObsidianLauncher from 'obsidian-launcher';

// Fixed synthetic source; no CLI argument or environment variable can select a
// different vault. This script owns this directory and only this child process.
const fixture = path.resolve('e2e/vault');
const marker = await readFile(path.join(fixture, 'SYNTHETIC-VAULT.md'), 'utf8');
if (!marker.startsWith('OBK-E2E-POLYGON-LABORATORY-ONLY\n')) throw new Error('Synthetic fixture marker missing');
const owned = await mkdtemp(path.join(tmpdir(), 'obk-manual-'));
const vault = path.join(owned, 'Polygon laboratory');
let configDir;
try {
	await cp(fixture, vault, { recursive: true });
	const launcher = new ObsidianLauncher({ cacheDir: path.resolve('.obsidian-cache') });
	const launched = await launcher.launch({
		appVersion: '1.10.6',
		installerVersion: '1.10.6',
		vault,
		copy: false, // Already copied into the directory we own above.
		plugins: [path.resolve('dist')],
		spawnOptions: { stdio: 'inherit' },
	});
	configDir = launched.configDir;
	const { proc } = launched;
	const stop = () => proc.kill('SIGTERM');
	process.once('SIGINT', stop);
	process.once('SIGTERM', stop);
	console.log('Synthetic vault ready. Quit this Obsidian instance or press Ctrl+C to clean up.');
	try {
		await once(proc, 'exit');
	} finally {
		process.removeListener('SIGINT', stop);
		process.removeListener('SIGTERM', stop);
	}
} finally {
	await rm(owned, { recursive: true, force: true });
	if (configDir) await rm(configDir, { recursive: true, force: true });
}
