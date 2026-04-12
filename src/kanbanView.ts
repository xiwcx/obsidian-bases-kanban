import type { App, BasesEntry, BasesPropertyId, Component, QueryController, ViewOption } from 'obsidian';
import {
	BasesView,
	HTMLValue,
	Keymap,
	ListValue,
	MarkdownRenderer,
	NullValue,
	sanitizeHTMLToDom,
	parsePropertyId,
} from 'obsidian';
import Sortable from 'sortablejs';
import {
	COLOR_PALETTE,
	CSS_CLASSES,
	DATA_ATTRIBUTES,
	DEBOUNCE_DELAY,
	EMPTY_STATE_MESSAGES,
	SORTABLE_CONFIG,
	SORTABLE_GROUP,
	UNCATEGORIZED_LABEL,
} from './constants.ts';
import type { DebouncedFn } from './utils/debounce.ts';
import { debounce } from './utils/debounce.ts';
import { ensureGroupExists, normalizePropertyValue } from './utils/grouping.ts';

export interface LegacyData {
	columnOrders: Record<string, string[]>;
	columnColors: Record<string, Record<string, string>>;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

export function isColumnOrders(value: unknown): value is Record<string, string[]> {
	return isRecord(value) && Object.values(value).every((v) => Array.isArray(v));
}

export function isColumnColors(value: unknown): value is Record<string, Record<string, string>> {
	return (
		isRecord(value) &&
		Object.values(value).every((v) => isRecord(v) && Object.values(v).every((c) => typeof c === 'string'))
	);
}

export function isCardOrders(value: unknown): value is Record<string, Record<string, string[]>> {
	return (
		isRecord(value) &&
		!Array.isArray(value) &&
		Object.values(value).every((v) => isRecord(v) && !Array.isArray(v) && Object.values(v).every((a) => Array.isArray(a)))
	);
}

/**
 * Wraps MarkdownRenderer.render() and strips the outer <p> it emits for
 * inline content, matching the pattern used by Dataview (blacksmithgu/obsidian-dataview,
 * src/ui/render.ts — renderCompactMarkdown).
 */
async function renderCompactMarkdown(
	app: App,
	markdown: string,
	el: HTMLElement,
	sourcePath: string,
	component: Component,
): Promise<void> {
	const span = el.createSpan();
	await MarkdownRenderer.render(app, markdown, span, sourcePath, component);
	const p = span.querySelector(':scope > p');
	if (span.children.length === 1 && p) {
		while (p.firstChild) span.appendChild(p.firstChild);
		span.removeChild(p);
	}
}

/**
 * Render an Obsidian Value into a container element with type-aware dispatch.
 *
 * Dispatch order (most-specific subclass first to avoid StringValue catching
 * HTMLValue/LinkValue before they are checked):
 *   HTMLValue  → sanitizeHTMLToDom (raw HTML from the html("") formula function)
 *   ListValue  → comma-separated spans, each item rendered recursively
 *   everything else → MarkdownRenderer.render via renderCompactMarkdown
 *                     (handles wikilinks, tags, plain text, dates, booleans …)
 *
 * Value class sources: https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts (@since 1.10.0)
 * Dataview dispatch reference: https://github.com/blacksmithgu/obsidian-dataview/blob/master/src/ui/render.ts
 */
export async function renderPropertyValue(
	app: App | undefined,
	value: { toString(): string },
	el: HTMLElement,
	sourcePath: string,
	component: Component,
): Promise<void> {
	if (value instanceof HTMLValue) {
		el.appendChild(sanitizeHTMLToDom(value.toString()));
	} else if (value instanceof ListValue) {
		const len = value.length();
		for (let i = 0; i < len; i++) {
			if (i > 0) el.appendChild(document.createTextNode(', '));
			const item = value.get(i);
			if (!(item instanceof NullValue)) {
				await renderPropertyValue(app, item, el, sourcePath, component);
			}
		}
	} else if (app) {
		await renderCompactMarkdown(app, value.toString(), el, sourcePath, component);
	} else {
		el.appendChild(document.createTextNode(value.toString()));
	}
}

export class KanbanView extends BasesView {
	type = 'kanban-view';

	scrollEl: HTMLElement;
	containerEl: HTMLElement;
	private legacyData: LegacyData | null;
	private groupByPropertyId: BasesPropertyId | null = null;
	private swimlaneByPropertyId: BasesPropertyId | null = null;
	private cardTitlePropertyId: BasesPropertyId | null = null;

	/**
	 * Card drag sortables.
	 * Flat mode key:     "columnValue"
	 * Swimlane mode key: "swimlaneValue||columnValue"
	 */
	private _columnSortables: Map<string, Sortable> = new Map();
	/**
	 * Column-reorder sortables — one per swimlane board in swimlane mode,
	 * keyed by swimlane value.  Unused in flat mode (columnSortable covers that).
	 */
	private _columnBoardSortables: Map<string, Sortable> = new Map();
	/** Swimlane row reorder sortable (swimlane mode only). */
	private _swimlaneSortable: Sortable | null = null;
	/** Column reorder sortable for the flat-mode board. */
	private columnSortable: Sortable | null = null;

	private _entryMap: Map<string, BasesEntry> = new Map();
	private _debouncedRender: DebouncedFn<() => void>;
	private activeColorPicker: HTMLElement | null = null;

	/**
	 * In-memory display preferences — the single source of truth during a session.
	 *
	 * Loaded from config once when groupByPropertyId changes. Renders read from
	 * here exclusively and never call config.set(). Only explicit user actions
	 * (drag-drop, column remove, color change) update _prefs and then call
	 * _persistPrefs() to write back to config.
	 *
	 * This breaks the config.set() → onDataUpdated() feedback loop that caused
	 * state thrashing on every render cycle.
	 *
	 * Card order keys in swimlane mode use the composite format "swimlaneValue||columnValue"
	 * so the same cardOrders map works for both flat and swimlane modes.
	 */
	private _lastOrderKey: string = '';
	private _lastWrapValue: boolean | null = null;
	private _lastCardTitlePropertyId: BasesPropertyId | null | undefined = undefined;
	private _lastSwimlanePropertyId: BasesPropertyId | null | undefined = undefined;

	private _prefs: { columnOrder: string[]; cardOrders: Record<string, string[]>; columnColors: Record<string, string> } =
		{
			columnOrder: [],
			cardOrders: {},
			columnColors: {},
		};
	private _prefsPropertyId: BasesPropertyId | null = null;

	private _swimlanePrefs: { swimlaneOrder: string[] } = { swimlaneOrder: [] };
	private _swimlanePrefsPropertyId: BasesPropertyId | null = null;

	/**
	 * True while a card or column drag is in flight. When set, patchColumnCards
	 * skips DOM reordering so Sortable's live drag preview is not disturbed by
	 * re-renders triggered during the drag.
	 */
	private _dragging = false;
	private _activeCardPath: string | null = null;

	constructor(controller: QueryController, scrollEl: HTMLElement, legacyData: LegacyData | null = null) {
		super(controller);
		this.scrollEl = scrollEl;
		this.containerEl = scrollEl.createDiv({ cls: CSS_CLASSES.VIEW_CONTAINER });
		this.legacyData = legacyData;

		// Delegated handler for internal links rendered inside property values.
		// Obsidian's global click handler only covers MarkdownView/TextFileView
		// containers; BasesView does not inherit that, so we wire it up explicitly.
		this.containerEl.on('click', 'a.internal-link', (evt, linkEl) => {
			evt.preventDefault();
			const href = linkEl.getAttribute('data-href') || linkEl.getAttribute('href');
			if (href && this.app) {
				const cardEl = linkEl.closest(`[${DATA_ATTRIBUTES.ENTRY_PATH}]`);
				const sourcePath = cardEl instanceof HTMLElement ? (cardEl.getAttribute(DATA_ATTRIBUTES.ENTRY_PATH) ?? '') : '';
				void this.app.workspace.openLinkText(href, sourcePath, Keymap.isModEvent(evt));
			}
		});

		this._debouncedRender = debounce(() => {
			try {
				this.loadConfig();
				this.render();
			} catch (error) {
				console.error('KanbanView error:', error);
			}
		}, DEBOUNCE_DELAY);
	}

	onDataUpdated(): void {
		this._debouncedRender();
	}

	private loadConfig(): void {
		this.groupByPropertyId = this.config.getAsPropertyId('groupByProperty');
		this.cardTitlePropertyId = this.config.getAsPropertyId('cardTitleProperty');
		this.swimlaneByPropertyId = this.config.getAsPropertyId('swimlaneByProperty');
	}

	/**
	 * Load display preferences from config for the given column property.
	 * Called once when groupByPropertyId changes; subsequent renders reuse _prefs.
	 */
	private _loadPrefs(propertyId: BasesPropertyId): void {
		this._prefsPropertyId = propertyId;

		// Column order — with legacy migration
		const rawOrders = this.config?.get('columnOrders');
		const allOrders = isColumnOrders(rawOrders) ? rawOrders : {};
		let columnOrder = allOrders[propertyId] ?? null;
		const legacyOrder = this.legacyData?.columnOrders[propertyId] ?? null;
		if (!columnOrder && legacyOrder) {
			columnOrder = legacyOrder;
			this.config?.set('columnOrders', { ...allOrders, [propertyId]: legacyOrder });
		}
		this._prefs.columnOrder = columnOrder ? [...columnOrder] : [];

		// Card orders
		const rawCardOrders = this.config?.get('cardOrders');
		const allCardOrders = isCardOrders(rawCardOrders) ? rawCardOrders : {};
		const savedCardOrders = allCardOrders[propertyId] ?? {};
		this._prefs.cardOrders = Object.fromEntries(Object.entries(savedCardOrders).map(([k, v]) => [k, [...v]]));

		// Column colors — with legacy migration
		const rawColors = this.config?.get('columnColors');
		const allColors = isColumnColors(rawColors) ? rawColors : {};
		let columnColors = allColors[propertyId] ?? null;
		const legacyColors = this.legacyData?.columnColors[propertyId];
		if (!columnColors && legacyColors && Object.keys(legacyColors).length > 0) {
			columnColors = legacyColors;
			this.config?.set('columnColors', { ...allColors, [propertyId]: legacyColors });
		}
		this._prefs.columnColors = columnColors ? { ...columnColors } : {};
	}

	/** Load swimlane row order from config for the given swimlane property. */
	private _loadSwimlanePrefs(propertyId: BasesPropertyId): void {
		this._swimlanePrefsPropertyId = propertyId;
		const rawOrders = this.config?.get('swimlaneOrders');
		const allOrders = isColumnOrders(rawOrders) ? rawOrders : {};
		const savedOrder = allOrders[propertyId] ?? null;
		this._swimlanePrefs.swimlaneOrder = savedOrder ? [...savedOrder] : [];
	}

	/**
	 * Write _prefs back to config. Called only on user actions (drag-drop,
	 * column remove, color change) — never during renders.
	 *
	 * Change guards skip config.set() when the value hasn't changed, preventing
	 * spurious onDataUpdated() triggers.
	 */
	private _persistConfigKey<T>(key: string, guard: (v: unknown) => v is Record<string, T>, newValue: T): void {
		if (!this._prefsPropertyId) return;
		const raw = this.config?.get(key);
		const all: Record<string, T> = guard(raw) ? raw : {};
		if (JSON.stringify(all[this._prefsPropertyId]) !== JSON.stringify(newValue)) {
			this.config?.set(key, { ...all, [this._prefsPropertyId]: newValue });
		}
	}

	private _persistPrefs(): void {
		this._persistConfigKey('columnOrders', isColumnOrders, this._prefs.columnOrder);
		this._persistConfigKey('cardOrders', isCardOrders, this._prefs.cardOrders);
		this._persistConfigKey('columnColors', isColumnColors, this._prefs.columnColors);
	}

	private _persistSwimlanePrefs(): void {
		if (!this._swimlanePrefsPropertyId) return;
		const rawOrders = this.config?.get('swimlaneOrders');
		const allOrders = isColumnOrders(rawOrders) ? rawOrders : {};
		if (JSON.stringify(allOrders[this._swimlanePrefsPropertyId]) !== JSON.stringify(this._swimlanePrefs.swimlaneOrder)) {
			this.config?.set('swimlaneOrders', {
				...allOrders,
				[this._swimlanePrefsPropertyId]: this._swimlanePrefs.swimlaneOrder,
			});
		}
	}

	/**
	 * True when swimlane mode is active (a swimlane property is selected and it
	 * differs from the column group-by property). Use this instead of checking
	 * swimlaneByPropertyId directly, because the raw field may be non-null even
	 * when the user picked the same property for both axes.
	 */
	private get isSwimlaneModeActive(): boolean {
		return !!this.swimlaneByPropertyId && this.swimlaneByPropertyId !== this.groupByPropertyId;
	}

	/**
	 * Composite key for card order storage.
	 * Flat mode:     cardOrderKey("Todo")           → "Todo"
	 * Swimlane mode: cardOrderKey("Todo", "Backlog") → "Backlog||Todo"
	 */
	private cardOrderKey(columnValue: string, swimlaneValue?: string): string {
		return swimlaneValue ? `${swimlaneValue}||${columnValue}` : columnValue;
	}

	private render(): void {
		try {
			const entries = this.data?.data || [];
			const availablePropertyIds = this.allProperties || [];

			if (!this.groupByPropertyId && availablePropertyIds.length === 0) {
				this.fullReset();
				this.containerEl.createDiv({
					text: EMPTY_STATE_MESSAGES.NO_PROPERTIES,
					cls: CSS_CLASSES.EMPTY_STATE,
				});
				return;
			}
			if (!this.groupByPropertyId) {
				this.groupByPropertyId = availablePropertyIds[0];
			}
			// If groupByPropertyId is set but is no longer in availablePropertyIds
			// (e.g. all notes with that property were removed), keep the configured
			// value so the board renders from persisted prefs rather than switching
			// to an unrelated property.

			// Reload prefs when the column property changes
			if (this.groupByPropertyId !== this._prefsPropertyId) {
				this._loadPrefs(this.groupByPropertyId);
			}

			// Swimlane mode is active only when a different property is selected
			const hasSwimlane = !!this.swimlaneByPropertyId && this.swimlaneByPropertyId !== this.groupByPropertyId;

			// Reload/clear swimlane prefs when the swimlane property changes
			if (hasSwimlane && this.swimlaneByPropertyId !== this._swimlanePrefsPropertyId) {
				this._loadSwimlanePrefs(this.swimlaneByPropertyId);
			} else if (!hasSwimlane && this._swimlanePrefsPropertyId !== null) {
				this._swimlanePrefsPropertyId = null;
				this._swimlanePrefs = { swimlaneOrder: [] };
			}

			const hasNoEntries = entries.length === 0;
			const hasNoSavedColumns = this._prefs.columnOrder.length === 0;
			if (hasNoEntries && hasNoSavedColumns) {
				this.fullReset();
				this.containerEl.createDiv({
					text: EMPTY_STATE_MESSAGES.NO_ENTRIES,
					cls: CSS_CLASSES.EMPTY_STATE,
				});
				return;
			}
			// hasNoEntries && !hasNoSavedColumns: board has saved columns — render them as empty so the user can see and manage them.

			// Build path→entry lookup map for O(1) access in handleCardDrop
			this._entryMap = new Map(entries.map((e: BasesEntry) => [e.file.path, e]));

			// Change detection flags
			const currentOrderKey = JSON.stringify(this.config?.getOrder() ?? []);
			const orderChanged = currentOrderKey !== this._lastOrderKey;
			this._lastOrderKey = currentOrderKey;

			const currentWrapValue = this.config?.get('wrapPropertyValues') === true;
			const wrapChanged = currentWrapValue !== this._lastWrapValue;
			this._lastWrapValue = currentWrapValue;

			const currentCardTitlePropertyId = this.cardTitlePropertyId;
			const cardTitleChanged = currentCardTitlePropertyId !== this._lastCardTitlePropertyId;
			this._lastCardTitlePropertyId = currentCardTitlePropertyId;

			const effectiveSwimlaneId = hasSwimlane ? this.swimlaneByPropertyId : null;
			const swimlaneChanged = effectiveSwimlaneId !== this._lastSwimlanePropertyId;
			this._lastSwimlanePropertyId = effectiveSwimlaneId;

			const existingBoard = this.containerEl.querySelector<HTMLElement>(`.${CSS_CLASSES.BOARD}`);
			const baseNeedsRebuild =
				!existingBoard ||
				this._prefsPropertyId !== this.groupByPropertyId ||
				orderChanged ||
				wrapChanged ||
				cardTitleChanged ||
				swimlaneChanged;

			if (hasSwimlane) {
				this._renderSwimlane(entries, existingBoard, baseNeedsRebuild);
			} else {
				this._renderFlat(entries, existingBoard, baseNeedsRebuild);
			}

			this.reapplyActiveCard();
		} catch (error) {
			console.error('KanbanView error:', error);
		}
	}

	private _renderFlat(entries: BasesEntry[], existingBoard: HTMLElement | null, baseNeedsRebuild: boolean): void {
		const groupedEntries = this.groupEntriesByProperty(entries, this.groupByPropertyId);

		// Apply saved card order within each column
		groupedEntries.forEach((columnEntries, value) => {
			const savedOrder = this._prefs.cardOrders[value];
			if (savedOrder) {
				groupedEntries.set(value, this.applyCardOrder(columnEntries, savedOrder));
			}
		});

		// Merge any newly-seen column values into prefs and persist eagerly
		const liveValues = Array.from(groupedEntries.keys());
		const newValues = liveValues.filter((v) => !this._prefs.columnOrder.includes(v));
		if (newValues.length > 0) {
			const isInitialOrder = this._prefs.columnOrder.length === 0;
			this._prefs.columnOrder = isInitialOrder ? [...newValues].sort() : [...this._prefs.columnOrder, ...newValues];
			this._persistPrefs();
		}

		const orderedValues = this.getOrderedColumnValues(liveValues);

		if (baseNeedsRebuild) {
			this.fullRebuild(orderedValues, groupedEntries);
		} else {
			this.patchBoard(existingBoard, orderedValues, groupedEntries);
		}
	}

	private _renderSwimlane(entries: BasesEntry[], existingBoard: HTMLElement | null, baseNeedsRebuild: boolean): void {
		const swimlaneGrouped = this.groupEntriesByProperty(entries, this.swimlaneByPropertyId);

		// Compute the union of all column values across every swimlane
		const allColValSet = new Set<string>();
		swimlaneGrouped.forEach((slEntries) => {
			this.groupEntriesByProperty(slEntries, this.groupByPropertyId).forEach((_, k) => allColValSet.add(k));
		});
		const allColumnValues = Array.from(allColValSet);

		// Merge new swimlane values into prefs
		const liveSwimlaneValues = Array.from(swimlaneGrouped.keys());
		const newSwimlaneValues = liveSwimlaneValues.filter((v) => !this._swimlanePrefs.swimlaneOrder.includes(v));
		if (newSwimlaneValues.length > 0) {
			const isInitial = this._swimlanePrefs.swimlaneOrder.length === 0;
			this._swimlanePrefs.swimlaneOrder = isInitial
				? [...newSwimlaneValues].sort()
				: [...this._swimlanePrefs.swimlaneOrder, ...newSwimlaneValues];
			this._persistSwimlanePrefs();
		}

		// Merge new column values into prefs
		const newColValues = allColumnValues.filter((v) => !this._prefs.columnOrder.includes(v));
		if (newColValues.length > 0) {
			const isInitialOrder = this._prefs.columnOrder.length === 0;
			this._prefs.columnOrder = isInitialOrder ? [...newColValues].sort() : [...this._prefs.columnOrder, ...newColValues];
			this._persistPrefs();
		}

		const orderedColumns = this.getOrderedColumnValues(allColumnValues);
		const orderedSwimlanes = this.getOrderedSwimlaneValues(liveSwimlaneValues);

		if (baseNeedsRebuild) {
			this.fullRebuildSwimlane(orderedColumns, orderedSwimlanes, swimlaneGrouped);
		} else {
			this.patchSwimlaneBoard(existingBoard, orderedColumns, orderedSwimlanes, swimlaneGrouped);
		}
	}

	private destroySortables(): void {
		this._columnSortables.forEach((s) => s.destroy());
		this._columnSortables.clear();
		if (this.columnSortable) {
			this.columnSortable.destroy();
			this.columnSortable = null;
		}
		this._columnBoardSortables.forEach((s) => s.destroy());
		this._columnBoardSortables.clear();
		if (this._swimlaneSortable) {
			this._swimlaneSortable.destroy();
			this._swimlaneSortable = null;
		}
	}

	private fullReset(): void {
		this.containerEl.empty();
		this.destroySortables();
		this._entryMap.clear();
	}

	/** Flat mode full rebuild. */
	private fullRebuild(orderedValues: string[], groupedEntries: Map<string, BasesEntry[]>): void {
		this.containerEl.empty();
		this.destroySortables();

		const boardEl = this.containerEl.createDiv({ cls: CSS_CLASSES.BOARD });
		orderedValues.forEach((value) => {
			const columnEl = this.createColumn(value, groupedEntries.get(value) || []);
			boardEl.appendChild(columnEl);
		});

		this.initializeSortable();
		this.initializeColumnSortable();
	}

	/** Swimlane mode full rebuild. */
	private fullRebuildSwimlane(
		orderedColumns: string[],
		orderedSwimlanes: string[],
		swimlaneGrouped: Map<string, BasesEntry[]>,
	): void {
		this.containerEl.empty();
		this.destroySortables();

		const boardEl = this.containerEl.createDiv({
			cls: `${CSS_CLASSES.BOARD} ${CSS_CLASSES.BOARD_SWIMLANE}`,
		});

		orderedSwimlanes.forEach((slValue) => {
			const slEntries = swimlaneGrouped.get(slValue) ?? [];
			const colGrouped = this.buildColumnGrouped(slEntries, slValue);
			const slEl = this.createSwimlane(slValue, orderedColumns, colGrouped);
			boardEl.appendChild(slEl);
		});

		this.initializeSortableForSwimlanes();
		this.initializeColumnSortablesForSwimlanes();
		this.initializeSwimlaneSort();
	}

	/**
	 * Group a set of entries by the column property and apply saved card order.
	 * swimlaneValue is passed in swimlane mode to build the composite card-order key.
	 */
	private buildColumnGrouped(slEntries: BasesEntry[], swimlaneValue?: string): Map<string, BasesEntry[]> {
		const colGrouped = this.groupEntriesByProperty(slEntries, this.groupByPropertyId);
		colGrouped.forEach((colEntries, colValue) => {
			const key = this.cardOrderKey(colValue, swimlaneValue);
			const savedOrder = this._prefs.cardOrders[key];
			if (savedOrder) {
				colGrouped.set(colValue, this.applyCardOrder(colEntries, savedOrder));
			}
		});
		return colGrouped;
	}

	private createSwimlane(slValue: string, orderedColumns: string[], colGrouped: Map<string, BasesEntry[]>): HTMLElement {
		const slEl = document.createElement('div');
		slEl.className = CSS_CLASSES.SWIMLANE;
		slEl.setAttribute(DATA_ATTRIBUTES.SWIMLANE_VALUE, slValue);

		const headerEl = slEl.createDiv({ cls: CSS_CLASSES.SWIMLANE_HEADER });
		const dragHandle = headerEl.createDiv({ cls: CSS_CLASSES.SWIMLANE_DRAG_HANDLE });
		dragHandle.textContent = '⋮⋮';
		headerEl.createSpan({ text: slValue, cls: CSS_CLASSES.SWIMLANE_TITLE });
		const totalEntries = Array.from(colGrouped.values()).reduce((sum, arr) => sum + arr.length, 0);
		headerEl.createSpan({ text: `${totalEntries}`, cls: CSS_CLASSES.SWIMLANE_COUNT });

		const innerBoardEl = slEl.createDiv({ cls: CSS_CLASSES.SWIMLANE_BOARD });
		orderedColumns.forEach((colValue) => {
			const colEl = this.createColumn(colValue, colGrouped.get(colValue) ?? []);
			innerBoardEl.appendChild(colEl);
		});

		return slEl;
	}

	/** Patch the swimlane board in place (add/remove/reorder swimlane rows and their columns). */
	private patchSwimlaneBoard(
		boardEl: HTMLElement,
		orderedColumns: string[],
		orderedSwimlanes: string[],
		swimlaneGrouped: Map<string, BasesEntry[]>,
	): void {
		const existingSwimlanes = new Map<string, HTMLElement>();
		boardEl.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.SWIMLANE}`).forEach((sl) => {
			const val = sl.getAttribute(DATA_ATTRIBUTES.SWIMLANE_VALUE);
			if (val !== null) existingSwimlanes.set(val, sl);
		});

		const newSwimlaneSet = new Set(orderedSwimlanes);

		// Remove swimlanes no longer present
		existingSwimlanes.forEach((slEl, value) => {
			if (!newSwimlaneSet.has(value)) {
				this.detachSwimlane(value, slEl);
				existingSwimlanes.delete(value);
			}
		});

		// Add new swimlane rows or patch existing ones
		orderedSwimlanes.forEach((slValue) => {
			const slEntries = swimlaneGrouped.get(slValue) ?? [];
			const colGrouped = this.buildColumnGrouped(slEntries, slValue);

			if (!existingSwimlanes.has(slValue)) {
				const slEl = this.createSwimlane(slValue, orderedColumns, colGrouped);
				boardEl.appendChild(slEl);
				existingSwimlanes.set(slValue, slEl);
				const innerBoard = slEl.querySelector<HTMLElement>(`.${CSS_CLASSES.SWIMLANE_BOARD}`);
				if (innerBoard) {
					this.attachCardSortablesForSwimlaneBoard(innerBoard, slValue);
					this.attachColumnSortableForSwimlane(innerBoard, slValue);
				}
			} else {
				const slEl = existingSwimlanes.get(slValue);
				this.patchSwimlaneRow(slEl, orderedColumns, colGrouped, slValue);
			}
		});

		// Re-order swimlane rows in the DOM to match orderedSwimlanes
		orderedSwimlanes.forEach((value) => {
			const slEl = existingSwimlanes.get(value);
			if (slEl) boardEl.appendChild(slEl);
		});
	}

	/** Patch columns and their cards within a single swimlane row. */
	private patchSwimlaneRow(
		slEl: HTMLElement,
		orderedColumns: string[],
		colGrouped: Map<string, BasesEntry[]>,
		slValue: string,
	): void {
		const innerBoard = slEl.querySelector<HTMLElement>(`.${CSS_CLASSES.SWIMLANE_BOARD}`);
		if (!innerBoard) return;

		// Update swimlane count badge
		const countEl = slEl.querySelector(`.${CSS_CLASSES.SWIMLANE_COUNT}`);
		if (countEl) {
			const total = Array.from(colGrouped.values()).reduce((sum, arr) => sum + arr.length, 0);
			countEl.textContent = `${total}`;
		}

		const existingColumns = new Map<string, HTMLElement>();
		innerBoard.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.COLUMN}`).forEach((col) => {
			const val = col.getAttribute(DATA_ATTRIBUTES.COLUMN_VALUE);
			if (val !== null) existingColumns.set(val, col);
		});

		const newColumnSet = new Set(orderedColumns);

		// Remove columns no longer in the global column order
		existingColumns.forEach((colEl, colValue) => {
			if (!newColumnSet.has(colValue)) {
				this.detachColumn(`${slValue}||${colValue}`, colEl);
				existingColumns.delete(colValue);
			}
		});

		// Add missing columns or patch existing ones
		orderedColumns.forEach((colValue) => {
			const newEntries = colGrouped.get(colValue) ?? [];
			if (!existingColumns.has(colValue)) {
				const colEl = this.createColumn(colValue, newEntries);
				innerBoard.appendChild(colEl);
				existingColumns.set(colValue, colEl);
				const body = colEl.querySelector<HTMLElement>(`.${CSS_CLASSES.COLUMN_BODY}[${DATA_ATTRIBUTES.SORTABLE_CONTAINER}]`);
				if (body) this.attachCardSortable(body, colValue, slValue);
			} else {
				const colEl = existingColumns.get(colValue);
				this.patchColumnCards(colEl, newEntries);
			}
		});

		// Re-order columns in DOM to match orderedColumns
		orderedColumns.forEach((colValue) => {
			const colEl = existingColumns.get(colValue);
			if (colEl) innerBoard.appendChild(colEl);
		});
	}

	private patchBoard(boardEl: HTMLElement, orderedValues: string[], groupedEntries: Map<string, BasesEntry[]>): void {
		// Index existing column elements by their value
		const existingColumns = new Map<string, HTMLElement>();
		boardEl.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.COLUMN}`).forEach((col) => {
			const val = col.getAttribute(DATA_ATTRIBUTES.COLUMN_VALUE);
			if (val !== null) existingColumns.set(val, col);
		});

		const newValueSet = new Set(orderedValues);

		// Remove columns not in the new ordered set
		existingColumns.forEach((colEl, value) => {
			if (!newValueSet.has(value)) {
				this.detachColumn(value, colEl);
				existingColumns.delete(value);
			}
		});

		// Add new columns; patch cards in existing columns
		orderedValues.forEach((value) => {
			const newEntries = groupedEntries.get(value) || [];
			if (!existingColumns.has(value)) {
				const columnEl = this.createColumn(value, newEntries);
				boardEl.appendChild(columnEl);
				existingColumns.set(value, columnEl);
				const body = columnEl.querySelector<HTMLElement>(
					`.${CSS_CLASSES.COLUMN_BODY}[${DATA_ATTRIBUTES.SORTABLE_CONTAINER}]`,
				);
				if (body) this.attachCardSortable(body, value);
			} else {
				const colEl = existingColumns.get(value);
				if (colEl) this.patchColumnCards(colEl, newEntries);
			}
		});

		// Re-order columns in the DOM to match orderedValues
		orderedValues.forEach((value) => {
			const colEl = existingColumns.get(value);
			if (colEl) boardEl.appendChild(colEl);
		});
	}

	private patchColumnCards(columnEl: HTMLElement, newEntries: BasesEntry[]): void {
		const body = columnEl.querySelector<HTMLElement>(`.${CSS_CLASSES.COLUMN_BODY}`);
		if (!body) return;

		// Update column count
		const countEl = columnEl.querySelector(`.${CSS_CLASSES.COLUMN_COUNT}`);
		if (countEl) countEl.textContent = `${newEntries.length}`;

		// Sync remove button — only in flat mode (in swimlane mode removing a column is global)
		if (!this.isSwimlaneModeActive) {
			const headerEl = columnEl.querySelector<HTMLElement>(`.${CSS_CLASSES.COLUMN_HEADER}`);
			const columnValue = columnEl.getAttribute(DATA_ATTRIBUTES.COLUMN_VALUE);
			const existingRemoveBtn = headerEl?.querySelector(`.${CSS_CLASSES.COLUMN_REMOVE_BTN}`) ?? null;
			if (headerEl && newEntries.length === 0 && !existingRemoveBtn && columnValue) {
				headerEl.appendChild(this.createRemoveButton(columnValue, columnEl));
			} else if (newEntries.length > 0 && existingRemoveBtn) {
				existingRemoveBtn.remove();
			}
		}

		// Remove cards whose entry is no longer in this column
		const newPaths = new Set(newEntries.map((e) => e.file.path));
		body.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.CARD}`).forEach((card) => {
			const path = card.getAttribute(DATA_ATTRIBUTES.ENTRY_PATH);
			if (path && !newPaths.has(path)) card.remove();
		});

		// Re-create all cards so that property value changes are always reflected.
		const existingCards = new Map<string, HTMLElement>();
		body.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.CARD}`).forEach((card) => {
			const path = card.getAttribute(DATA_ATTRIBUTES.ENTRY_PATH);
			if (path) existingCards.set(path, card);
		});
		newEntries.forEach((entry) => {
			const newCard = this.createCard(entry);
			const existing = existingCards.get(entry.file.path);
			if (existing) {
				body.replaceChild(newCard, existing);
			} else {
				body.appendChild(newCard);
			}
		});

		// Reorder cards in the DOM to match newEntries order.
		// Skipped during active drags — Sortable owns the DOM during a drag and
		// reordering here would fight its live preview, causing visual thrashing.
		if (!this._dragging) {
			const pathToCard = new Map<string, Element>();
			body.querySelectorAll(`.${CSS_CLASSES.CARD}`).forEach((card) => {
				const path = card instanceof HTMLElement ? card.getAttribute(DATA_ATTRIBUTES.ENTRY_PATH) : null;
				if (path) pathToCard.set(path, card);
			});
			newEntries.forEach((entry) => {
				const card = pathToCard.get(entry.file.path);
				if (card) body.appendChild(card);
			});
		}
	}

	private groupEntriesByProperty(entries: BasesEntry[], propertyId: BasesPropertyId): Map<string, BasesEntry[]> {
		const grouped = new Map<string, BasesEntry[]>();

		entries.forEach((entry) => {
			try {
				const propValue = entry.getValue(propertyId);
				const value = normalizePropertyValue(propValue);
				const group = ensureGroupExists(grouped, value);
				group.push(entry);
			} catch (error) {
				console.warn('Error processing entry:', entry.file.path, error);
				const uncategorizedGroup = ensureGroupExists(grouped, UNCATEGORIZED_LABEL);
				uncategorizedGroup.push(entry);
			}
		});

		return grouped;
	}

	private createColumn(value: string, entries: BasesEntry[]): HTMLElement {
		const columnEl = document.createElement('div');
		columnEl.className = CSS_CLASSES.COLUMN;
		columnEl.setAttribute(DATA_ATTRIBUTES.COLUMN_VALUE, value);

		// Apply stored color accent from prefs
		const colorName = this._prefs.columnColors[value] ?? null;
		this.applyColumnColor(columnEl, colorName);

		// Column header
		const headerEl = columnEl.createDiv({ cls: CSS_CLASSES.COLUMN_HEADER });

		const dragHandle = headerEl.createDiv({ cls: CSS_CLASSES.COLUMN_DRAG_HANDLE });
		dragHandle.textContent = '⋮⋮';

		const colorBtn = headerEl.createDiv({ cls: CSS_CLASSES.COLUMN_COLOR_BTN });
		colorBtn.setAttribute('aria-label', `Set color for column: ${value}`);
		colorBtn.setAttribute('role', 'button');
		colorBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.openColorPicker(colorBtn, columnEl, value);
		});

		headerEl.createSpan({ text: value, cls: CSS_CLASSES.COLUMN_TITLE });
		headerEl.createSpan({ text: `${entries.length}`, cls: CSS_CLASSES.COLUMN_COUNT });

		// Remove button — only in flat mode and only when column has no entries
		if (entries.length === 0 && !this.isSwimlaneModeActive) {
			headerEl.appendChild(this.createRemoveButton(value, columnEl));
		}

		// Column body (cards container)
		const bodyEl = columnEl.createDiv({ cls: CSS_CLASSES.COLUMN_BODY });
		bodyEl.setAttribute(DATA_ATTRIBUTES.SORTABLE_CONTAINER, 'true');

		entries.forEach((entry) => {
			const cardEl = this.createCard(entry);
			bodyEl.appendChild(cardEl);
		});

		return columnEl;
	}

	private renderCardTitle(titleEl: HTMLElement, entry: BasesEntry, filePath: string): void {
		if (!this.cardTitlePropertyId) {
			titleEl.textContent = entry.file.basename;
			return;
		}

		const titleValue = entry.getValue(this.cardTitlePropertyId);

		if (titleValue === null || titleValue instanceof NullValue) {
			titleEl.textContent = entry.file.basename;
			return;
		}

		void renderPropertyValue(this.app, titleValue, titleEl, filePath, this);
	}

	private createCard(entry: BasesEntry): HTMLElement {
		const cardEl = document.createElement('div');
		cardEl.className = CSS_CLASSES.CARD;
		const filePath = entry.file.path;
		cardEl.setAttribute(DATA_ATTRIBUTES.ENTRY_PATH, filePath);

		const titleEl = cardEl.createDiv({ cls: CSS_CLASSES.CARD_TITLE });
		this.renderCardTitle(titleEl, entry, filePath);

		const order = this.config?.getOrder() ?? [];
		const shouldWrap = this.config?.get('wrapPropertyValues') === true;

		for (const propertyId of order) {
			if (propertyId === this.groupByPropertyId) continue;
			if (propertyId === this.swimlaneByPropertyId) continue;
			const value = entry.getValue(propertyId);
			if (value === null) continue;
			const valueStr = value.toString().trim();
			if (!valueStr || valueStr === 'null') continue;
			const label = this.config?.getDisplayName(propertyId) ?? propertyId;
			const propertyEl = cardEl.createDiv({ cls: CSS_CLASSES.CARD_PROPERTY });
			if (shouldWrap) {
				propertyEl.classList.add(CSS_CLASSES.CARD_PROPERTY_WRAP);
			}
			propertyEl.createSpan({ text: label, cls: CSS_CLASSES.CARD_PROPERTY_LABEL });
			const valueEl = propertyEl.createSpan({ cls: CSS_CLASSES.CARD_PROPERTY_VALUE });
			void renderPropertyValue(this.app, value, valueEl, filePath, this);
		}

		// JS-managed hover: mouseenter/mouseleave instead of CSS :hover so the
		// class is never applied when an element slides under a stationary cursor
		// after a drag reorders the DOM.
		cardEl.addEventListener('mouseenter', () => cardEl.classList.add(CSS_CLASSES.CARD_HOVER));
		cardEl.addEventListener('mouseleave', () => cardEl.classList.remove(CSS_CLASSES.CARD_HOVER));

		const clickHandler = (e: MouseEvent) => {
			if (e.target instanceof Element && e.target.closest('a')) return;
			this.setActiveCard(filePath);
			if (this.app?.workspace) {
				void this.app.workspace.openLinkText(filePath, '', false);
			}
		};
		cardEl.addEventListener('click', clickHandler);

		return cardEl;
	}

	private applyColumnColor(columnEl: HTMLElement, colorName: string | null): void {
		if (!colorName) {
			columnEl.style.removeProperty('--obk-column-accent-color');
			columnEl.removeAttribute(DATA_ATTRIBUTES.COLUMN_COLOR);
			return;
		}
		const cssVar = COLOR_PALETTE.find((c) => c.name === colorName)?.cssVar ?? null;
		if (!cssVar) {
			columnEl.style.removeProperty('--obk-column-accent-color');
			columnEl.removeAttribute(DATA_ATTRIBUTES.COLUMN_COLOR);
			return;
		}
		columnEl.style.setProperty('--obk-column-accent-color', cssVar);
		columnEl.setAttribute(DATA_ATTRIBUTES.COLUMN_COLOR, colorName);
	}

	private openColorPicker(anchorEl: HTMLElement, columnEl: HTMLElement, columnValue: string): void {
		this.activeColorPicker?.remove();
		this.activeColorPicker = null;

		const popover = document.createElement('div');
		popover.className = CSS_CLASSES.COLUMN_COLOR_POPOVER;

		const currentColor = columnEl.getAttribute(DATA_ATTRIBUTES.COLUMN_COLOR);

		const noneSwatch = document.createElement('div');
		noneSwatch.className = `${CSS_CLASSES.COLUMN_COLOR_SWATCH} ${CSS_CLASSES.COLUMN_COLOR_NONE}`;
		if (!currentColor) noneSwatch.classList.add(CSS_CLASSES.COLUMN_COLOR_SWATCH_ACTIVE);
		noneSwatch.title = 'No color';
		noneSwatch.addEventListener('click', () => {
			this.applyColumnColor(columnEl, null);
			delete this._prefs.columnColors[columnValue];
			this._persistPrefs();
			popover.remove();
			this.activeColorPicker = null;
		});
		popover.appendChild(noneSwatch);

		for (const color of COLOR_PALETTE) {
			const swatch = document.createElement('div');
			swatch.className = CSS_CLASSES.COLUMN_COLOR_SWATCH;
			swatch.style.background = color.cssVar;
			swatch.title = color.name;
			if (currentColor === color.name) swatch.classList.add(CSS_CLASSES.COLUMN_COLOR_SWATCH_ACTIVE);
			swatch.addEventListener('click', () => {
				this.applyColumnColor(columnEl, color.name);
				this._prefs.columnColors[columnValue] = color.name;
				this._persistPrefs();
				popover.remove();
				this.activeColorPicker = null;
			});
			popover.appendChild(swatch);
		}

		const rect = anchorEl.getBoundingClientRect();
		popover.style.top = `${rect.bottom + 4}px`;
		popover.style.left = `${rect.left}px`;
		document.body.appendChild(popover);
		this.activeColorPicker = popover;

		const dismiss = (e: MouseEvent) => {
			if (e.target instanceof Node && !popover.contains(e.target) && e.target !== anchorEl) {
				popover.remove();
				this.activeColorPicker = null;
				document.removeEventListener('click', dismiss);
			}
		};
		document.addEventListener('click', dismiss);
	}

	private createRemoveButton(value: string, columnEl: HTMLElement): HTMLElement {
		const btn = document.createElement('div');
		btn.className = CSS_CLASSES.COLUMN_REMOVE_BTN;
		btn.setAttribute('aria-label', `Remove column: ${value}`);
		btn.setAttribute('role', 'button');
		btn.textContent = '×';
		btn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.removeColumn(value, columnEl);
		});
		return btn;
	}

	/**
	 * Detach a column element: destroy its card Sortable and remove from DOM.
	 * key is the _columnSortables map key ("colValue" or "slValue||colValue").
	 */
	private detachColumn(key: string, colEl: HTMLElement): void {
		const sortable = this._columnSortables.get(key);
		if (sortable) {
			sortable.destroy();
			this._columnSortables.delete(key);
		}
		colEl.remove();
	}

	/** Detach a swimlane row: destroy all its card/column sortables and remove from DOM. */
	private detachSwimlane(slValue: string, slEl: HTMLElement): void {
		// Destroy all card sortables belonging to this swimlane
		const prefix = `${slValue}||`;
		const keysToDelete = Array.from(this._columnSortables.keys()).filter((k) => k.startsWith(prefix));
		keysToDelete.forEach((k) => {
			this._columnSortables.get(k)?.destroy();
			this._columnSortables.delete(k);
		});

		// Destroy the column-board sortable for this swimlane
		this._columnBoardSortables.get(slValue)?.destroy();
		this._columnBoardSortables.delete(slValue);

		slEl.remove();
	}

	private removeColumn(value: string, columnEl: HTMLElement): void {
		if (!this._prefsPropertyId) return;
		this._prefs.columnOrder = this._prefs.columnOrder.filter((v) => v !== value);
		this._persistPrefs();
		this.detachColumn(value, columnEl);
	}

	private attachCardSortable(body: HTMLElement, columnValue: string, swimlaneValue?: string): void {
		const key = swimlaneValue ? `${swimlaneValue}||${columnValue}` : columnValue;
		const sortable = new Sortable(body, {
			group: SORTABLE_GROUP,
			animation: SORTABLE_CONFIG.ANIMATION_DURATION,
			dragClass: CSS_CLASSES.CARD_DRAGGING,
			ghostClass: CSS_CLASSES.CARD_GHOST,
			chosenClass: CSS_CLASSES.CARD_CHOSEN,
			onStart: (evt: Sortable.SortableEvent) => {
				this._dragging = true;
				if (evt.item instanceof HTMLElement) evt.item.classList.remove(CSS_CLASSES.CARD_HOVER);
			},
			onEnd: (evt: Sortable.SortableEvent) => {
				this._dragging = false;
				this.setActiveCard(null);
				void this.handleCardDrop(evt);
			},
		});
		this._columnSortables.set(key, sortable);
	}

	/** Flat mode: attach card sortables to all column bodies in the board. */
	private initializeSortable(): void {
		const selector = `.${CSS_CLASSES.COLUMN_BODY}[${DATA_ATTRIBUTES.SORTABLE_CONTAINER}]`;
		this.containerEl.querySelectorAll(selector).forEach((columnBody) => {
			if (!(columnBody instanceof HTMLElement)) return;
			const colEl = columnBody.closest(`.${CSS_CLASSES.COLUMN}`);
			const value = colEl instanceof HTMLElement ? colEl.getAttribute(DATA_ATTRIBUTES.COLUMN_VALUE) : null;
			if (!value) return;
			this.attachCardSortable(columnBody, value);
		});
	}

	/** Swimlane mode: attach card sortables to all column bodies (uses composite key). */
	private initializeSortableForSwimlanes(): void {
		const selector = `.${CSS_CLASSES.COLUMN_BODY}[${DATA_ATTRIBUTES.SORTABLE_CONTAINER}]`;
		this.containerEl.querySelectorAll(selector).forEach((columnBody) => {
			if (!(columnBody instanceof HTMLElement)) return;
			const colEl = columnBody.closest(`.${CSS_CLASSES.COLUMN}`);
			const columnValue = colEl instanceof HTMLElement ? colEl.getAttribute(DATA_ATTRIBUTES.COLUMN_VALUE) : null;
			if (!columnValue) return;
			const slEl = columnBody.closest(`.${CSS_CLASSES.SWIMLANE}`);
			const swimlaneValue =
				slEl instanceof HTMLElement ? (slEl.getAttribute(DATA_ATTRIBUTES.SWIMLANE_VALUE) ?? undefined) : undefined;
			this.attachCardSortable(columnBody, columnValue, swimlaneValue);
		});
	}

	/** Attach card sortables for all columns inside a single swimlane board element. */
	private attachCardSortablesForSwimlaneBoard(slBoard: HTMLElement, slValue: string): void {
		const selector = `.${CSS_CLASSES.COLUMN_BODY}[${DATA_ATTRIBUTES.SORTABLE_CONTAINER}]`;
		slBoard.querySelectorAll(selector).forEach((columnBody) => {
			if (!(columnBody instanceof HTMLElement)) return;
			const colEl = columnBody.closest(`.${CSS_CLASSES.COLUMN}`);
			const columnValue = colEl instanceof HTMLElement ? colEl.getAttribute(DATA_ATTRIBUTES.COLUMN_VALUE) : null;
			if (!columnValue) return;
			this.attachCardSortable(columnBody, columnValue, slValue);
		});
	}

	/** Flat mode: column reorder sortable on the board. */
	private initializeColumnSortable(): void {
		if (this.columnSortable) {
			this.columnSortable.destroy();
		}

		const boardEl = this.containerEl.querySelector(`.${CSS_CLASSES.BOARD}`);
		if (!boardEl || !(boardEl instanceof HTMLElement)) return;

		this.columnSortable = new Sortable(boardEl, {
			animation: SORTABLE_CONFIG.ANIMATION_DURATION,
			handle: `.${CSS_CLASSES.COLUMN_DRAG_HANDLE}`,
			draggable: `.${CSS_CLASSES.COLUMN}`,
			ghostClass: CSS_CLASSES.COLUMN_GHOST,
			dragClass: CSS_CLASSES.COLUMN_DRAGGING,
			onStart: () => {
				this._dragging = true;
			},
			onEnd: (evt: Sortable.SortableEvent) => {
				this._dragging = false;
				this.handleColumnDrop(evt);
			},
		});
	}

	/** Swimlane mode: create one column-reorder sortable per swimlane board. */
	private initializeColumnSortablesForSwimlanes(): void {
		this.containerEl.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.SWIMLANE_BOARD}`).forEach((slBoard) => {
			const slEl = slBoard.closest<HTMLElement>(`.${CSS_CLASSES.SWIMLANE}`);
			const slValue = slEl?.getAttribute(DATA_ATTRIBUTES.SWIMLANE_VALUE) ?? '';
			this.attachColumnSortableForSwimlane(slBoard, slValue);
		});
	}

	private attachColumnSortableForSwimlane(slBoard: HTMLElement, slValue: string): void {
		const existing = this._columnBoardSortables.get(slValue);
		if (existing) existing.destroy();

		const s = new Sortable(slBoard, {
			animation: SORTABLE_CONFIG.ANIMATION_DURATION,
			handle: `.${CSS_CLASSES.COLUMN_DRAG_HANDLE}`,
			draggable: `.${CSS_CLASSES.COLUMN}`,
			ghostClass: CSS_CLASSES.COLUMN_GHOST,
			dragClass: CSS_CLASSES.COLUMN_DRAGGING,
			onStart: () => {
				this._dragging = true;
			},
			onEnd: (evt: Sortable.SortableEvent) => {
				this._dragging = false;
				this.handleColumnDropForSwimlane(evt, slBoard);
			},
		});
		this._columnBoardSortables.set(slValue, s);
	}

	/** Swimlane mode: sortable for reordering swimlane rows on the outer board. */
	private initializeSwimlaneSort(): void {
		if (this._swimlaneSortable) {
			this._swimlaneSortable.destroy();
		}
		const boardEl = this.containerEl.querySelector<HTMLElement>(`.${CSS_CLASSES.BOARD}`);
		if (!boardEl) return;

		this._swimlaneSortable = new Sortable(boardEl, {
			animation: SORTABLE_CONFIG.ANIMATION_DURATION,
			handle: `.${CSS_CLASSES.SWIMLANE_DRAG_HANDLE}`,
			draggable: `.${CSS_CLASSES.SWIMLANE}`,
			ghostClass: CSS_CLASSES.SWIMLANE_GHOST,
			dragClass: CSS_CLASSES.SWIMLANE_DRAGGING,
			onStart: () => {
				this._dragging = true;
			},
			onEnd: (evt: Sortable.SortableEvent) => {
				this._dragging = false;
				this.handleSwimlaneDrop(evt);
			},
		});
	}

	private async handleCardDrop(evt: Sortable.SortableEvent): Promise<void> {
		if (!(evt.item instanceof HTMLElement)) {
			console.warn('Card element is not an HTMLElement:', evt.item);
			return;
		}

		const cardEl = evt.item;
		const entryPath = cardEl.getAttribute(DATA_ATTRIBUTES.ENTRY_PATH);

		if (!entryPath) {
			console.warn('No entry path found on card');
			return;
		}

		const columnSelector = `.${CSS_CLASSES.COLUMN}`;
		const oldColumnEl = evt.from.closest(columnSelector);
		const newColumnEl = evt.to.closest(columnSelector);

		if (!newColumnEl || !(newColumnEl instanceof HTMLElement)) {
			console.warn('Could not find new column element');
			return;
		}

		const oldColumnValue =
			oldColumnEl instanceof HTMLElement ? oldColumnEl.getAttribute(DATA_ATTRIBUTES.COLUMN_VALUE) : null;
		const newColumnValue = newColumnEl.getAttribute(DATA_ATTRIBUTES.COLUMN_VALUE);

		if (!newColumnValue) {
			console.warn('No column value found');
			return;
		}

		if (!this._prefsPropertyId) {
			console.warn('No group by property ID set');
			return;
		}

		// Determine swimlane context (null in flat mode)
		const swimlaneSelector = `.${CSS_CLASSES.SWIMLANE}`;
		const oldSwimlaneEl = evt.from.closest(swimlaneSelector);
		const newSwimlaneEl = evt.to.closest(swimlaneSelector);
		const oldSwimlaneValue =
			oldSwimlaneEl instanceof HTMLElement ? oldSwimlaneEl.getAttribute(DATA_ATTRIBUTES.SWIMLANE_VALUE) : null;
		const newSwimlaneValue =
			newSwimlaneEl instanceof HTMLElement ? newSwimlaneEl.getAttribute(DATA_ATTRIBUTES.SWIMLANE_VALUE) : null;

		// Helper: read card paths from a column body element
		const getColumnPaths = (bodyEl: Element): string[] =>
			Array.from(bodyEl.querySelectorAll(`.${CSS_CLASSES.CARD}`))
				.map((c) => (c instanceof HTMLElement ? c.getAttribute(DATA_ATTRIBUTES.ENTRY_PATH) : null))
				.filter((p): p is string => p !== null);

		const sameColumn = oldColumnValue === newColumnValue;
		const sameSwimlane = oldSwimlaneValue === newSwimlaneValue;

		const oldCardOrderKey = this.cardOrderKey(oldColumnValue ?? '', oldSwimlaneValue ?? undefined);
		const newCardOrderKey = this.cardOrderKey(newColumnValue, newSwimlaneValue ?? undefined);

		// Same position: just update card order and return
		if (sameColumn && sameSwimlane) {
			this._prefs.cardOrders[newCardOrderKey] = getColumnPaths(evt.to);
			this._persistPrefs();
			return;
		}

		// Cross-column or cross-swimlane drop: capture DOM order for both sides
		if (oldColumnEl instanceof HTMLElement && oldColumnValue) {
			const oldBody = oldColumnEl.querySelector(`.${CSS_CLASSES.COLUMN_BODY}`);
			if (oldBody) this._prefs.cardOrders[oldCardOrderKey] = getColumnPaths(oldBody);
		}
		this._prefs.cardOrders[newCardOrderKey] = getColumnPaths(evt.to);
		this._persistPrefs();

		const entry = this._entryMap.get(entryPath);
		if (!entry) {
			console.warn('Entry not found for path:', entryPath);
			return;
		}

		if (!this.app?.fileManager) {
			console.warn('File manager not available');
			return;
		}

		try {
			const parsedColumnProperty = parsePropertyId(this._prefsPropertyId);
			const columnValueToSet = newColumnValue === UNCATEGORIZED_LABEL ? '' : newColumnValue;

			let parsedSwimlaneProperty: ReturnType<typeof parsePropertyId> | null = null;
			let swimlaneValueToSet: string | null = null;
			if (this.swimlaneByPropertyId && !sameSwimlane && newSwimlaneValue !== null) {
				parsedSwimlaneProperty = parsePropertyId(this.swimlaneByPropertyId);
				swimlaneValueToSet = newSwimlaneValue === UNCATEGORIZED_LABEL ? '' : newSwimlaneValue;
			}

			await this.app.fileManager.processFrontMatter(entry.file, (frontmatter: Record<string, unknown>) => {
				if (!sameColumn) {
					if (columnValueToSet === '') {
						delete frontmatter[parsedColumnProperty.name];
					} else {
						frontmatter[parsedColumnProperty.name] = columnValueToSet;
					}
				}
				if (parsedSwimlaneProperty !== null && swimlaneValueToSet !== null) {
					if (swimlaneValueToSet === '') {
						delete frontmatter[parsedSwimlaneProperty.name];
					} else {
						frontmatter[parsedSwimlaneProperty.name] = swimlaneValueToSet;
					}
				}
			});
		} catch (error) {
			console.error('Error updating entry property:', error);
			this.render();
		}
	}

	/** Flat mode: persist column order after a column is dragged. */
	private handleColumnDrop(evt: Sortable.SortableEvent): void {
		if (!this._prefsPropertyId) return;

		const columns = this.containerEl.querySelectorAll(`.${CSS_CLASSES.COLUMN}`);
		const order = Array.from(columns)
			.map((col) => col.getAttribute(DATA_ATTRIBUTES.COLUMN_VALUE))
			.filter((v): v is string => v !== null);

		this._prefs.columnOrder = order;
		this._persistPrefs();
	}

	/**
	 * Swimlane mode: persist column order and sync it to all other swimlane boards.
	 * Column order is global — dragging in one row reorders all rows.
	 */
	private handleColumnDropForSwimlane(evt: Sortable.SortableEvent, draggedSlBoard: HTMLElement): void {
		if (!this._prefsPropertyId) return;

		const columns = draggedSlBoard.querySelectorAll(`.${CSS_CLASSES.COLUMN}`);
		const order = Array.from(columns)
			.map((col) => col.getAttribute(DATA_ATTRIBUTES.COLUMN_VALUE))
			.filter((v): v is string => v !== null);

		this._prefs.columnOrder = order;
		this._persistPrefs();

		// Sync column order to every OTHER swimlane board
		this.containerEl.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.SWIMLANE_BOARD}`).forEach((slBoard) => {
			if (slBoard === draggedSlBoard) return;
			order.forEach((colValue) => {
				const colEl = slBoard.querySelector<HTMLElement>(`[${DATA_ATTRIBUTES.COLUMN_VALUE}="${CSS.escape(colValue)}"]`);
				if (colEl) slBoard.appendChild(colEl);
			});
		});
	}

	/** Swimlane mode: persist swimlane row order after a row is dragged. */
	private handleSwimlaneDrop(evt: Sortable.SortableEvent): void {
		const swimlanes = this.containerEl.querySelectorAll(`.${CSS_CLASSES.SWIMLANE}`);
		const order = Array.from(swimlanes)
			.map((sl) => sl.getAttribute(DATA_ATTRIBUTES.SWIMLANE_VALUE))
			.filter((v): v is string => v !== null);

		this._swimlanePrefs.swimlaneOrder = order;
		this._persistSwimlanePrefs();
	}

	private findCardEl(path: string): HTMLElement | null {
		return (
			Array.from(this.containerEl.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.CARD}`)).find(
				(el) => el.getAttribute(DATA_ATTRIBUTES.ENTRY_PATH) === path,
			) ?? null
		);
	}

	private setActiveCard(path: string | null): void {
		if (this._activeCardPath) {
			this.findCardEl(this._activeCardPath)?.classList.remove(CSS_CLASSES.CARD_ACTIVE);
		}
		this._activeCardPath = path;
		if (path) {
			this.findCardEl(path)?.classList.add(CSS_CLASSES.CARD_ACTIVE);
		}
	}

	private reapplyActiveCard(): void {
		if (!this._activeCardPath) return;
		this.findCardEl(this._activeCardPath)?.classList.add(CSS_CLASSES.CARD_ACTIVE);
	}

	private getOrderedColumnValues(liveValues: string[]): string[] {
		if (!this._prefs.columnOrder.length) return liveValues.sort();
		// Include all saved columns (even empty ones); append any new live values.
		const newValues = liveValues.filter((v) => !this._prefs.columnOrder.includes(v));
		return [...this._prefs.columnOrder, ...newValues];
	}

	private getOrderedSwimlaneValues(liveValues: string[]): string[] {
		if (!this._swimlanePrefs.swimlaneOrder.length) return liveValues.sort();
		const newValues = liveValues.filter((v) => !this._swimlanePrefs.swimlaneOrder.includes(v));
		return [...this._swimlanePrefs.swimlaneOrder, ...newValues];
	}

	private applyCardOrder(entries: BasesEntry[], savedOrder: string[]): BasesEntry[] {
		const entryMap = new Map(entries.map((e) => [e.file.path, e]));
		const ordered = savedOrder.map((p) => entryMap.get(p)).filter((e): e is BasesEntry => e !== undefined);
		const unsaved = entries.filter((e) => !savedOrder.includes(e.file.path));
		return [...ordered, ...unsaved];
	}

	onClose(): void {
		this._debouncedRender.cancel();
		this.destroySortables();
		this.activeColorPicker?.remove();
		this.activeColorPicker = null;
	}

	/**
	 * Column state (order and colors) is persisted using BasesViewConfig.set/get
	 * (https://docs.obsidian.md/Reference/TypeScript+API/BasesViewConfig#Methods)
	 * rather than Plugin.saveData/loadData
	 * (https://docs.obsidian.md/Plugins/User+interface/Settings).
	 *
	 * Why: Plugin.saveData writes a single plugin-wide plugin.data.json, so all
	 * bases shared the same column state keyed only by property ID. Using the
	 * BasesViewConfig API instead means each .base file carries its own state —
	 * deleting and re-adding the plugin no longer wipes configuration, and two bases
	 * that group by the same property can have independent column orders and colors.
	 *
	 * Migration: versions prior to 0.3.0 wrote to plugin.data.json. The
	 * legacyData parameter passed from main.ts holds that data. On the first
	 * render after upgrade, the legacy value is written into the base config via
	 * set() and subsequent renders use _prefs which is already populated — so
	 * this migration path is exercised at most once per base.
	 *
	 * plugin.data.json is intentionally left in place after migration rather than
	 * deleted: removing it would be destructive if something went wrong mid-upgrade,
	 * and the file simply becomes stale once each base has migrated its own state.
	 */

	static getViewOptions(this: void): ViewOption[] {
		return [
			{
				displayName: 'Group by',
				type: 'property',
				key: 'groupByProperty',
				filter: (prop: string) => !prop.startsWith('file.'),
				placeholder: 'Select property',
			},
			{
				displayName: 'Swimlane by',
				type: 'property',
				key: 'swimlaneByProperty',
				filter: (prop: string) => !prop.startsWith('file.'),
				placeholder: 'None (flat board)',
			},
			{
				displayName: 'Card title property',
				type: 'property',
				key: 'cardTitleProperty',
				placeholder: 'Default: file name',
			},
			{
				displayName: 'Wrap property values',
				type: 'toggle',
				key: 'wrapPropertyValues',
			},
		];
	}
}
