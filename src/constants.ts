/**
 * Constants used throughout the Kanban view
 */

/** Label used for entries without a property value */
export const UNCATEGORIZED_LABEL = 'Uncategorized';

/** Color palette for column accents, using Obsidian design system variables */
export const COLOR_PALETTE = [
	{ name: 'red', cssVar: 'var(--color-red)' },
	{ name: 'orange', cssVar: 'var(--color-orange)' },
	{ name: 'yellow', cssVar: 'var(--color-yellow)' },
	{ name: 'green', cssVar: 'var(--color-green)' },
	{ name: 'cyan', cssVar: 'var(--color-cyan)' },
	{ name: 'blue', cssVar: 'var(--color-blue)' },
	{ name: 'purple', cssVar: 'var(--color-purple)' },
	{ name: 'pink', cssVar: 'var(--color-pink)' },
] as const;

export type ColorName = (typeof COLOR_PALETTE)[number]['name'];

/** Sortable.js group name for kanban columns */
export const SORTABLE_GROUP = 'obk-columns';

/** Data attribute names */
export const DATA_ATTRIBUTES = {
	COLUMN_VALUE: 'data-column-value',
	ENTRY_PATH: 'data-entry-path',
	SORTABLE_CONTAINER: 'data-sortable-container',
	COLUMN_POSITION: 'data-column-position',
	COLUMN_COLOR: 'data-column-color',
} as const;

/** CSS class names */
export const CSS_CLASSES = {
	// Container
	VIEW_CONTAINER: 'obk-view-container',
	BOARD: 'obk-board',

	// Property selector (for future or framework-driven UI)
	PROPERTY_SELECTOR: 'obk-property-selector',
	PROPERTY_LABEL: 'obk-property-label',
	PROPERTY_SELECT: 'obk-property-select',

	// Column
	COLUMN: 'obk-column',
	COLUMN_HEADER: 'obk-column-header',
	COLUMN_TITLE: 'obk-column-title',
	COLUMN_COUNT: 'obk-column-count',
	COLUMN_BODY: 'obk-column-body',
	COLUMN_DRAG_HANDLE: 'obk-column-drag-handle',
	COLUMN_DRAGGING: 'obk-column-dragging',
	COLUMN_GHOST: 'obk-column-ghost',

	// Card
	CARD: 'obk-card',
	CARD_TITLE: 'obk-card-title',
	CARD_PREVIEW: 'obk-card-preview',
	CARD_ACTIVE: 'obk-card--active',
	CARD_HOVER: 'obk-card--hover',
	CARD_DRAGGING: 'obk-card-dragging',
	CARD_GHOST: 'obk-card-ghost',
	CARD_CHOSEN: 'obk-card-chosen',
	CARD_PROPERTY: 'obk-card-property',
	CARD_PROPERTY_LABEL: 'obk-card-property-label',
	CARD_PROPERTY_VALUE: 'obk-card-property-value',

	// Empty state
	EMPTY_STATE: 'obk-empty-state',

	// Sortable placeholder (fallback / shared ghost style)
	SORTABLE_GHOST: 'obk-sortable-ghost',

	// Column remove button (shown only when column is empty)
	COLUMN_REMOVE_BTN: 'obk-column-remove-btn',

	// Color picker
	COLUMN_COLOR_BTN: 'obk-column-color-btn',
	COLUMN_COLOR_POPOVER: 'obk-column-color-popover',
	COLUMN_COLOR_SWATCH: 'obk-column-color-swatch',
	COLUMN_COLOR_SWATCH_ACTIVE: 'obk-column-color-swatch--active',
	COLUMN_COLOR_NONE: 'obk-column-color-none',
} as const;

/** Sortable.js configuration constants */
export const SORTABLE_CONFIG = {
	ANIMATION_DURATION: 150,
} as const;

/** Debounce delay in ms for onDataUpdated renders */
export const DEBOUNCE_DELAY = 50;

/** Empty state messages */
export const EMPTY_STATE_MESSAGES = {
	NO_ENTRIES: 'No entries found. Add some notes to your base.',
	NO_PROPERTIES: 'No properties found in entries.',
} as const;
