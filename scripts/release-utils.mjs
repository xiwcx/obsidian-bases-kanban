import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const readJson = (root, file) => JSON.parse(readFileSync(join(root, file), 'utf8'));
export const writeJson = (root, file, data) => writeFileSync(join(root, file), `${JSON.stringify(data, null, '\t')}\n`);

export function verifyVersions(root) {
	const pkg = readJson(root, 'package.json');
	const manifest = readJson(root, 'manifest.json');
	const lock = readJson(root, 'package-lock.json');
	const versions = readJson(root, 'versions.json');
	assert.match(pkg.version, /^\d+\.\d+\.\d+$/, 'Only stable x.y.z versions are supported');
	assert.equal(manifest.version, pkg.version, 'manifest.json version must match package.json');
	assert.equal(lock.version, pkg.version, 'Lockfile version must match package.json');
	assert.equal(lock.packages[''].version, pkg.version, 'Lockfile root version must match package.json');
	assert.equal(versions[pkg.version], manifest.minAppVersion, 'versions.json must match minAppVersion');
	return pkg.version;
}

export function syncVersions(root) {
	const { version } = readJson(root, 'package.json');
	const manifest = readJson(root, 'manifest.json');
	const versions = readJson(root, 'versions.json');
	const lock = readJson(root, 'package-lock.json');
	manifest.version = version;
	versions[version] = manifest.minAppVersion;
	lock.version = version;
	lock.packages[''].version = version;
	writeJson(root, 'manifest.json', manifest);
	writeJson(root, 'versions.json', versions);
	writeJson(root, 'package-lock.json', lock);
}

export function releaseNotes(changelog, version) {
	const lines = changelog.split('\n');
	const start = lines.findIndex((line) => line.trim() === `## ${version}`);
	assert.notEqual(start, -1, `Missing changelog entry for ${version}`);
	const end = lines.findIndex((line, index) => index > start && /^## /.test(line));
	const notes = lines
		.slice(start + 1, end === -1 ? undefined : end)
		.join('\n')
		.trim();
	assert.ok(notes, `Empty changelog entry for ${version}`);
	return `${notes}\n`;
}
