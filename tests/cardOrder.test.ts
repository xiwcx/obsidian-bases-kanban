import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeCardOrder } from '../src/utils/cardOrder.ts';

test('filtered reorder retains hidden runs at their non-dragged anchors', () => {
	assert.deepEqual(mergeCardOrder(['h0', 'a', 'h1', 'b', 'h2', 'c', 'h3'], ['c', 'a', 'b'], 'c'), [
		'h0',
		'c',
		'a',
		'h1',
		'b',
		'h2',
		'h3',
	]);
});

test('cross-cell merge removes moved path from source but not its hidden neighbours', () => {
	assert.deepEqual(mergeCardOrder(['a', 'h1', 'b', 'h2'], ['a'], 'b'), ['a', 'h1', 'h2']);
	assert.deepEqual(mergeCardOrder(['x', 'h3', 'y', 'h4'], ['x', 'b', 'y'], 'b'), ['x', 'h3', 'b', 'y', 'h4']);
});

test('no saved order and unfiltered drops follow the DOM order', () => {
	assert.deepEqual(mergeCardOrder([], ['b', 'a'], 'b'), ['b', 'a']);
	assert.deepEqual(mergeCardOrder(['a', 'b', 'c'], ['c', 'a', 'b'], 'c'), ['c', 'a', 'b']);
});

test('empty source, repeated drops and stale duplicates retain hidden paths only once', () => {
	assert.deepEqual(mergeCardOrder(['a', 'hidden', 'hidden'], [], 'a'), ['hidden']);
	const saved = mergeCardOrder(['a', 'hidden', 'b'], ['b', 'a'], 'b');
	assert.deepEqual(mergeCardOrder(saved, ['a', 'b'], 'b'), ['a', 'hidden', 'b']);
	assert.deepEqual(mergeCardOrder(['a', 'a', 'h', 'h'], ['a', 'a', 'b'], 'b'), ['a', 'h', 'b']);
});
