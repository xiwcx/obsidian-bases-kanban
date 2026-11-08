import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getReleasePlan } from '@changesets/get-release-plan';
import { readJson, releaseNotes, verifyVersions } from './release-utils.mjs';

export async function checkChangesets(root, base) {
	const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
	const show = (file) => execFileSync('git', ['show', `${base}:${file}`], { cwd: root, encoding: 'utf8' });
	const before = JSON.parse(show('package.json'));
	const current = readJson(root, 'package.json');
	const changed = git('diff', '--name-only', base, '--').split('\n').filter(Boolean);
	const isChangeset = (file) => /^\.changeset\/[^/]+\.md$/.test(file) && file !== '.changeset/README.md';
	const plan = await getReleasePlan(root); // Also validates all changeset contents and package names.
	verifyVersions(root);
	if (before.version === current.version) {
		const added = git('diff', '--diff-filter=A', '--name-only', base, '--').split('\n').filter(isChangeset);
		assert.ok(added.length, 'Every PR must add a changeset: npm run changeset (or -- --empty)');
		for (const file of added) {
			const id = file.slice('.changeset/'.length, -3);
			assert.ok(
				plan.changesets.some((changeset) => changeset.id === id),
				`Invalid changeset: ${file}`,
			);
		}
		assert.ok(
			!changed.some((file) => isChangeset(file) && !added.includes(file)),
			'Existing changesets may only be consumed by a release PR',
		);
		console.log('New changeset found and validated.');
		return;
	}

	// A release PR is recognized by its contents, never by a bypass label or branch name.
	const allowed = new Set(['package.json', 'package-lock.json', 'manifest.json', 'versions.json', 'CHANGELOG.md']);
	assert.ok(
		changed.every((file) => allowed.has(file) || isChangeset(file)),
		'Release PRs may only update version metadata, changelog, and consume changesets',
	);
	assert.equal(plan.changesets.length, 0, 'Release PRs must consume all changesets');
	const snapshot = mkdtempSync(join(tmpdir(), 'kanban-release-plan-'));
	try {
		mkdirSync(join(snapshot, '.changeset'));
		writeFileSync(join(snapshot, 'package.json'), JSON.stringify(before));
		const files = git('ls-tree', '-r', '--name-only', base, '--', '.changeset').split('\n');
		for (const file of files.filter((file) => isChangeset(file) || file === '.changeset/config.json')) {
			writeFileSync(join(snapshot, file), show(file));
		}
		const previousPlan = await getReleasePlan(snapshot);
		const release = previousPlan.releases.find((item) => item.name === current.name);
		assert.ok(release, 'No pending release exists on the base branch');
		assert.equal(current.version, release.newVersion, 'Version must match the Changesets release plan');
	} finally {
		rmSync(snapshot, { recursive: true, force: true });
	}
	releaseNotes(readFileSync(join(root, 'CHANGELOG.md'), 'utf8'), current.version);
	// Do not let a version PR also change dependencies, scripts, or other package settings.
	assert.deepEqual({ ...current, version: before.version }, before, 'Release PR may only change package.json version');
	const oldManifest = JSON.parse(show('manifest.json'));
	const manifest = readJson(root, 'manifest.json');
	assert.deepEqual(
		{ ...manifest, version: oldManifest.version },
		oldManifest,
		'Change minimum app requirements in a normal PR before preparing a release',
	);
	const oldVersions = JSON.parse(show('versions.json'));
	assert.deepEqual(
		readJson(root, 'versions.json'),
		{ ...oldVersions, [current.version]: manifest.minAppVersion },
		'Release PR must preserve historical compatibility mappings',
	);
	const oldLock = JSON.parse(show('package-lock.json'));
	const lock = readJson(root, 'package-lock.json');
	lock.version = oldLock.version;
	lock.packages[''].version = oldLock.packages[''].version;
	assert.deepEqual(lock, oldLock, 'Release PR must not change dependency resolutions');
	console.log(`Release PR validated: ${current.version}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	await checkChangesets(process.cwd(), process.argv[2] || 'origin/main');
}
