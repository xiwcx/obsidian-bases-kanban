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
 * Type guard to check if value is an object with a Data property (case-insensitive)
 */
function hasDataProperty(value: unknown): value is Record<string, unknown> & { Data: unknown } {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return false;
	}
	// Check for Data property (case-insensitive)
	const keys = Object.keys(value);
	return keys.some(key => key.toLowerCase() === 'data');
}

/**
 * Gets the Data field from an object (case-insensitive)
 */
function getDataField(value: Record<string, unknown>): unknown {
	const keys = Object.keys(value);
	const dataKey = keys.find(key => key.toLowerCase() === 'data');
	return dataKey ? value[dataKey] : undefined;
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
		if (trimmed === '') {
			return UNCATEGORIZED_LABEL;
		}
		
		// Try parsing as JSON (Obsidian Bases may serialize property objects as JSON)
		try {
			const parsed = JSON.parse(trimmed);
			if (hasDataProperty(parsed)) {
				const dataValue = getDataField(parsed);
				if (dataValue !== undefined) {
					// Recursively normalize the Data field
					return normalizePropertyValue(dataValue);
				}
			}
			// If JSON parsed but no Data field, fall through to return trimmed
		} catch {
			// Not JSON, use the string as-is
		}
		
		return trimmed;
	}
	
	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}
	
	// Handle Obsidian Bases property objects with Data field
	if (hasDataProperty(value)) {
		// Recursively normalize the Data field to handle nested cases
		const dataValue = getDataField(value);
		return normalizePropertyValue(dataValue);
	}
	
	// For other objects, use JSON.stringify
	try {
		const stringValue = JSON.stringify(value).trim();
		return stringValue === '' || stringValue === 'null' ? UNCATEGORIZED_LABEL : stringValue;
	} catch {
		// If stringification fails, fall back to Object.toString
		return UNCATEGORIZED_LABEL;
	}
}



