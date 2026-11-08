import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
	chmodSync,
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { checkChangesets } from '../scripts/check-changesets.mjs';
import { readJson, releaseNotes, syncVersions, verifyVersions, writeJson } from '../scripts/release-utils.mjs';

function fixture(t, type) {
	const root = mkdtempSync(join(tmpdir(), 'kanban-release-test-'));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
	git('init', '-q');
	git('config', 'user.name', 'Release test');
	git('config', 'user.email', 'test@example.invalid');
	mkdirSync(join(root, '.changeset'));
	copyFileSync('.changeset/config.json', join(root, '.changeset/config.json'));
	writeJson(root, 'package.json', { name: 'kanban-bases-view', version: '0.10.6', private: true });
	writeJson(root, 'manifest.json', { version: '0.10.6', minAppVersion: '1.10.2' });
	writeJson(root, 'versions.json', { '0.10.6': '1.10.2' });
	writeJson(root, 'package-lock.json', { version: '0.10.6', packages: { '': { version: '0.10.6' } } });
	if (type)
		writeFileSync(join(root, '.changeset/example.md'), `---\n"kanban-bases-view": ${type}\n---\n\nExample change.\n`);
	git('add', '.');
	git('commit', '-qm', 'Base');
	const base = git('rev-parse', 'HEAD');
	return { root, git, base };
}

test('rejects a PR without a new changeset', async (t) => {
	const { root, base } = fixture(t);
	await assert.rejects(checkChangesets(root, base), /Every PR must add a changeset/);
});

test('accepts an empty changeset without creating a release', async (t) => {
	const { root, base, git } = fixture(t);
	writeFileSync(join(root, '.changeset/docs.md'), '---\n---\n');
	git('add', '.');
	await checkChangesets(root, base);
});

test('accepts a feature changeset and rejects editing an existing one', async (t) => {
	const { root, base, git } = fixture(t, 'patch');
	writeFileSync(join(root, '.changeset/feature.md'), '---\n"kanban-bases-view": minor\n---\n\nNew feature.\n');
	git('add', '.');
	await checkChangesets(root, base);
	writeFileSync(join(root, '.changeset/example.md'), '---\n"kanban-bases-view": minor\n---\n\nChanged.\n');
	await assert.rejects(checkChangesets(root, base), /Existing changesets/);
});

test('rejects invalid package names', async (t) => {
	const { root, base, git } = fixture(t);
	writeFileSync(join(root, '.changeset/invalid.md'), '---\n"unknown-package": patch\n---\n\nInvalid.\n');
	git('add', '.');
	await assert.rejects(checkChangesets(root, base), /unknown-package/);
});

for (const [type, version] of [
	['patch', '0.10.7'],
	['minor', '0.11.0'],
	['major', '1.0.0'],
]) {
	test(`real Changesets ${type} bump produces a valid release PR (${version})`, async (t) => {
		const { root, base, git } = fixture(t, type);
		symlinkSync(resolve('node_modules'), join(root, 'node_modules'), 'dir');
		execFileSync(process.execPath, [resolve('scripts/version.mjs')], { cwd: root, stdio: 'pipe' });
		assert.equal(verifyVersions(root), version);
		git('add', '-u');
		git('add', 'CHANGELOG.md');
		await checkChangesets(root, base);
		assert.match(releaseNotes(readFileSync(join(root, 'CHANGELOG.md'), 'utf8'), version), /Example change/);
		writeFileSync(join(root, 'source.ts'), 'export const mixedChange = true;\n');
		git('add', 'source.ts');
		await assert.rejects(checkChangesets(root, base), /Release PRs may only/);
	});
}

test('rejects a manual bump that disagrees with the pending release plan', async (t) => {
	const { root, base, git } = fixture(t, 'patch');
	const pkg = readJson(root, 'package.json');
	pkg.version = '0.11.0';
	writeJson(root, 'package.json', pkg);
	syncVersions(root);
	rmSync(join(root, '.changeset/example.md'));
	writeFileSync(join(root, 'CHANGELOG.md'), '## 0.11.0\n\nWrong bump.\n');
	git('add', '.');
	await assert.rejects(checkChangesets(root, base), /Version must match/);
});

test('version command refuses empty-only changesets without changing metadata', (t) => {
	const { root, git } = fixture(t);
	writeFileSync(join(root, '.changeset/docs.md'), '---\n---\n');
	git('add', '.');
	git('commit', '-qm', 'Docs only');
	assert.throws(
		() =>
			execFileSync(process.execPath, [resolve('scripts/version.mjs')], {
				cwd: root,
				stdio: 'pipe',
			}),
		/empty changesets do not trigger releases/,
	);
	assert.equal(verifyVersions(root), '0.10.6');
	assert.equal(git('status', '--porcelain'), '');
});

test('checks minimum app version and preserves historical mappings', (t) => {
	const { root } = fixture(t);
	const pkg = readJson(root, 'package.json');
	pkg.version = '0.10.7';
	writeJson(root, 'package.json', pkg);
	syncVersions(root);
	assert.equal(verifyVersions(root), '0.10.7');
	assert.equal(readJson(root, 'versions.json')['0.10.6'], '1.10.2');
	writeJson(root, 'versions.json', { '0.10.7': '1.0.0' });
	assert.throws(() => verifyVersions(root), /minAppVersion/);
});

test('release notes select only the requested version and reject missing or empty notes', () => {
	const changelog = '# Changelog\n\n## 1.0.0\n\n### Major Changes\n\nBreaking change.\n\n## 0.10.7\n\nFix.\n';
	assert.equal(releaseNotes(changelog, '1.0.0'), '### Major Changes\n\nBreaking change.\n');
	assert.throws(() => releaseNotes(changelog, '0.10.8'), /Missing changelog/);
	assert.throws(() => releaseNotes('## 1.0.0\n\n## 0.10.7\nFix.\n', '1.0.0'), /Empty changelog/);
});

function publisher(t, release, apiError = '') {
	const { root, git, base } = fixture(t);
	mkdirSync(join(root, 'dist'));
	mkdirSync(join(root, 'bin'));
	copyFileSync(join(root, 'manifest.json'), join(root, 'dist/manifest.json'));
	writeFileSync(join(root, 'dist/main.js'), '// built plugin');
	writeFileSync(join(root, 'dist/styles.css'), '/* styles */');
	writeFileSync(join(root, 'CHANGELOG.md'), '## 0.10.6\n\nRelease notes.\n');
	const ghPath = join(root, 'bin/gh');
	writeFileSync(
		ghPath,
		`#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
appendFileSync(process.env.CALL_LOG, JSON.stringify(process.argv.slice(2)) + '\\n');
if (process.argv[2] === 'api') {
  if (process.env.API_ERROR) {
    process.stderr.write(process.env.API_ERROR);
    process.exit(1);
  }
  console.log(process.env.RELEASE_JSON);
}
`,
	);
	chmodSync(ghPath, 0o755);
	const run = (mode = 'publish') =>
		execFileSync(process.execPath, [resolve('scripts/publish-release.mjs'), mode], {
			cwd: root,
			encoding: 'utf8',
			stdio: 'pipe',
			env: {
				...process.env,
				PATH: `${join(root, 'bin')}:${process.env.PATH}`,
				CALL_LOG: join(root, 'calls.jsonl'),
				RELEASE_JSON: JSON.stringify(release),
				API_ERROR: apiError,
				GITHUB_SHA: base,
				GITHUB_REPOSITORY: 'test/repo',
				GITHUB_OUTPUT: join(root, 'outputs'),
			},
		});
	const calls = () => readFileSync(join(root, 'calls.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
	return { root, git, base, run, calls };
}

test('publisher creates a draft, uploads every artifact, then publishes', (t) => {
	const { run, calls, base } = publisher(t, null, 'gh: Not Found (HTTP 404)');
	run();
	const commands = calls();
	assert.equal(commands.length, 4);
	assert.deepEqual(commands[1].slice(0, 3), ['release', 'create', '0.10.6']);
	assert.ok(commands[1].includes('--draft'));
	assert.ok(commands[1].includes(base));
	assert.deepEqual(commands[2], [
		'release',
		'upload',
		'0.10.6',
		'dist/main.js',
		'dist/manifest.json',
		'dist/styles.css',
		'--clobber',
	]);
	assert.ok(commands[3].includes('--draft=false'));
});

test('publisher leaves an already published release untouched', (t) => {
	const { root, run, calls } = publisher(t, { draft: false });
	run('check');
	assert.equal(readFileSync(join(root, 'outputs'), 'utf8'), 'needed=false\n');
	run();
	assert.ok(calls().every((args) => args[0] === 'api'));
});

test('publisher fails closed on API errors other than 404', (t) => {
	const { run, calls } = publisher(t, null, 'gh: Bad credentials (HTTP 401)');
	assert.throws(() => run(), /HTTP 401/);
	assert.equal(calls().length, 1);
});

test('publisher refuses an existing tag from a different commit', (t) => {
	const { root, git, run, calls } = publisher(t, null, 'gh: Not Found (HTTP 404)');
	writeFileSync(join(root, 'later.txt'), 'Later commit');
	git('add', 'later.txt');
	git('commit', '-qm', 'Later');
	git('tag', '0.10.6');
	assert.throws(() => run(), /different commit/);
	assert.equal(calls().length, 1);
});

test('publisher resumes a draft for the original commit without recreating it', (t) => {
	// The fixture commit is deterministic only within this fixture, so set the mock after setup.
	const fixture = publisher(t, { draft: true });
	const mock = join(fixture.root, 'bin/gh');
	writeFileSync(
		mock,
		readFileSync(mock, 'utf8').replace(
			'console.log(process.env.RELEASE_JSON);',
			`console.log(JSON.stringify({ draft: true, target_commitish: '${fixture.base}' }));`,
		),
	);
	fixture.run();
	const commands = fixture.calls();
	assert.equal(commands.length, 3);
	assert.equal(commands[1][1], 'upload');
	assert.equal(commands[2][1], 'edit');
});

test('publisher leaves a draft unpublished if an asset upload fails', (t) => {
	const fixture = publisher(t, null, 'gh: Not Found (HTTP 404)');
	const mock = join(fixture.root, 'bin/gh');
	writeFileSync(
		mock,
		readFileSync(mock, 'utf8').replace(
			"if (process.argv[2] === 'api') {",
			"if (process.argv[3] === 'upload') { process.stderr.write('upload failed'); process.exit(1); }\nif (process.argv[2] === 'api') {",
		),
	);
	assert.throws(() => fixture.run(), /upload failed/);
	assert.ok(!fixture.calls().some((args) => args[1] === 'edit'));
});

test('publisher refuses to resume a draft from a different commit', (t) => {
	const { run, calls } = publisher(t, { draft: true, target_commitish: '0'.repeat(40) });
	assert.throws(() => run(), /original commit/);
	assert.equal(calls().length, 1);
});
