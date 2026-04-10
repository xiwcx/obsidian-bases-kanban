import { createMockTFile, createMockBasesEntry } from './helpers.ts';
import type { BasesEntry, BasesPropertyId } from 'obsidian';
import {
	BooleanValue,
	DateValue,
	HTMLValue,
	LinkValue,
	ListValue,
	NumberValue,
	StringValue,
} from './mocks/obsidian.ts';

export const PROPERTY_STATUS = 'note.status' as BasesPropertyId;
export const PROPERTY_PRIORITY = 'note.priority' as BasesPropertyId;
export const PROPERTY_CATEGORY = 'note.category' as BasesPropertyId;
export const PROPERTY_RELATED = 'note.related' as BasesPropertyId;
export const PROPERTY_TITLE = 'note.title' as BasesPropertyId;

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

// Entry with a custom title property
export function createEntriesWithCustomTitle(): BasesEntry[] {
	return [
		createMockBasesEntry(createMockTFile('README.md'), {
			[PROPERTY_STATUS]: 'To Do',
			[PROPERTY_TITLE]: 'My Project',
		}),
	];
}

// Single entry
export function createSingleEntry(): BasesEntry[] {
	return [createMockBasesEntry(createMockTFile('Single Task.md'), { [PROPERTY_STATUS]: 'To Do' })];
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

// Entries with wiki link property values
export function createEntriesWithLinks(): BasesEntry[] {
	return [
		createMockBasesEntry(createMockTFile('notes/Task A.md'), {
			[PROPERTY_STATUS]: 'To Do',
			[PROPERTY_RELATED]: '[[Meeting Notes]]',
		}),
		createMockBasesEntry(createMockTFile('notes/Task B.md'), {
			[PROPERTY_STATUS]: 'To Do',
			[PROPERTY_RELATED]: 'plain text value',
		}),
	];
}

// Property IDs for testing
export const TEST_PROPERTIES: BasesPropertyId[] = [PROPERTY_STATUS, PROPERTY_PRIORITY, PROPERTY_CATEGORY];

// Value instances for renderPropertyValue unit tests
export const PROPERTY_DESCRIPTION = 'note.description' as BasesPropertyId;
export const PROPERTY_PROGRESS = 'note.progress' as BasesPropertyId;
export const PROPERTY_TAGS = 'note.tags' as BasesPropertyId;
export const PROPERTY_COUNT = 'note.count' as BasesPropertyId;
export const PROPERTY_DONE = 'note.done' as BasesPropertyId;
export const PROPERTY_DUE = 'note.due' as BasesPropertyId;

export const VALUE_PLAIN_STRING = new StringValue('plain text');
export const VALUE_WIKILINK_STRING = new StringValue('[[Meeting Notes]]');
export const VALUE_HTML = new HTMLValue('<progress value="50" max="100"></progress>');
export const VALUE_LINK = new LinkValue('[[Project Alpha]]');
export const VALUE_NUMBER = new NumberValue(42);
export const VALUE_BOOLEAN = new BooleanValue(true);
export const VALUE_DATE = new DateValue(new Date('2026-04-08'));
export const VALUE_LIST_PLAIN = new ListValue([
	new StringValue('alpha'),
	new StringValue('beta'),
	new StringValue('gamma'),
]);
export const VALUE_LIST_LINKS = new ListValue([new LinkValue('[[Note A]]'), new LinkValue('[[Note B]]')]);
