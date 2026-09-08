import assert from 'node:assert';
import { describe, test } from 'node:test';
import { compareCardOrderValues, readCardOrderValue } from '../src/utils/cardOrdering.ts';

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
