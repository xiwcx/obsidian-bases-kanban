import type { BasesEntry } from 'obsidian';
import { UNCATEGORIZED_LABEL } from '../constants.ts';

/**
 * Ensures a group exists in the map, creating it if necessary
 * @param grouped - The map of groups
 * @param key - The key to ensure exists
 * @returns The array for the specified key
 */
export function ensureGroupExists(grouped: Map<string, BasesEntry[]>, key: string): BasesEntry[] {
	if (!grouped.has(key)) {
		grouped.set(key, []);
	}
	const group = grouped.get(key);
	if (!group) {
		// This should never happen, but TypeScript needs the check
		const newGroup: BasesEntry[] = [];
		grouped.set(key, newGroup);
		return newGroup;
	}
	return group;
}

/**
 * Normalizes a property value to a string, using Uncategorized for empty values
 * @param value - The property value to normalize (typically a Value object from Obsidian Bases)
 * @returns Normalized string value
 */
export function normalizePropertyValue(
	value: string | number | boolean | { toString(): string } | null | undefined,
): string {
	// Handle null/undefined
	if (value === null || value === undefined) {
		return UNCATEGORIZED_LABEL;
	}

	// Value objects from Obsidian Bases have toString()
	if (typeof value === 'object') {
		const stringValue = value.toString().trim();
		return stringValue === '' || stringValue === 'null' ? UNCATEGORIZED_LABEL : stringValue;
	}

	// Primitives
	const stringValue = typeof value === 'string' ? value : String(value);
	const trimmed = stringValue.trim();
	return trimmed === '' || trimmed === 'null' ? UNCATEGORIZED_LABEL : trimmed;
}
