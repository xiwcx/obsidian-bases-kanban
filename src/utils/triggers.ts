import { TEMPLATE_VARIABLES } from '../constants.ts';

export interface TriggerRule {
	when: string;
	set?: Record<string, string>;
	clear?: string[];
}

export interface TriggerContext {
	oldValue: string | null; // null for quick-add (new card)
	newValue: string;
}

/**
 * Resolves template variables in a value string.
 * Supported: {{today}}, {{now}}
 */
export function resolveTemplate(value: string): string {
	const now = new Date();
	const yyyy = String(now.getFullYear());
	const mm = String(now.getMonth() + 1).padStart(2, '0');
	const dd = String(now.getDate()).padStart(2, '0');
	const hh = String(now.getHours()).padStart(2, '0');
	const min = String(now.getMinutes()).padStart(2, '0');
	const ss = String(now.getSeconds()).padStart(2, '0');

	const today = `${yyyy}-${mm}-${dd}`;
	const nowIso = `${today}T${hh}:${min}:${ss}`;

	let result = value;
	result = result.split(TEMPLATE_VARIABLES.TODAY).join(today);
	result = result.split(TEMPLATE_VARIABLES.NOW).join(nowIso);
	return result;
}

/**
 * Finds the first matching trigger rule for a given transition.
 * Returns null if no rule matches or if oldValue === newValue (no transition).
 */
export function findMatchingTrigger(rules: TriggerRule[], context: TriggerContext): TriggerRule | null {
	// No transition — same value means no trigger fires
	if (context.oldValue === context.newValue) return null;

	for (const rule of rules) {
		if (rule.when === context.newValue) {
			return rule;
		}
	}

	return null;
}

/**
 * Applies a trigger rule to a frontmatter object (mutates in place).
 * Called inside processFrontMatter() callback.
 */
export function applyTrigger(frontmatter: Record<string, unknown>, rule: TriggerRule): void {
	if (rule.set) {
		for (const [key, value] of Object.entries(rule.set)) {
			frontmatter[key] = resolveTemplate(value);
		}
	}

	if (rule.clear) {
		for (const key of rule.clear) {
			delete frontmatter[key];
		}
	}
}
