import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { debounce } from '../src/utils/debounce.ts';

describe('debounce', () => {
	beforeEach(() => {
		mock.timers.enable({ apis: ['setTimeout'] });
	});

	afterEach(() => {
		mock.timers.reset();
	});

	test('calls fn after delay', () => {
		let calls = 0;
		const debounced = debounce(() => {
			calls++;
		}, 50);

		debounced();
		assert.strictEqual(calls, 0, 'should not call fn before delay');

		mock.timers.tick(50);
		assert.strictEqual(calls, 1, 'should call fn after delay');
	});

	test('coalesces rapid calls into one invocation', () => {
		let calls = 0;
		const debounced = debounce(() => {
			calls++;
		}, 50);

		debounced();
		debounced();
		debounced();
		mock.timers.tick(50);

		assert.strictEqual(calls, 1, 'should call fn exactly once');
	});

	test('resets timer on each call', () => {
		let calls = 0;
		const debounced = debounce(() => {
			calls++;
		}, 50);

		debounced();
		mock.timers.tick(30);
		debounced(); // resets the timer
		mock.timers.tick(30); // only 30ms since last call — should not fire
		assert.strictEqual(calls, 0, 'should not fire before new delay elapses');

		mock.timers.tick(20); // now 50ms since last call
		assert.strictEqual(calls, 1, 'should fire after new delay elapses');
	});

	test('passes arguments to fn', () => {
		const received: unknown[][] = [];
		const debounced = debounce((...args: unknown[]) => {
			received.push(args);
		}, 50);

		debounced('a', 1);
		mock.timers.tick(50);

		assert.deepStrictEqual(received, [['a', 1]]);
	});

	test('uses arguments from last call', () => {
		const received: unknown[][] = [];
		const debounced = debounce((...args: unknown[]) => {
			received.push(args);
		}, 50);

		debounced('first');
		debounced('second');
		mock.timers.tick(50);

		assert.deepStrictEqual(received, [['second']]);
	});

	test('cancel() prevents pending invocation', () => {
		let calls = 0;
		const debounced = debounce(() => {
			calls++;
		}, 50);

		debounced();
		debounced.cancel();
		mock.timers.tick(50);

		assert.strictEqual(calls, 0, 'fn should not be called after cancel');
	});

	test('cancel() is safe to call with no pending timer', () => {
		const debounced = debounce(() => {}, 50);
		assert.doesNotThrow(() => debounced.cancel());
	});

	test('can be invoked again after cancel', () => {
		let calls = 0;
		const debounced = debounce(() => {
			calls++;
		}, 50);

		debounced();
		debounced.cancel();
		debounced();
		mock.timers.tick(50);

		assert.strictEqual(calls, 1, 'should fire after re-invocation following cancel');
	});
});
