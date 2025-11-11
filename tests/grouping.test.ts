import { test, describe } from 'node:test';
import assert from 'node:assert';
import { normalizePropertyValue, ensureGroupExists } from '../src/utils/grouping.ts';
import { UNCATEGORIZED_LABEL } from '../src/constants.ts';
import type { BasesEntry } from 'obsidian';
import { createMockBasesEntry, createMockTFile } from './helpers.ts';

describe('normalizePropertyValue - Value Objects', () => {
	test('Value objects with toString() method', () => {
		const mockValue = {
			toString: () => 'To Do',
			isTruthy: () => true,
		};
		assert.strictEqual(normalizePropertyValue(mockValue), 'To Do');
		
		const mockValue2 = {
			toString: () => 'Done',
			isTruthy: () => true,
		};
		assert.strictEqual(normalizePropertyValue(mockValue2), 'Done');
	});

	test('Value objects with whitespace are trimmed', () => {
		const mockValue = {
			toString: () => '  In Progress  ',
			isTruthy: () => true,
		};
		assert.strictEqual(normalizePropertyValue(mockValue), 'In Progress');
	});

	test('Value objects with empty string map to Uncategorized', () => {
		const mockValue = {
			toString: () => '',
			isTruthy: () => false,
		};
		assert.strictEqual(normalizePropertyValue(mockValue), UNCATEGORIZED_LABEL);
		
		const mockValue2 = {
			toString: () => '   ',
			isTruthy: () => false,
		};
		assert.strictEqual(normalizePropertyValue(mockValue2), UNCATEGORIZED_LABEL);
	});
});

describe('normalizePropertyValue - Primitives (Fallback)', () => {
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

