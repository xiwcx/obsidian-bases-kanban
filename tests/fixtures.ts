import { createMockTFile, createMockBasesEntry } from './helpers.ts';
import type { BasesEntry, BasesPropertyId } from 'obsidian';

export const PROPERTY_STATUS = 'note.status' as BasesPropertyId;
export const PROPERTY_PRIORITY = 'note.priority' as BasesPropertyId;
export const PROPERTY_CATEGORY = 'note.category' as BasesPropertyId;

// Sample entries with status property
export function createEntriesWithStatus(): BasesEntry[] {
	return [
		createMockBasesEntry(createMockTFile('Task 1.md'), { [PROPERTY_STATUS]: 'To Do' }),
		createMockBasesEntry(createMockTFile('Task 2.md'), { [PROPERTY_STATUS]: 'To Do' }),
		createMockBasesEntry(createMockTFile('Task 3.md'), { [PROPERTY_STATUS]: 'Doing' }),
		createMockBasesEntry(createMockTFile('Task 4.md'), { [PROPERTY_STATUS]: 'Done' }),
		createMockBasesEntry(createMockTFile('Task 5.md'), { [PROPERTY_STATUS]: 'Done' }),
	];
}

// Entries with mixed properties
export function createEntriesWithMixedProperties(): BasesEntry[] {
	return [
		createMockBasesEntry(createMockTFile('Task A.md'), {
			[PROPERTY_STATUS]: 'To Do',
			[PROPERTY_PRIORITY]: 'High',
		}),
		createMockBasesEntry(createMockTFile('Task B.md'), {
			[PROPERTY_STATUS]: 'Doing',
			[PROPERTY_PRIORITY]: 'Medium',
		}),
		createMockBasesEntry(createMockTFile('Task C.md'), {
			[PROPERTY_STATUS]: 'Done',
			[PROPERTY_PRIORITY]: 'Low',
		}),
	];
}

// Entries with empty/null values
export function createEntriesWithEmptyValues(): BasesEntry[] {
	return [
		createMockBasesEntry(createMockTFile('Task 1.md'), { [PROPERTY_STATUS]: 'To Do' }),
		createMockBasesEntry(createMockTFile('Task 2.md'), { [PROPERTY_STATUS]: null }),
		createMockBasesEntry(createMockTFile('Task 3.md'), { [PROPERTY_STATUS]: '' }),
		createMockBasesEntry(createMockTFile('Task 4.md'), {}), // No property
	];
}

// Single entry
export function createSingleEntry(): BasesEntry[] {
	return [
		createMockBasesEntry(createMockTFile('Single Task.md'), { [PROPERTY_STATUS]: 'To Do' }),
	];
}

// Empty entries array
export function createEmptyEntries(): BasesEntry[] {
	return [];
}

// Entries with special characters in property values
export function createEntriesWithSpecialChars(): BasesEntry[] {
	return [
		createMockBasesEntry(createMockTFile('Task 1.md'), { [PROPERTY_STATUS]: 'To Do / Review' }),
		createMockBasesEntry(createMockTFile('Task 2.md'), { [PROPERTY_STATUS]: 'In Progress (50%)' }),
		createMockBasesEntry(createMockTFile('Task 3.md'), { [PROPERTY_STATUS]: 'Done!' }),
	];
}

// Entries with numeric property values
export function createEntriesWithNumericValues(): BasesEntry[] {
	return [
		createMockBasesEntry(createMockTFile('Task 1.md'), { [PROPERTY_STATUS]: '1' }),
		createMockBasesEntry(createMockTFile('Task 2.md'), { [PROPERTY_STATUS]: '2' }),
		createMockBasesEntry(createMockTFile('Task 3.md'), { [PROPERTY_STATUS]: '3' }),
	];
}

// Property IDs for testing
export const TEST_PROPERTIES: BasesPropertyId[] = [
	PROPERTY_STATUS,
	PROPERTY_PRIORITY,
	PROPERTY_CATEGORY,
];

