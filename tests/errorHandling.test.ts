import { test, describe } from 'node:test';
import assert from 'node:assert';
import { toError, isError, formatErrorMessage } from '../src/utils/errorHandling.ts';

describe('isError - Type Guard', () => {
	test('Returns true for Error instances', () => {
		assert.strictEqual(isError(new Error('test')), true);
		assert.strictEqual(isError(new TypeError('type error')), true);
		assert.strictEqual(isError(new ReferenceError('ref error')), true);
	});

	test('Returns false for non-Error values', () => {
		assert.strictEqual(isError('string'), false);
		assert.strictEqual(isError(42), false);
		assert.strictEqual(isError(null), false);
		assert.strictEqual(isError(undefined), false);
		assert.strictEqual(isError({}), false);
		assert.strictEqual(isError([]), false);
		assert.strictEqual(isError(true), false);
	});

	test('Returns false for objects with message property but not Error instance', () => {
		assert.strictEqual(isError({ message: 'error' }), false);
		assert.strictEqual(isError({ message: 'test', code: 123 }), false);
	});
});

describe('toError - Basic Cases', () => {
	test('Error instances pass through unchanged', () => {
		const error = new Error('test error');
		const result = toError(error);
		
		assert.strictEqual(result, error, 'Should return same Error instance');
		assert.strictEqual(result.message, 'test error', 'Message should be preserved');
	});

	test('Strings convert to Error with string as message', () => {
		const result = toError('test error message');
		
		assert.ok(result instanceof Error, 'Should be Error instance');
		assert.strictEqual(result.message, 'test error message', 'Message should match string');
	});

	test('Null converts with String() representation', () => {
		const result = toError(null);
		
		assert.ok(result instanceof Error, 'Should be Error instance');
		assert.strictEqual(result.message, 'null', 'Message should be "null"');
	});

	test('Undefined converts with String() representation', () => {
		const result = toError(undefined);
		
		assert.ok(result instanceof Error, 'Should be Error instance');
		assert.strictEqual(result.message, 'undefined', 'Message should be "undefined"');
	});

	test('Numbers convert with String() representation', () => {
		const result = toError(42);
		
		assert.ok(result instanceof Error, 'Should be Error instance');
		assert.strictEqual(result.message, '42', 'Message should be stringified number');
	});

	test('Booleans convert with String() representation', () => {
		const trueResult = toError(true);
		assert.ok(trueResult instanceof Error);
		assert.strictEqual(trueResult.message, 'true');
		
		const falseResult = toError(false);
		assert.ok(falseResult instanceof Error);
		assert.strictEqual(falseResult.message, 'false');
	});
});

describe('toError - Objects with Message Property', () => {
	test('String message property converts correctly', () => {
		const result = toError({ message: 'error message' });
		
		assert.ok(result instanceof Error, 'Should be Error instance');
		assert.strictEqual(result.message, 'error message', 'Message should match');
	});

	test('Non-string message property uses JSON.stringify', () => {
		const result = toError({ message: { code: 123, detail: 'test' } });
		
		assert.ok(result instanceof Error, 'Should be Error instance');
		assert.strictEqual(result.message, '{"code":123,"detail":"test"}', 'Message should be JSON stringified');
	});

	test('Number message property converts to string', () => {
		const result = toError({ message: 42 });
		
		assert.ok(result instanceof Error, 'Should be Error instance');
		assert.strictEqual(result.message, '42', 'Message should be stringified number');
	});

	test('Boolean message property converts to string', () => {
		const trueResult = toError({ message: true });
		assert.ok(trueResult instanceof Error);
		assert.strictEqual(trueResult.message, 'true');
		
		const falseResult = toError({ message: false });
		assert.ok(falseResult instanceof Error);
		assert.strictEqual(falseResult.message, 'false');
	});

	test('Null message property converts correctly', () => {
		const result = toError({ message: null });
		
		assert.ok(result instanceof Error, 'Should be Error instance');
		assert.strictEqual(result.message, 'null', 'Message should be JSON stringified null');
	});

	test('Array message property uses JSON.stringify', () => {
		const result = toError({ message: [1, 2, 3] });
		
		assert.ok(result instanceof Error, 'Should be Error instance');
		assert.strictEqual(result.message, '[1,2,3]', 'Message should be JSON stringified array');
	});

	test('Nested object message property uses JSON.stringify', () => {
		const nested = { message: { inner: { value: 'test' } } };
		const result = toError(nested);
		
		assert.ok(result instanceof Error, 'Should be Error instance');
		assert.strictEqual(result.message, '{"inner":{"value":"test"}}', 'Message should be JSON stringified');
	});
});

describe('toError - Edge Cases', () => {
	test('Objects without message property convert with String()', () => {
		const result = toError({ code: 123, status: 'error' });
		
		assert.ok(result instanceof Error, 'Should be Error instance');
		// String({code: 123, status: 'error'}) = '[object Object]'
		assert.strictEqual(result.message, '[object Object]', 'Message should be String() representation');
	});

	test('Complex nested objects without message', () => {
		const complex = { 
			level1: { 
				level2: { 
					value: 'test' 
				} 
			} 
		};
		const result = toError(complex);
		
		assert.ok(result instanceof Error, 'Should be Error instance');
		assert.strictEqual(result.message, '[object Object]', 'Message should be String() representation');
	});

	test('Arrays convert with String()', () => {
		const result = toError([1, 2, 3]);
		
		assert.ok(result instanceof Error, 'Should be Error instance');
		assert.strictEqual(result.message, '1,2,3', 'Message should be String() representation of array');
	});

	test('Empty objects convert with String()', () => {
		const result = toError({});
		
		assert.ok(result instanceof Error, 'Should be Error instance');
		assert.strictEqual(result.message, '[object Object]', 'Message should be String() representation');
	});

	test('Empty arrays convert with String()', () => {
		const result = toError([]);
		
		assert.ok(result instanceof Error, 'Should be Error instance');
		assert.strictEqual(result.message, '', 'Message should be empty string for empty array');
	});
});

describe('formatErrorMessage', () => {
	test('Formats error message with context', () => {
		const error = new Error('Something went wrong');
		const result = formatErrorMessage(error, 'TestContext');
		
		assert.strictEqual(result, '[TestContext] Error: Something went wrong', 'Should format correctly');
	});

	test('Handles different error types', () => {
		const typeError = new TypeError('Type mismatch');
		const result = formatErrorMessage(typeError, 'Validation');
		
		assert.strictEqual(result, '[Validation] TypeError: Type mismatch', 'Should include error type');
	});

	test('Handles errors with empty messages', () => {
		const error = new Error('');
		const result = formatErrorMessage(error, 'Context');
		
		assert.strictEqual(result, '[Context] Error: ', 'Should format even with empty message');
	});

	test('Handles errors with special characters in message', () => {
		const error = new Error('Error: "quoted" text [brackets]');
		const result = formatErrorMessage(error, 'Parser');
		
		assert.strictEqual(result, '[Parser] Error: Error: "quoted" text [brackets]', 'Should preserve special characters');
	});
});

