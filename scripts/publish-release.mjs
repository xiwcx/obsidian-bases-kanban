import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { releaseNotes, verifyVersions } from './release-utils.mjs';

const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const version = verifyVersions(process.cwd());
assert.equal(
	JSON.parse(readFileSync('dist/manifest.json', 'utf8')).version,
	version,
	'Build artifacts must match the checked-out release',
);
let release;
try {
	release = JSON.parse(gh('api', `repos/${process.env.GITHUB_REPOSITORY}/releases/tags/${version}`));
} catch (error) {
	if (!error.stderr?.toString().includes('(HTTP 404)')) throw error;
}

if (process.argv[2] === 'check') {
	// Published releases are immutable; drafts are safe to resume after a failed upload.
	const needed = !release || release.draft;
	appendFileSync(process.env.GITHUB_OUTPUT, `needed=${needed}\n`);
} else if (!release || release.draft) {
	const sha = process.env.GITHUB_SHA;
	assert.match(sha, /^[a-f0-9]{40}$/);
	if (release) {
		assert.equal(release.target_commitish, sha, 'Resume a draft release only from its original commit');
	}
	const tag = execFileSync('git', ['tag', '--list', version], { encoding: 'utf8' }).trim();
	if (tag) {
		const target = execFileSync('git', ['rev-list', '-n', '1', version], { encoding: 'utf8' }).trim();
		assert.equal(target, sha, 'Refusing to attach artifacts from a different commit to an existing tag');
	}
	const temp = mkdtempSync(join(tmpdir(), 'kanban-release-notes-'));
	try {
		const notesFile = join(temp, 'notes.md');
		writeFileSync(notesFile, releaseNotes(readFileSync('CHANGELOG.md', 'utf8'), version));
		if (!release) {
			gh(
				'release',
				'create',
				version,
				'--target',
				sha,
				'--title',
				`Release ${version}`,
				'--draft',
				'--notes-file',
				notesFile,
			);
		}
		gh('release', 'upload', version, 'dist/main.js', 'dist/manifest.json', 'dist/styles.css', '--clobber');
		gh('release', 'edit', version, '--notes-file', notesFile, '--draft=false', '--latest');
		console.log(`Published ${version}`);
	} finally {
		rmSync(temp, { recursive: true, force: true });
	}
}
