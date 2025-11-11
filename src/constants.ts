/**
 * Constants used throughout the Kanban view
 */

/** Label used for entries without a property value */
export const UNCATEGORIZED_LABEL = 'Uncategorized';

/** Sortable.js group name for kanban columns */
export const SORTABLE_GROUP = 'kanban-columns';

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
	VIEW_CONTAINER: 'kanban-view-container',
	BOARD: 'kanban-board',
	
	// Column
	COLUMN: 'kanban-column',
	COLUMN_HEADER: 'kanban-column-header',
	COLUMN_TITLE: 'kanban-column-title',
	COLUMN_COUNT: 'kanban-column-count',
	COLUMN_BODY: 'kanban-column-body',
	COLUMN_DRAG_HANDLE: 'kanban-column-drag-handle',
	COLUMN_DRAGGING: 'kanban-column-dragging',
	COLUMN_GHOST: 'kanban-column-ghost',
	
	// Card
	CARD: 'kanban-card',
	CARD_TITLE: 'kanban-card-title',
	CARD_DRAGGING: 'kanban-card-dragging',
	CARD_GHOST: 'kanban-card-ghost',
	CARD_CHOSEN: 'kanban-card-chosen',
	
	// Error display
	ERROR_CONTAINER: 'kanban-error-container',
	ERROR_HEADER: 'kanban-error-header',
	ERROR_ICON: 'kanban-error-icon',
	ERROR_TITLE: 'kanban-error-title',
	ERROR_MESSAGE: 'kanban-error-message',
	ERROR_STACK_CONTAINER: 'kanban-error-stack-container',
	ERROR_STACK_TOGGLE: 'kanban-error-stack-toggle',
	ERROR_STACK: 'kanban-error-stack',
	ERROR_RETRY: 'kanban-error-retry',
	
	// Empty state
	EMPTY_STATE: 'kanban-empty-state',
} as const;

/** Sortable.js configuration constants */
export const SORTABLE_CONFIG = {
	ANIMATION_DURATION: 150,
} as const;

/** Error display text */
export const ERROR_TEXT = {
	ICON: '⚠️',
	TITLE: 'Kanban View Error',
	SHOW_STACK: 'Show stack trace',
	HIDE_STACK: 'Hide stack trace',
	RETRY: 'Retry',
} as const;

/** Empty state messages */
export const EMPTY_STATE_MESSAGES = {
	NO_ENTRIES: 'No entries found. Add some notes to your base.',
	NO_PROPERTIES: 'No properties found in entries.',
} as const;

