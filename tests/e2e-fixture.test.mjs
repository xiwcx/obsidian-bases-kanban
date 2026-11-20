import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../e2e/vault/', import.meta.url));

test('E2E fixture contains only the invented polygon laboratory and minimal configuration', async () => {
	const files = [];
	async function walk(dir) {
		for (const entry of await readdir(dir, { withFileTypes: true })) {
			assert.equal(entry.isSymbolicLink(), false, 'Fixture must not link to another vault');
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) await walk(full);
			else files.push(path.relative(root, full));
		}
	}
	await walk(root);
	assert.deepEqual(
		files.sort(),
		[
			'.obsidian/app.json',
			'.obsidian/core-plugins.json',
			'Excluded sentinel.md',
			'Polygon laboratory.base',
			'SYNTHETIC-VAULT.md',
			'Specimens/Prism-001.md',
			'Specimens/Prism-002.md',
			'Specimens/Prism-003.md',
			'Specimens/Prism-004.md',
		].sort(),
	);
	const phases = ['Amber', 'Amber', 'Cobalt', 'Violet'];
	const bands = ['Upper', 'Upper', 'Lower', 'Upper'];
	for (let i = 0; i < 4; i++) {
		const id = String(i + 1).padStart(3, '0');
		assert.equal(
			await readFile(path.join(root, `Specimens/Prism-${id}.md`), 'utf8'),
			`---\nphase: ${phases[i]}\nband: ${bands[i]}\n---\nSynthetic polygon specimen ${id}. This file is invented test data.\n`,
		);
	}
	assert.deepEqual(JSON.parse(await readFile(path.join(root, '.obsidian/core-plugins.json'), 'utf8')), [
		'file-explorer',
		'switcher',
		'command-palette',
		'bases',
	]);
	assert.deepEqual(JSON.parse(await readFile(path.join(root, '.obsidian/app.json'), 'utf8')), {
		alwaysUpdateLinks: false,
		showInlineTitle: true,
	});
	assert.equal(
		await readFile(path.join(root, 'Polygon laboratory.base'), 'utf8'),
		[
			'filters:',
			'  and:',
			'    - file.inFolder("Specimens")',
			'views:',
			'  - type: kanban-view',
			'    name: Polygon laboratory',
			'    groupByProperty: note.phase',
			'    swimlaneByProperty: note.band',
			'    quickAddFolder: Specimens',
			'',
		].join('\n'),
	);
	assert.equal(
		await readFile(path.join(root, 'Excluded sentinel.md'), 'utf8'),
		'---\nphase: Forbidden\nband: Nowhere\n---\nSynthetic exclusion sentinel. The board must never show this file.\n',
	);
	for (const file of files) {
		const text = await readFile(path.join(root, file), 'utf8');
		assert.doesNotMatch(text, /https?:\/\/|obsidian:\/\/|\[\[|\/Users\/|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i, file);
	}
});
