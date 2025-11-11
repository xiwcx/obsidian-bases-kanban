import { test, describe } from 'node:test';
import assert from 'node:assert';
import { normalizePropertyValue, ensureGroupExists } from '../src/utils/grouping.ts';
import { UNCATEGORIZED_LABEL } from '../src/constants.ts';
import type { BasesEntry } from 'obsidian';
import { createMockBasesEntry, createMockTFile } from './helpers.ts';

describe('normalizePropertyValue - Primitive Types', () => {
	test('Strings: trimmed values', () => {
		assert.strictEqual(normalizePropertyValue('hello'), 'hello');
		assert.strictEqual(normalizePropertyValue('  hello  '), 'hello');
		assert.strictEqual(normalizePropertyValue('  world'), 'world');
		assert.strictEqual(normalizePropertyValue('test  '), 'test');
	});

	test('Empty strings map to Uncategorized', () => {
		assert.strictEqual(normalizePropertyValue(''), UNCATEGORIZED_LABEL);
		assert.strictEqual(normalizePropertyValue('   '), UNCATEGORIZED_LABEL);
		assert.strictEqual(normalizePropertyValue('\t\n'), UNCATEGORIZED_LABEL);
	});

	test('Numbers convert to strings', () => {
		assert.strictEqual(normalizePropertyValue(42), '42');
		assert.strictEqual(normalizePropertyValue(0), '0');
		assert.strictEqual(normalizePropertyValue(-10), '-10');
		assert.strictEqual(normalizePropertyValue(3.14), '3.14');
	});

	test('Booleans convert to strings', () => {
		assert.strictEqual(normalizePropertyValue(true), 'true');
		assert.strictEqual(normalizePropertyValue(false), 'false');
	});

	test('Null/undefined map to Uncategorized', () => {
		assert.strictEqual(normalizePropertyValue(null), UNCATEGORIZED_LABEL);
		assert.strictEqual(normalizePropertyValue(undefined), UNCATEGORIZED_LABEL);
	});
});

describe('normalizePropertyValue - JSON Parsing', () => {
	test('Valid JSON strings with Data property extract value', () => {
		assert.strictEqual(normalizePropertyValue('{"Data": "value"}'), 'value');
		assert.strictEqual(normalizePropertyValue('{"Data": "To Do"}'), 'To Do');
		assert.strictEqual(normalizePropertyValue('{"data": "value"}'), 'value');
		assert.strictEqual(normalizePropertyValue('{"DATA": "value"}'), 'value');
	});

	test('JSON strings without Data property return as-is', () => {
		const jsonStr = '{"other": "value"}';
		const result = normalizePropertyValue(jsonStr);
		// Should return trimmed string (not parsed JSON)
		assert.strictEqual(result, jsonStr);
	});

	test('Invalid JSON (non-JSON strings) return as-is', () => {
		assert.strictEqual(normalizePropertyValue('plain text'), 'plain text');
		assert.strictEqual(normalizePropertyValue('not json'), 'not json');
		assert.strictEqual(normalizePropertyValue('{invalid json}'), '{invalid json}');
	});

	test('Empty JSON strings map to Uncategorized', () => {
		assert.strictEqual(normalizePropertyValue(''), UNCATEGORIZED_LABEL);
		assert.strictEqual(normalizePropertyValue('{}'), '{}'); // Empty object JSON stringifies to {}
	});

	test('JSON with nested Data property extracts recursively', () => {
		assert.strictEqual(normalizePropertyValue('{"Data": {"Data": "nested"}}'), 'nested');
		assert.strictEqual(normalizePropertyValue('{"Data": {"data": "value"}}'), 'value');
	});

	test('JSON with Data property containing null maps to Uncategorized', () => {
		assert.strictEqual(normalizePropertyValue('{"Data": null}'), UNCATEGORIZED_LABEL);
		// undefined is not valid JSON, so it returns the string as-is
		assert.strictEqual(normalizePropertyValue('{"Data": undefined}'), '{"Data": undefined}');
	});
});

describe('normalizePropertyValue - Objects with Data Property', () => {
	test('Standard case: object with Data property', () => {
		assert.strictEqual(normalizePropertyValue({ Data: 'value' }), 'value');
		assert.strictEqual(normalizePropertyValue({ Data: 'To Do' }), 'To Do');
	});

	test('Case-insensitive Data property', () => {
		assert.strictEqual(normalizePropertyValue({ data: 'value' }), 'value');
		assert.strictEqual(normalizePropertyValue({ DATA: 'value' }), 'value');
		assert.strictEqual(normalizePropertyValue({ DaTa: 'value' }), 'value');
	});

	test('Recursive/nested Data objects', () => {
		assert.strictEqual(normalizePropertyValue({ Data: { Data: 'nested' } }), 'nested');
		assert.strictEqual(normalizePropertyValue({ data: { Data: 'value' } }), 'value');
		assert.strictEqual(normalizePropertyValue({ Data: { data: 'value' } }), 'value');
	});

	test('Data field with null/undefined maps to Uncategorized', () => {
		assert.strictEqual(normalizePropertyValue({ Data: null }), UNCATEGORIZED_LABEL);
		assert.strictEqual(normalizePropertyValue({ Data: undefined }), UNCATEGORIZED_LABEL);
		assert.strictEqual(normalizePropertyValue({ data: null }), UNCATEGORIZED_LABEL);
	});

	test('Data field with empty string maps to Uncategorized', () => {
		assert.strictEqual(normalizePropertyValue({ Data: '' }), UNCATEGORIZED_LABEL);
		assert.strictEqual(normalizePropertyValue({ Data: '   ' }), UNCATEGORIZED_LABEL);
	});
});

describe('normalizePropertyValue - Edge Cases', () => {
	test('Empty objects are JSON stringified', () => {
		// Empty objects don't have Data property, so they're JSON stringified
		assert.strictEqual(normalizePropertyValue({}), '{}');
	});

	test('Arrays are stringified', () => {
		const result = normalizePropertyValue([1, 2, 3]);
		assert.strictEqual(result, '[1,2,3]');
		
		const stringArray = normalizePropertyValue(['a', 'b', 'c']);
		assert.strictEqual(stringArray, '["a","b","c"]');
	});

	test('Complex objects without Data are JSON stringified', () => {
		const obj = { name: 'test', value: 42 };
		const result = normalizePropertyValue(obj);
		assert.strictEqual(result, JSON.stringify(obj));
		
		const nestedObj = { outer: { inner: 'value' } };
		const nestedResult = normalizePropertyValue(nestedObj);
		assert.strictEqual(nestedResult, JSON.stringify(nestedObj));
	});

	test('Whitespace-only strings map to Uncategorized', () => {
		assert.strictEqual(normalizePropertyValue('   '), UNCATEGORIZED_LABEL);
		assert.strictEqual(normalizePropertyValue('\t'), UNCATEGORIZED_LABEL);
		assert.strictEqual(normalizePropertyValue('\n'), UNCATEGORIZED_LABEL);
		assert.strictEqual(normalizePropertyValue(' \t\n '), UNCATEGORIZED_LABEL);
	});

	test('Objects that cannot be stringified map to Uncategorized', () => {
		// Create an object with circular reference
		const circular: any = { value: 'test' };
		circular.self = circular;
		
		// JSON.stringify will throw, so should fall back to Uncategorized
		const result = normalizePropertyValue(circular);
		assert.strictEqual(result, UNCATEGORIZED_LABEL);
	});

	test('Objects with null JSON stringify result map to Uncategorized', () => {
		const obj: { value: null } = { value: null };
		const stringified = JSON.stringify(obj);
		// JSON.stringify({value: null}) = '{"value":null}' which is not empty or 'null'
		// So this should return the stringified version
		const result = normalizePropertyValue(obj);
		assert.strictEqual(result, stringified);
	});
});

describe('normalizePropertyValue - Real-world Obsidian Bases Scenarios', () => {
	test('Handles Obsidian Bases property objects', () => {
		// Simulate what Obsidian Bases might return
		const basesProperty = { Data: 'To Do' };
		assert.strictEqual(normalizePropertyValue(basesProperty), 'To Do');
	});

	test('Handles JSON-serialized Obsidian Bases properties', () => {
		// Old saved data might be JSON strings
		const jsonString = '{"Data": "Done"}';
		assert.strictEqual(normalizePropertyValue(jsonString), 'Done');
	});

	test('Handles mixed case in saved data', () => {
		assert.strictEqual(normalizePropertyValue('{"data": "In Progress"}'), 'In Progress');
		assert.strictEqual(normalizePropertyValue({ DATA: 'In Progress' }), 'In Progress');
	});

	test('Handles nested property structures', () => {
		const nested = { Data: { Data: 'Final Value' } };
		assert.strictEqual(normalizePropertyValue(nested), 'Final Value');
		
		const jsonNested = '{"Data": {"Data": "Final Value"}}';
		assert.strictEqual(normalizePropertyValue(jsonNested), 'Final Value');
	});
});

describe('ensureGroupExists', () => {
	test('Creates group if it does not exist', () => {
		const grouped = new Map<string, BasesEntry[]>();
		const group = ensureGroupExists(grouped, 'test');
		
		assert.ok(group, 'Group should be created');
		assert.strictEqual(group.length, 0, 'Group should be empty array');
		assert.ok(grouped.has('test'), 'Map should have test key');
	});

	test('Returns existing group if it exists', () => {
		const grouped = new Map<string, BasesEntry[]>();
		const entry = createMockBasesEntry(createMockTFile('test.md'));
		const existingGroup = [entry];
		grouped.set('test', existingGroup);
		
		const group = ensureGroupExists(grouped, 'test');
		
		assert.strictEqual(group, existingGroup, 'Should return existing group');
		assert.strictEqual(group.length, 1, 'Group should have one entry');
	});

	test('Handles multiple groups', () => {
		const grouped = new Map<string, BasesEntry[]>();
		const group1 = ensureGroupExists(grouped, 'group1');
		const group2 = ensureGroupExists(grouped, 'group2');
		
		assert.notStrictEqual(group1, group2, 'Groups should be different arrays');
		assert.strictEqual(grouped.size, 2, 'Map should have two groups');
	});
});

