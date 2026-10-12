import assert from 'node:assert';
import { describe, test } from 'node:test';
import { compareCardOrderValues, readCardOrderValue, updateCardOrderContent } from '../src/utils/cardOrdering.ts';

describe('readCardOrderValue', () => {
	test('reads finite numbers and numeric strings', () => {
		assert.strictEqual(readCardOrderValue(12), 12);
		assert.strictEqual(readCardOrderValue(' 12 '), 12);
		assert.strictEqual(readCardOrderValue('-1.5'), -1.5);
	});

	test('rejects missing and non-numeric values', () => {
		assert.strictEqual(readCardOrderValue(''), null);
		assert.strictEqual(readCardOrderValue('null'), null);
		assert.strictEqual(readCardOrderValue('High'), null);
		assert.strictEqual(readCardOrderValue(Number.NaN), null);
		assert.strictEqual(readCardOrderValue(Infinity), null);
		assert.strictEqual(readCardOrderValue('-Infinity'), null);
		assert.strictEqual(readCardOrderValue('   '), null);
		assert.strictEqual(readCardOrderValue(true), null);
		assert.strictEqual(readCardOrderValue([1]), null);
	});
});

describe('compareCardOrderValues', () => {
	test('sorts numeric values in ascending visual order', () => {
		assert.ok(compareCardOrderValues(1, 2) < 0);
		assert.ok(compareCardOrderValues(10, 2) > 0);
		assert.strictEqual(compareCardOrderValues(2, 2), 0);
	});

	test('keeps missing values last', () => {
		assert.ok(compareCardOrderValues(null, 1) > 0);
		assert.ok(compareCardOrderValues(1, null) < 0);
		assert.strictEqual(compareCardOrderValues(null, null), 0);
	});
});

describe('updateCardOrderContent', () => {
	test('preserves exact original bytes, comments and CRLF when the numeric order is unchanged', () => {
		const original = '---\r\nrank: 1 # keep this comment\r\nother: "quoted value"\r\n---\r\nBody\r\n';
		assert.strictEqual(updateCardOrderContent(original, 'rank', 1), original);
	});
	test('preserves a numeric string without reformatting when it already has the requested value', () => {
		const original = '---\nrank: "1" # preserve numeric string\n---\nBody\n';
		assert.strictEqual(updateCardOrderContent(original, 'rank', 1), original);
	});
	test('changes only frontmatter data and preserves the Markdown body', () => {
		const original = '---\nrank: 2\nkeep: untouched\n---\nBody\n---\nHorizontal rule\n';
		const updated = updateCardOrderContent(original, 'rank', 1);
		assert.match(updated, /rank: 1/);
		assert.match(updated, /keep: untouched/);
		assert.ok(updated.endsWith('Body\n---\nHorizontal rule\n'));
	});
	test('creates frontmatter for a note without it', () => {
		assert.strictEqual(updateCardOrderContent('Body\n', 'rank', 1), '---\nrank: 1\n---\nBody\n');
	});
	test('rejects malformed YAML and a non-mapping frontmatter document', () => {
		assert.throws(() => updateCardOrderContent('---\nrank: [\n---\nBody\n', 'rank', 1));
		assert.throws(() => updateCardOrderContent('---\n- rank\n---\nBody\n', 'rank', 1), /frontmatter mapping/);
	});
});
