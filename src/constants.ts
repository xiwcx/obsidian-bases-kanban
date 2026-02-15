/**
 * Constants used throughout the Kanban view
 */

/** Label used for entries without a property value */
export const UNCATEGORIZED_LABEL = 'Uncategorized';

/** Sortable.js group name for kanban columns */
export const SORTABLE_GROUP = 'obk-columns';

/** Data attribute names */
export const DATA_ATTRIBUTES = {
	COLUMN_VALUE: 'data-column-value',
	ENTRY_PATH: 'data-entry-path',
	SORTABLE_CONTAINER: 'data-sortable-container',
	COLUMN_POSITION: 'data-column-position',
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
	CARD_DRAGGING: 'obk-card-dragging',
	CARD_GHOST: 'obk-card-ghost',
	CARD_CHOSEN: 'obk-card-chosen',
	
	// Empty state
	EMPTY_STATE: 'obk-empty-state',
	
	// Sortable placeholder (fallback / shared ghost style)
	SORTABLE_GHOST: 'obk-sortable-ghost',
} as const;

/** Sortable.js configuration constants */
export const SORTABLE_CONFIG = {
	ANIMATION_DURATION: 150,
} as const;

/** Empty state messages */
export const EMPTY_STATE_MESSAGES = {
	NO_ENTRIES: 'No entries found. Add some notes to your base.',
	NO_PROPERTIES: 'No properties found in entries.',
} as const;

