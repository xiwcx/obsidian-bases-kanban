import type { BasesEntry } from 'obsidian';
import { UNCATEGORIZED_LABEL } from '../constants.ts';

/**
 * Ensures a group exists in the map, creating it if necessary
 * @param grouped - The map of groups
 * @param key - The key to ensure exists
 * @returns The array for the specified key
 */
export function ensureGroupExists(
	grouped: Map<string, BasesEntry[]>,
	key: string
): BasesEntry[] {
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
 * @param value - The property value to normalize
 * @returns Normalized string value
 */
export function normalizePropertyValue(value: unknown): string {
	if (value === null || value === undefined) {
		return UNCATEGORIZED_LABEL;
	}
	
	// Handle primitive types
	if (typeof value === 'string') {
		const trimmed = value.trim();
		return trimmed === '' ? UNCATEGORIZED_LABEL : trimmed;
	}
	
	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}
	
	// For objects, use JSON.stringify
	try {
		const stringValue = JSON.stringify(value).trim();
		return stringValue === '' || stringValue === 'null' ? UNCATEGORIZED_LABEL : stringValue;
	} catch {
		// If stringification fails, fall back to Object.toString
		return UNCATEGORIZED_LABEL;
	}
}



