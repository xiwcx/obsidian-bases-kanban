import assert from 'node:assert';
import { describe, test } from 'node:test';
import { SWIMLANE_KEY_SEPARATOR, UNCATEGORIZED_LABEL } from '../src/constants.ts';
import { isCardOrders, isCollapsedLanes, isColumnOrders } from '../src/kanbanView.ts';

describe('SWIMLANE_KEY_SEPARATOR', () => {
	test('is the Unit Separator control character (U+001F)', () => {
		assert.strictEqual(SWIMLANE_KEY_SEPARATOR, '\u001F');
		assert.strictEqual(SWIMLANE_KEY_SEPARATOR.charCodeAt(0), 31);
	});

	test('is unlikely to appear in normal property values', () => {
		// The separator is a control character that shouldn't appear in
		// frontmatter values typed by humans, so it makes a safe key delimiter.
		const typicalValues = ['To Do', 'P1', 'High', 'in-progress', 'done!', 'value with spaces'];
		for (const v of typicalValues) {
			assert.ok(!v.includes(SWIMLANE_KEY_SEPARATOR), `value "${v}" must not contain separator`);
		}
	});
});

describe('isCardOrders type guard accepts swimlane composite keys', () => {
	test('flat-mode shape (column-only keys) is accepted', () => {
		const flat = { 'note.status': { 'To Do': ['a.md', 'b.md'], Done: ['c.md'] } };
		assert.ok(isCardOrders(flat));
	});

	test('swimlane-mode shape (composite keys) is accepted', () => {
		const composite = {
			'note.status': {
				[`P1${SWIMLANE_KEY_SEPARATOR}To Do`]: ['a.md'],
				[`P2${SWIMLANE_KEY_SEPARATOR}Done`]: ['b.md'],
			},
		};
		assert.ok(isCardOrders(composite));
	});

	test('rejects garbage shapes', () => {
		assert.ok(!isCardOrders(null));
		assert.ok(!isCardOrders('not an object'));
		assert.ok(!isCardOrders({ key: 'string-value' }));
		assert.ok(!isCardOrders({ key: { nested: 'string-not-array' } }));
		assert.ok(!isCardOrders([]));
	});
});

describe('isCollapsedLanes type guard', () => {
	test('accepts a record of string arrays keyed by property id', () => {
		const valid: Record<string, string[]> = { 'note.priority': ['P1', 'P2'], 'note.assignee': [] };
		assert.ok(isCollapsedLanes(valid));
	});

	test('accepts an empty record', () => {
		assert.ok(isCollapsedLanes({}));
	});

	test('rejects records whose values are not arrays', () => {
		assert.ok(!isCollapsedLanes({ 'note.priority': 'P1' }));
		assert.ok(!isCollapsedLanes({ 'note.priority': { nested: 'value' } }));
	});

	test('rejects arrays containing non-strings', () => {
		assert.ok(!isCollapsedLanes({ 'note.priority': [1, 2, 3] }));
		assert.ok(!isCollapsedLanes({ 'note.priority': [null] }));
		assert.ok(!isCollapsedLanes({ 'note.priority': ['ok', 42] }));
	});

	test('rejects null and primitives', () => {
		assert.ok(!isCollapsedLanes(null));
		assert.ok(!isCollapsedLanes(undefined));
		assert.ok(!isCollapsedLanes('string'));
	});
});

describe('swimlaneOrders persistence shape', () => {
	test('swimlaneOrders shares the columnOrders shape (Record<id, string[]>)', () => {
		// Persistence reuses the isColumnOrders type guard for swimlaneOrders;
		// this test pins that contract so a future refactor can't silently
		// diverge the two shapes without forcing a migration plan.
		const valid: Record<string, string[]> = { 'note.priority': ['P1', 'P2', 'P3'], 'note.assignee': [] };
		assert.ok(isColumnOrders(valid));
	});

	test('rejects nested-object shape used by columnColors', () => {
		const colorsShape = { 'note.priority': { P1: 'red', P2: 'blue' } };
		assert.ok(!isColumnOrders(colorsShape));
	});
});

describe('UNCATEGORIZED_LABEL handling in swimlane composite keys', () => {
	test('composite key with Uncategorized lane and column round-trips intact', () => {
		const key = `${UNCATEGORIZED_LABEL}${SWIMLANE_KEY_SEPARATOR}${UNCATEGORIZED_LABEL}`;
		const [lane, column] = key.split(SWIMLANE_KEY_SEPARATOR);
		assert.strictEqual(lane, UNCATEGORIZED_LABEL);
		assert.strictEqual(column, UNCATEGORIZED_LABEL);
	});
});
