import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getOrderedSwimlaneValues } from '../src/components/row.ts';
import { UNCATEGORIZED_LABEL } from '../src/constants.ts';

test('saved empty swimlanes retain their order and new live values are appended', () => {
	assert.deepEqual(getOrderedSwimlaneValues(['Upper', 'New'], ['Empty', 'Upper']), ['Empty', 'Upper', 'New']);
	assert.deepEqual(getOrderedSwimlaneValues([], ['Empty', 'Upper']), ['Empty', 'Upper']);
});

test('hiding empty swimlanes leaves saved preferences unchanged', () => {
	const saved = ['Empty', 'Upper'];
	assert.deepEqual(getOrderedSwimlaneValues(['Upper'], saved, false), ['Upper']);
	assert.deepEqual(saved, ['Empty', 'Upper']);
});

test('the synthetic Uncategorized lane is retained only while live', () => {
	assert.deepEqual(getOrderedSwimlaneValues([], [UNCATEGORIZED_LABEL]), []);
	assert.deepEqual(getOrderedSwimlaneValues([UNCATEGORIZED_LABEL], [UNCATEGORIZED_LABEL]), [UNCATEGORIZED_LABEL]);
});
