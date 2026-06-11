import { test, describe, mock } from 'node:test';
import assert from 'node:assert';
import { resolveTemplate, findMatchingTrigger, applyTrigger } from '../src/utils/triggers.ts';
import type { TriggerRule, TriggerContext } from '../src/utils/triggers.ts';

describe('resolveTemplate', () => {
	test('resolves {{today}} to YYYY-MM-DD format', () => {
		mock.timers.enable({ apis: ['Date'], now: new Date(2025, 5, 11, 14, 30, 45) });
		try {
			const result = resolveTemplate('{{today}}');
			assert.strictEqual(result, '2025-06-11');
		} finally {
			mock.timers.reset();
		}
	});

	test('resolves {{now}} to ISO 8601 datetime without timezone', () => {
		mock.timers.enable({ apis: ['Date'], now: new Date(2025, 5, 11, 14, 30, 45) });
		try {
			const result = resolveTemplate('{{now}}');
			assert.strictEqual(result, '2025-06-11T14:30:45');
		} finally {
			mock.timers.reset();
		}
	});

	test('returns plain strings unchanged', () => {
		const result = resolveTemplate('hello world');
		assert.strictEqual(result, 'hello world');
	});

	test('resolves multiple templates in one value', () => {
		mock.timers.enable({ apis: ['Date'], now: new Date(2025, 0, 1, 9, 5, 3) });
		try {
			const result = resolveTemplate('date: {{today}}, time: {{now}}');
			assert.strictEqual(result, 'date: 2025-01-01, time: 2025-01-01T09:05:03');
		} finally {
			mock.timers.reset();
		}
	});

	test('handles zero-padded months and days', () => {
		mock.timers.enable({ apis: ['Date'], now: new Date(2025, 0, 5, 1, 2, 3) });
		try {
			const result = resolveTemplate('{{today}}');
			assert.strictEqual(result, '2025-01-05');
		} finally {
			mock.timers.reset();
		}
	});

	test('handles value with no template variables', () => {
		const result = resolveTemplate('some static value');
		assert.strictEqual(result, 'some static value');
	});
});

describe('findMatchingTrigger', () => {
	const rules: TriggerRule[] = [
		{ when: 'Done', set: { completed_on: '{{today}}' } },
		{ when: 'In Progress', set: { started_on: '{{today}}' } },
		{ when: 'todo', clear: ['started_on', 'completed_on'] },
	];

	test('returns null when oldValue equals newValue (no transition)', () => {
		const context: TriggerContext = { oldValue: 'Done', newValue: 'Done' };
		const result = findMatchingTrigger(rules, context);
		assert.strictEqual(result, null);
	});

	test('returns the first matching rule for a transition', () => {
		const context: TriggerContext = { oldValue: 'todo', newValue: 'Done' };
		const result = findMatchingTrigger(rules, context);
		assert.strictEqual(result, rules[0]);
	});

	test('returns null when no rule matches the newValue', () => {
		const context: TriggerContext = { oldValue: 'todo', newValue: 'Review' };
		const result = findMatchingTrigger(rules, context);
		assert.strictEqual(result, null);
	});

	test('handles null oldValue (quick-add / new card)', () => {
		const context: TriggerContext = { oldValue: null, newValue: 'In Progress' };
		const result = findMatchingTrigger(rules, context);
		assert.strictEqual(result, rules[1]);
	});

	test('returns first match when multiple rules have the same when value', () => {
		const duplicateRules: TriggerRule[] = [
			{ when: 'Done', set: { first: 'yes' } },
			{ when: 'Done', set: { second: 'yes' } },
		];
		const context: TriggerContext = { oldValue: 'todo', newValue: 'Done' };
		const result = findMatchingTrigger(duplicateRules, context);
		assert.strictEqual(result, duplicateRules[0]);
	});

	test('returns null for empty rules array', () => {
		const context: TriggerContext = { oldValue: 'todo', newValue: 'Done' };
		const result = findMatchingTrigger([], context);
		assert.strictEqual(result, null);
	});

	test('matches Uncategorized column value', () => {
		const uncatRules: TriggerRule[] = [{ when: 'Uncategorized', clear: ['status_date'] }];
		const context: TriggerContext = { oldValue: 'Done', newValue: 'Uncategorized' };
		const result = findMatchingTrigger(uncatRules, context);
		assert.strictEqual(result, uncatRules[0]);
	});
});

describe('applyTrigger', () => {
	test('sets properties from the set map', () => {
		mock.timers.enable({ apis: ['Date'], now: new Date(2025, 5, 11, 14, 30, 0) });
		try {
			const frontmatter: Record<string, unknown> = { title: 'Test' };
			const rule: TriggerRule = { when: 'Done', set: { completed_on: '{{today}}' } };
			applyTrigger(frontmatter, rule);
			assert.strictEqual(frontmatter.completed_on, '2025-06-11');
			assert.strictEqual(frontmatter.title, 'Test');
		} finally {
			mock.timers.reset();
		}
	});

	test('clears properties listed in the clear array', () => {
		const frontmatter: Record<string, unknown> = {
			title: 'Test',
			started_on: '2025-06-01',
			completed_on: '2025-06-10',
		};
		const rule: TriggerRule = { when: 'todo', clear: ['started_on', 'completed_on'] };
		applyTrigger(frontmatter, rule);
		assert.strictEqual(frontmatter.started_on, undefined);
		assert.strictEqual(frontmatter.completed_on, undefined);
		assert.strictEqual(frontmatter.title, 'Test');
	});

	test('handles mixed set and clear in the same rule', () => {
		mock.timers.enable({ apis: ['Date'], now: new Date(2025, 5, 11, 14, 30, 0) });
		try {
			const frontmatter: Record<string, unknown> = {
				title: 'Test',
				old_date: '2025-01-01',
			};
			const rule: TriggerRule = {
				when: 'Done',
				set: { completed_on: '{{today}}' },
				clear: ['old_date'],
			};
			applyTrigger(frontmatter, rule);
			assert.strictEqual(frontmatter.completed_on, '2025-06-11');
			assert.strictEqual(frontmatter.old_date, undefined);
		} finally {
			mock.timers.reset();
		}
	});

	test('set overwrites existing property value', () => {
		mock.timers.enable({ apis: ['Date'], now: new Date(2025, 5, 11, 14, 30, 0) });
		try {
			const frontmatter: Record<string, unknown> = { completed_on: '2025-01-01' };
			const rule: TriggerRule = { when: 'Done', set: { completed_on: '{{today}}' } };
			applyTrigger(frontmatter, rule);
			assert.strictEqual(frontmatter.completed_on, '2025-06-11');
		} finally {
			mock.timers.reset();
		}
	});

	test('clear on non-existent property is a no-op', () => {
		const frontmatter: Record<string, unknown> = { title: 'Test' };
		const rule: TriggerRule = { when: 'todo', clear: ['nonexistent'] };
		applyTrigger(frontmatter, rule);
		assert.strictEqual(Object.keys(frontmatter).length, 1);
		assert.strictEqual(frontmatter.title, 'Test');
	});

	test('handles rule with no set and no clear', () => {
		const frontmatter: Record<string, unknown> = { title: 'Test' };
		const rule: TriggerRule = { when: 'Done' };
		applyTrigger(frontmatter, rule);
		assert.strictEqual(Object.keys(frontmatter).length, 1);
		assert.strictEqual(frontmatter.title, 'Test');
	});

	test('sets static (non-template) values', () => {
		const frontmatter: Record<string, unknown> = {};
		const rule: TriggerRule = { when: 'Done', set: { reviewer: 'bot' } };
		applyTrigger(frontmatter, rule);
		assert.strictEqual(frontmatter.reviewer, 'bot');
	});
});
