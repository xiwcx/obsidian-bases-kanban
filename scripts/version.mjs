import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { getReleasePlan } from '@changesets/get-release-plan';
import { syncVersions, verifyVersions } from './release-utils.mjs';

const root = process.cwd();
verifyVersions(root);
assert.equal(
	execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim(),
	'',
	'Commit or stash tracked changes before preparing a release',
);
const plan = await getReleasePlan(root);
assert.ok(plan.releases.length, 'No release changesets found; empty changesets do not trigger releases');
execFileSync('npm', ['exec', '--', 'changeset', 'version'], { stdio: 'inherit' });
syncVersions(root);
execFileSync('npm', ['exec', '--', 'biome', 'format', '--write', 'package.json', 'manifest.json', 'versions.json'], {
	stdio: 'inherit',
});
verifyVersions(root);
console.log('Review the generated versions and CHANGELOG.md, run all checks, then open a release PR.');
