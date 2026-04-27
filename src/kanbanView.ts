import type { App, BasesEntry, BasesPropertyId, Component, QueryController, ViewOption } from 'obsidian';
import {
	BasesView,
	HTMLValue,
	Keymap,
	ListValue,
	MarkdownRenderer,
	NullValue,
	Notice,
	normalizePath,
	parsePropertyId,
	sanitizeHTMLToDom,
	setIcon,
} from 'obsidian';
import type { TFile } from 'obsidian';
import Sortable from 'sortablejs';
import {
	COLOR_PALETTE,
	CSS_CLASSES,
	DATA_ATTRIBUTES,
	DEBOUNCE_DELAY,
	EMPTY_STATE_MESSAGES,
	SORTABLE_CONFIG,
	SORTABLE_GROUP,
	SWIMLANE_KEY_SEPARATOR,
	UNCATEGORIZED_LABEL,
} from './constants.ts';
import { QuickAddModal } from './quickAddModal.ts';
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

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isStringArrayRecord(value: unknown): value is Record<string, string[]> {
	return isRecord(value) && !Array.isArray(value) && Object.values(value).every(isStringArray);
}

export function isColumnOrders(value: unknown): value is Record<string, string[]> {
	return isStringArrayRecord(value);
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
		Object.values(value).every((v) => isRecord(v) && !Array.isArray(v) && Object.values(v).every(isStringArray))
	);
}

export function isCollapsedLanes(value: unknown): value is Record<string, string[]> {
	return isStringArrayRecord(value);
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
	private imagePropertyId: BasesPropertyId | null = null;
	private _columnSortables: Map<string, Sortable> = new Map();
	private _entryMap: Map<string, BasesEntry> = new Map();
	private columnSortable: Sortable | null = null;
	private swimlaneSortable: Sortable | null = null;
	private swimlaneColumnSortables: Sortable[] = [];
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
	 */
	private _lastOrderKey: string = '';
	private _lastWrapValue: boolean | null = null;
	private _lastCardTitlePropertyId: BasesPropertyId | null | undefined = undefined;
	private _lastImagePropertyId: BasesPropertyId | null | undefined = undefined;
	private _lastImageFit: string | undefined = undefined;
	private _lastImageAspectRatio: number | undefined = undefined;
	private _lastSwimlanePropertyId: BasesPropertyId | null | undefined = undefined;

	private _prefs: {
		columnOrder: string[];
		swimlaneOrder: string[];
		cardOrders: Record<string, string[]>;
		columnColors: Record<string, string>;
		collapsedLanes: Set<string>;
	} = {
		columnOrder: [],
		swimlaneOrder: [],
		cardOrders: {},
		columnColors: {}, // columnValue → colorName
		collapsedLanes: new Set(),
	};
	private _prefsPropertyId: BasesPropertyId | null = null;
	private _prefsSwimlanePropertyId: BasesPropertyId | null = null;

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
		this.swimlaneByPropertyId = this.config.getAsPropertyId('swimlaneByProperty');
		this.cardTitlePropertyId = this.config.getAsPropertyId('cardTitleProperty');
		this.imagePropertyId = this.config.getAsPropertyId('imageProperty');
	}

	/**
	 * Composite key used by `_prefs.cardOrders` to disambiguate card order across
	 * swimlanes. When swimlanes are inactive, returns the bare column value so
	 * existing flat-mode persistence continues to round-trip unchanged.
	 */
	private cardOrderKey(swimlaneValue: string | null, columnValue: string): string {
		return swimlaneValue === null ? columnValue : `${swimlaneValue}${SWIMLANE_KEY_SEPARATOR}${columnValue}`;
	}

	private swimlanePrefsKey(groupPropertyId: BasesPropertyId, swimlanePropertyId: BasesPropertyId): string {
		return `${groupPropertyId}${SWIMLANE_KEY_SEPARATOR}${swimlanePropertyId}`;
	}

	/**
	 * Load display preferences from config for the given propertyId.
	 * Called once when groupByPropertyId changes; subsequent renders reuse _prefs.
	 */
	private _loadPrefs(propertyId: BasesPropertyId, swimlanePropertyId: BasesPropertyId | null): void {
		this._prefsPropertyId = propertyId;
		this._prefsSwimlanePropertyId = swimlanePropertyId;
		const swimlaneScopedKey = swimlanePropertyId ? this.swimlanePrefsKey(propertyId, swimlanePropertyId) : null;

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
		const savedCardOrders = allCardOrders[swimlaneScopedKey ?? propertyId] ?? {};
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

		// Collapsed swimlanes — scoped by group+swimlane property; default = none
		// collapsed (lanes start fully expanded so all cards are visible).
		const rawCollapsed = this.config?.get('collapsedLanes');
		const allCollapsed = isCollapsedLanes(rawCollapsed) ? rawCollapsed : {};
		this._prefs.collapsedLanes = new Set(swimlaneScopedKey ? (allCollapsed[swimlaneScopedKey] ?? []) : []);

		// Swimlane order — scoped by group+swimlane property. Same shape as
		// columnOrders (Record<key, string[]>) so isColumnOrders is the appropriate guard.
		const rawSwimlaneOrders = this.config?.get('swimlaneOrders');
		const allSwimlaneOrders = isColumnOrders(rawSwimlaneOrders) ? rawSwimlaneOrders : {};
		this._prefs.swimlaneOrder =
			swimlaneScopedKey && allSwimlaneOrders[swimlaneScopedKey] ? [...allSwimlaneOrders[swimlaneScopedKey]] : [];
	}

	/**
	 * Write _prefs back to config. Called only on user actions (drag-drop,
	 * column remove, color change) — never during renders.
	 *
	 * Change guards skip config.set() when the value hasn't changed, preventing
	 * spurious onDataUpdated() triggers.
	 */
	private _persistConfigKey<T>(
		key: string,
		guard: (v: unknown) => v is Record<string, T>,
		newValue: T,
		storageKey: string | null = this._prefsPropertyId,
	): void {
		if (!storageKey) return;
		const raw = this.config?.get(key);
		const all: Record<string, T> = guard(raw) ? raw : {};
		if (JSON.stringify(all[storageKey]) !== JSON.stringify(newValue)) {
			this.config?.set(key, { ...all, [storageKey]: newValue });
		}
	}

	private _persistPrefs(): void {
		if (!this._prefsPropertyId) return;
		const swimlaneScopedKey = this._prefsSwimlanePropertyId
			? this.swimlanePrefsKey(this._prefsPropertyId, this._prefsSwimlanePropertyId)
			: null;

		this._persistConfigKey('columnOrders', isColumnOrders, this._prefs.columnOrder, this._prefsPropertyId);
		this._persistConfigKey(
			'cardOrders',
			isCardOrders,
			this._prefs.cardOrders,
			swimlaneScopedKey ?? this._prefsPropertyId,
		);
		this._persistConfigKey('columnColors', isColumnColors, this._prefs.columnColors, this._prefsPropertyId);

		if (swimlaneScopedKey) {
			this._persistConfigKey('swimlaneOrders', isColumnOrders, this._prefs.swimlaneOrder, swimlaneScopedKey);
			this._persistConfigKey(
				'collapsedLanes',
				isCollapsedLanes,
				Array.from(this._prefs.collapsedLanes),
				swimlaneScopedKey,
			);
		}
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

			// Swimlane on the same axis as the column group is meaningless — every
			// lane would contain a single populated column. Treat as unset.
			const swimlanePropertyId =
				this.swimlaneByPropertyId && this.swimlaneByPropertyId !== this.groupByPropertyId
					? this.swimlaneByPropertyId
					: null;

			// Reload prefs when either grouping axis changes.
			if (this.groupByPropertyId !== this._prefsPropertyId || swimlanePropertyId !== this._prefsSwimlanePropertyId) {
				this._loadPrefs(this.groupByPropertyId, swimlanePropertyId);
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

			// Group entries — 2D when swimlanes are active, 1D otherwise. The
			// column-axis preference logic (order, colors, new-value detection)
			// runs against the union of columns across all lanes, so a single
			// canonical column ordering is shared by every lane.
			const groupedByLane = swimlanePropertyId
				? this.groupEntriesBySwimlaneAndColumn(entries, swimlanePropertyId, this.groupByPropertyId)
				: null;
			const groupedEntries = groupedByLane
				? this.flattenLanes(groupedByLane)
				: this.groupEntriesByProperty(entries, this.groupByPropertyId);
			const sortActive = this.hasActiveSort();

			// Apply manual card order only when the Base itself is not sorted.
			// When sorting is active, Bases has already ordered `entries`.
			if (!sortActive && groupedByLane) {
				groupedByLane.forEach((columns, laneValue) => {
					columns.forEach((cellEntries, columnValue) => {
						const savedOrder = this._prefs.cardOrders[this.cardOrderKey(laneValue, columnValue)];
						if (savedOrder) {
							columns.set(columnValue, this.applyCardOrder(cellEntries, savedOrder));
						}
					});
				});
			} else if (!sortActive) {
				groupedEntries.forEach((columnEntries, value) => {
					const savedOrder = this._prefs.cardOrders[this.cardOrderKey(null, value)];
					if (savedOrder) {
						groupedEntries.set(value, this.applyCardOrder(columnEntries, savedOrder));
					}
				});
			}

			// Merge any newly-seen column values into prefs and persist eagerly.
			// This is the only place render() calls _persistPrefs(), and only when
			// new columns appear — not on every render pass.
			const liveValues = Array.from(groupedEntries.keys());
			const liveValueSet = new Set(liveValues);
			let shouldPersistColumnOrder = false;
			if (this._prefs.columnOrder.includes(UNCATEGORIZED_LABEL) && !liveValueSet.has(UNCATEGORIZED_LABEL)) {
				this._prefs.columnOrder = this._prefs.columnOrder.filter((value) => value !== UNCATEGORIZED_LABEL);
				shouldPersistColumnOrder = true;
			}
			const newValues = liveValues.filter((v) => !this._prefs.columnOrder.includes(v));
			if (newValues.length > 0) {
				const isInitialOrder = this._prefs.columnOrder.length === 0;
				// No prior order — sort alphabetically as the initial ordering
				this._prefs.columnOrder = isInitialOrder ? [...newValues].sort() : [...this._prefs.columnOrder, ...newValues];
				shouldPersistColumnOrder = true;
			}
			if (shouldPersistColumnOrder) {
				this._persistPrefs();
			}

			const orderedValues = this.getOrderedColumnValues(liveValues);

			const currentOrderKey = JSON.stringify(this.config?.getOrder() ?? []);
			const orderChanged = currentOrderKey !== this._lastOrderKey;
			this._lastOrderKey = currentOrderKey;

			const currentWrapValue = this.config?.get('wrapPropertyValues') === true;
			const wrapChanged = currentWrapValue !== this._lastWrapValue;
			this._lastWrapValue = currentWrapValue;

			const currentCardTitlePropertyId = this.cardTitlePropertyId;
			const cardTitleChanged = currentCardTitlePropertyId !== this._lastCardTitlePropertyId;
			this._lastCardTitlePropertyId = currentCardTitlePropertyId;

			const currentImagePropertyId = this.imagePropertyId;
			const imagePropertyChanged = currentImagePropertyId !== this._lastImagePropertyId;
			this._lastImagePropertyId = currentImagePropertyId;

			const currentImageFit = this.config?.get('imageFit') === 'contain' ? 'contain' : 'cover';
			const imageFitChanged = currentImageFit !== this._lastImageFit;
			this._lastImageFit = currentImageFit;

			const rawRatio = Number(this.config?.get('imageAspectRatio'));
			const currentImageAspectRatio = Number.isFinite(rawRatio) && rawRatio > 0 ? rawRatio : 0.5;
			const imageAspectRatioChanged = currentImageAspectRatio !== this._lastImageAspectRatio;
			this._lastImageAspectRatio = currentImageAspectRatio;

			const currentSwimlanePropertyId = swimlanePropertyId;
			const swimlanePropertyChanged = currentSwimlanePropertyId !== this._lastSwimlanePropertyId;
			this._lastSwimlanePropertyId = currentSwimlanePropertyId;

			const existingBoard = this.containerEl.querySelector<HTMLElement>(`.${CSS_CLASSES.BOARD}`);
			const optionsChanged =
				orderChanged ||
				wrapChanged ||
				cardTitleChanged ||
				imagePropertyChanged ||
				imageFitChanged ||
				imageAspectRatioChanged ||
				swimlanePropertyChanged;

			if (groupedByLane) {
				// Swimlane mode: full-rebuild on every render. The patch path is
				// only worth maintaining for the flat layout for now; lane×column
				// patching is a follow-up optimization.
				this.fullRebuildSwimlanes(orderedValues, groupedByLane);
			} else if (!existingBoard || this._prefsPropertyId !== this.groupByPropertyId || optionsChanged) {
				this.fullRebuild(orderedValues, groupedEntries);
			} else {
				this.patchBoard(existingBoard, orderedValues, groupedEntries);
			}
			this.reapplyActiveCard();
		} catch (error) {
			console.error('KanbanView error:', error);
		}
	}

	private destroySortables(): void {
		this._columnSortables.forEach((s) => s.destroy());
		this._columnSortables.clear();
		if (this.columnSortable) {
			this.columnSortable.destroy();
			this.columnSortable = null;
		}
		if (this.swimlaneSortable) {
			this.swimlaneSortable.destroy();
			this.swimlaneSortable = null;
		}
		this.swimlaneColumnSortables.forEach((s) => s.destroy());
		this.swimlaneColumnSortables = [];
	}

	private fullReset(): void {
		this.containerEl.empty();
		this.destroySortables();
		this._entryMap.clear();
	}

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

	/**
	 * Build a vertical stack of swimlanes, each containing the same column
	 * sequence. Empty (lane × column) cells render as empty bodies — same
	 * affordance as an empty saved column in flat mode.
	 *
	 * Sortable instances are attached per (lane × column) cell using a unique
	 * key. They share `SORTABLE_GROUP` so cards drag freely across lanes;
	 * `handleCardDrop` reads the destination lane from the closest ancestor
	 * `.obk-swimlane` and updates the swimlane property in addition to the
	 * column property.
	 */
	private fullRebuildSwimlanes(
		orderedColumnValues: string[],
		groupedByLane: Map<string, Map<string, BasesEntry[]>>,
	): void {
		this.containerEl.empty();
		this.destroySortables();

		const boardEl = this.containerEl.createDiv({ cls: `${CSS_CLASSES.BOARD} ${CSS_CLASSES.BOARD_WITH_SWIMLANES}` });

		const liveLaneValues = Array.from(groupedByLane.keys());

		// Merge any newly-seen lane values into prefs once, on first observation.
		// Mirrors the column-order init in render() — alphabetical for the
		// initial save, append for subsequent additions. Persisted eagerly so
		// the order survives a reload even before the user reorders manually.
		const newLaneValues = liveLaneValues.filter((v) => !this._prefs.swimlaneOrder.includes(v));
		if (newLaneValues.length > 0) {
			const isInitialOrder = this._prefs.swimlaneOrder.length === 0;
			if (isInitialOrder) {
				this._prefs.swimlaneOrder = [...newLaneValues].sort((a, b) => {
					if (a === UNCATEGORIZED_LABEL) return 1;
					if (b === UNCATEGORIZED_LABEL) return -1;
					return a.localeCompare(b);
				});
			} else {
				this._prefs.swimlaneOrder = [...this._prefs.swimlaneOrder, ...newLaneValues];
			}
			this._persistPrefs();
		}

		const orderedLanes = this.getOrderedSwimlaneValues(liveLaneValues);

		orderedLanes.forEach((laneValue) => {
			const laneEntries = groupedByLane.get(laneValue) ?? new Map<string, BasesEntry[]>();
			const laneEl = boardEl.createDiv({ cls: CSS_CLASSES.SWIMLANE });
			laneEl.setAttribute(DATA_ATTRIBUTES.SWIMLANE_VALUE, laneValue);
			const isCollapsed = this._prefs.collapsedLanes.has(laneValue);
			if (isCollapsed) laneEl.classList.add(CSS_CLASSES.SWIMLANE_COLLAPSED);

			const headerEl = laneEl.createDiv({ cls: CSS_CLASSES.SWIMLANE_HEADER });

			const dragHandle = headerEl.createDiv({ cls: CSS_CLASSES.SWIMLANE_DRAG_HANDLE });
			dragHandle.textContent = '⋮⋮';
			dragHandle.setAttribute('aria-label', `Drag to reorder lane: ${laneValue}`);

			headerEl.createSpan({ text: laneValue, cls: CSS_CLASSES.SWIMLANE_TITLE });
			const laneCount = orderedColumnValues.reduce((sum, col) => sum + (laneEntries.get(col)?.length ?? 0), 0);
			headerEl.createSpan({ text: `${laneCount}`, cls: CSS_CLASSES.SWIMLANE_COUNT });

			const toggleBtn = headerEl.createEl('button', {
				cls: CSS_CLASSES.SWIMLANE_TOGGLE,
				attr: { type: 'button' },
			});
			this.updateSwimlaneToggle(toggleBtn, isCollapsed);
			toggleBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.toggleSwimlaneCollapsed(laneValue, laneEl, toggleBtn);
			});

			const bodyEl = laneEl.createDiv({ cls: CSS_CLASSES.SWIMLANE_BODY });
			orderedColumnValues.forEach((columnValue) => {
				const columnEl = this.createColumn(columnValue, laneEntries.get(columnValue) || [], {
					showRemoveButton: false,
					swimlaneValue: laneValue,
				});
				bodyEl.appendChild(columnEl);
				const cardBody = columnEl.querySelector<HTMLElement>(
					`.${CSS_CLASSES.COLUMN_BODY}[${DATA_ATTRIBUTES.SORTABLE_CONTAINER}]`,
				);
				if (cardBody) {
					this.attachCardSortable(cardBody, this.cardOrderKey(laneValue, columnValue));
				}
			});
		});

		this.initializeSwimlaneSortable(boardEl);
		this.initializeSwimlaneColumnSortables(boardEl);
	}

	private initializeSwimlaneSortable(boardEl: HTMLElement): void {
		if (this.swimlaneSortable) {
			this.swimlaneSortable.destroy();
			this.swimlaneSortable = null;
		}

		this.swimlaneSortable = new Sortable(boardEl, {
			animation: SORTABLE_CONFIG.ANIMATION_DURATION,
			handle: `.${CSS_CLASSES.SWIMLANE_DRAG_HANDLE}`,
			draggable: `.${CSS_CLASSES.SWIMLANE}`,
			ghostClass: CSS_CLASSES.SWIMLANE_GHOST,
			dragClass: CSS_CLASSES.SWIMLANE_DRAGGING,
			onStart: () => {
				this._dragging = true;
			},
			onEnd: () => {
				this._dragging = false;
				this.handleSwimlaneDrop(boardEl);
			},
		});
	}

	private handleSwimlaneDrop(boardEl: HTMLElement): void {
		const lanes = boardEl.querySelectorAll(`.${CSS_CLASSES.SWIMLANE}`);
		const order = Array.from(lanes)
			.map((lane) => lane.getAttribute(DATA_ATTRIBUTES.SWIMLANE_VALUE))
			.filter((v): v is string => v !== null);
		this._prefs.swimlaneOrder = order;
		this._persistPrefs();
	}

	private initializeSwimlaneColumnSortables(boardEl: HTMLElement): void {
		this.swimlaneColumnSortables.forEach((s) => s.destroy());
		this.swimlaneColumnSortables = [];

		boardEl.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.SWIMLANE_BODY}`).forEach((bodyEl) => {
			const sortable = new Sortable(bodyEl, {
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
					this.handleSwimlaneColumnDrop(evt);
				},
			});
			this.swimlaneColumnSortables.push(sortable);
		});
	}

	private handleSwimlaneColumnDrop(evt: Sortable.SortableEvent): void {
		if (!this._prefsPropertyId || !(evt.to instanceof HTMLElement)) return;

		const order = Array.from(evt.to.children)
			.filter(
				(child): child is HTMLElement => child instanceof HTMLElement && child.classList.contains(CSS_CLASSES.COLUMN),
			)
			.map((col) => col.getAttribute(DATA_ATTRIBUTES.COLUMN_VALUE))
			.filter((v): v is string => v !== null);

		if (order.length === 0) return;

		this._prefs.columnOrder = order;
		this._persistPrefs();
		this.render();
	}

	private patchBoard(boardEl: HTMLElement, orderedValues: string[], groupedEntries: Map<string, BasesEntry[]>): void {
		// Index existing column elements by their value
		const existingColumns = new Map<string, HTMLElement>();
		boardEl.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.COLUMN}`).forEach((col) => {
			const val = col.getAttribute(DATA_ATTRIBUTES.COLUMN_VALUE);
			if (val !== null) existingColumns.set(val, col);
		});

		// Card rebuilds in patchColumnCards and column re-parenting below can clamp
		// scrollTop on column bodies. Capture offsets up-front and restore after.
		const scrollPositions = new Map<string, number>();
		existingColumns.forEach((colEl, value) => {
			const body = colEl.querySelector<HTMLElement>(`.${CSS_CLASSES.COLUMN_BODY}`);
			if (body) scrollPositions.set(value, body.scrollTop);
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

		// Defer to the next frame so layout has finalized before we restore.
		// Synchronous `scrollTop = top` can be clamped down when a transient layout
		// pass reports a smaller scrollHeight (e.g. image-backed cards whose media
		// has not laid out yet), and that clamp sticks once scrollHeight grows back.
		requestAnimationFrame(() => {
			scrollPositions.forEach((top, value) => {
				const colEl = existingColumns.get(value);
				const body = colEl?.querySelector<HTMLElement>(`.${CSS_CLASSES.COLUMN_BODY}`);
				if (body) body.scrollTop = top;
			});
		});
	}

	private patchColumnCards(columnEl: HTMLElement, newEntries: BasesEntry[]): void {
		const body = columnEl.querySelector<HTMLElement>(`.${CSS_CLASSES.COLUMN_BODY}`);
		if (!body) return;

		// Update column count
		const countEl = columnEl.querySelector(`.${CSS_CLASSES.COLUMN_COUNT}`);
		if (countEl) countEl.textContent = `${newEntries.length}`;

		// Sync remove button: show only when column has no entries
		const headerEl = columnEl.querySelector<HTMLElement>(`.${CSS_CLASSES.COLUMN_HEADER}`);
		const columnValue = columnEl.getAttribute(DATA_ATTRIBUTES.COLUMN_VALUE);
		const existingRemoveBtn = headerEl?.querySelector(`.${CSS_CLASSES.COLUMN_REMOVE_BTN}`) ?? null;
		if (headerEl && newEntries.length === 0 && !existingRemoveBtn && columnValue) {
			headerEl.appendChild(this.createRemoveButton(columnValue, columnEl));
		} else if (newEntries.length > 0 && existingRemoveBtn) {
			existingRemoveBtn.remove();
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

	/**
	 * Two-axis bucketing: swimlane → column → entries. Entries that fail to read
	 * either property fall through to UNCATEGORIZED_LABEL on the offending axis.
	 */
	private groupEntriesBySwimlaneAndColumn(
		entries: BasesEntry[],
		swimlanePropertyId: BasesPropertyId,
		columnPropertyId: BasesPropertyId,
	): Map<string, Map<string, BasesEntry[]>> {
		const grouped = new Map<string, Map<string, BasesEntry[]>>();

		const ensureLane = (laneKey: string): Map<string, BasesEntry[]> => {
			const existing = grouped.get(laneKey);
			if (existing) return existing;
			const lane = new Map<string, BasesEntry[]>();
			grouped.set(laneKey, lane);
			return lane;
		};

		entries.forEach((entry) => {
			let laneKey = UNCATEGORIZED_LABEL;
			let columnKey = UNCATEGORIZED_LABEL;
			try {
				laneKey = normalizePropertyValue(entry.getValue(swimlanePropertyId));
			} catch (error) {
				console.warn('Error reading swimlane property for entry:', entry.file.path, error);
			}
			try {
				columnKey = normalizePropertyValue(entry.getValue(columnPropertyId));
			} catch (error) {
				console.warn('Error reading column property for entry:', entry.file.path, error);
			}
			const lane = ensureLane(laneKey);
			ensureGroupExists(lane, columnKey).push(entry);
		});

		return grouped;
	}

	private toggleSwimlaneCollapsed(laneValue: string, laneEl: HTMLElement, toggleBtn: HTMLElement): void {
		const willCollapse = !this._prefs.collapsedLanes.has(laneValue);
		if (willCollapse) this._prefs.collapsedLanes.add(laneValue);
		else this._prefs.collapsedLanes.delete(laneValue);
		laneEl.classList.toggle(CSS_CLASSES.SWIMLANE_COLLAPSED, willCollapse);
		this.updateSwimlaneToggle(toggleBtn, willCollapse);
		this._persistPrefs();
	}

	private updateSwimlaneToggle(toggleBtn: HTMLElement, isCollapsed: boolean): void {
		const label = isCollapsed ? 'Expand lane' : 'Collapse lane';
		toggleBtn.empty();
		setIcon(toggleBtn, isCollapsed ? 'chevron-right' : 'chevron-down');
		toggleBtn.setAttribute('aria-label', label);
		toggleBtn.setAttribute('title', label);
		toggleBtn.setAttribute('aria-expanded', String(!isCollapsed));
	}

	/**
	 * Order swimlane values: prefer the saved order if present (drag-reorder
	 * persists into _prefs.swimlaneOrder); otherwise sort alphabetically with
	 * UNCATEGORIZED_LABEL pinned last. New lanes (not yet in saved order) are
	 * appended at the end.
	 */
	private getOrderedSwimlaneValues(liveValues: string[]): string[] {
		if (!this._prefs.swimlaneOrder.length) {
			return [...liveValues].sort((a, b) => {
				if (a === UNCATEGORIZED_LABEL) return 1;
				if (b === UNCATEGORIZED_LABEL) return -1;
				return a.localeCompare(b);
			});
		}
		const liveSet = new Set(liveValues);
		const ordered = this._prefs.swimlaneOrder.filter((v) => liveSet.has(v));
		const orderedSet = new Set(ordered);
		const newOnes = liveValues.filter((v) => !orderedSet.has(v));
		return [...ordered, ...newOnes];
	}

	/**
	 * Flatten a lane→column→entries map into the column→entries shape the
	 * single-axis render path expects, preserving union of column values across
	 * all lanes so empty cells still render as empty bodies.
	 */
	private flattenLanes(byLane: Map<string, Map<string, BasesEntry[]>>): Map<string, BasesEntry[]> {
		const flat = new Map<string, BasesEntry[]>();
		byLane.forEach((columns) => {
			columns.forEach((entries, columnValue) => {
				const existing = flat.get(columnValue);
				if (existing) existing.push(...entries);
				else flat.set(columnValue, [...entries]);
			});
		});
		return flat;
	}

	private createColumn(
		value: string,
		entries: BasesEntry[],
		options: { showRemoveButton?: boolean; swimlaneValue?: string | null } = {},
	): HTMLElement {
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
		headerEl.appendChild(this.createAddButton(value, options.swimlaneValue ?? null));

		// Remove button — only shown for flat-mode empty columns.
		if (entries.length === 0 && options.showRemoveButton !== false) {
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

	/**
	 * Render a cover image for the card using the configured image property.
	 * Accepts wikilinks (`[[cover.png]]`), legacy markdown embeds (`![[cover.png]]`),
	 * and external URLs (`http(s)://…`). Returns false if nothing renderable was found
	 * so the caller can discard an empty slot.
	 */
	private renderCardCover(coverEl: HTMLElement, entry: BasesEntry, filePath: string): boolean {
		if (!this.imagePropertyId) return false;
		const value = entry.getValue(this.imagePropertyId);
		if (value === null || value instanceof NullValue) return false;

		const raw = value.toString().trim();
		if (!raw || raw === 'null') return false;

		if (/^https?:\/\//i.test(raw)) {
			coverEl.createEl('img', { attr: { src: raw, alt: '' } });
			return true;
		}

		// Strip legacy `!` embed prefix and surrounding wikilink brackets.
		let linkText = raw.replace(/^!\s*/, '');
		const wikiMatch = linkText.match(/^\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]$/);
		if (wikiMatch) linkText = wikiMatch[1];
		linkText = linkText.trim();
		if (!linkText) return false;

		const app = this.app;
		if (!app) return false;
		const file = app.metadataCache.getFirstLinkpathDest(linkText, filePath);
		if (!file) return false;

		coverEl.createEl('img', { attr: { src: app.vault.getResourcePath(file), alt: '' } });
		return true;
	}

	private createCard(entry: BasesEntry): HTMLElement {
		const cardEl = document.createElement('div');
		cardEl.className = CSS_CLASSES.CARD;
		const filePath = entry.file.path;
		cardEl.setAttribute(DATA_ATTRIBUTES.ENTRY_PATH, filePath);

		if (this.imagePropertyId) {
			const coverEl = cardEl.createDiv({ cls: CSS_CLASSES.CARD_COVER });
			const fit = this.config?.get('imageFit') === 'contain' ? 'contain' : 'cover';
			coverEl.classList.add(fit === 'contain' ? CSS_CLASSES.CARD_COVER_FIT_CONTAIN : CSS_CLASSES.CARD_COVER_FIT_COVER);
			const rawRatio = Number(this.config?.get('imageAspectRatio'));
			const ratio = Number.isFinite(rawRatio) && rawRatio > 0 ? rawRatio : 0.5;
			coverEl.style.aspectRatio = `1 / ${ratio}`;
			const rendered = this.renderCardCover(coverEl, entry, filePath);
			if (!rendered) coverEl.remove();
		}

		const titleEl = cardEl.createDiv({ cls: CSS_CLASSES.CARD_TITLE });
		this.renderCardTitle(titleEl, entry, filePath);

		const order = this.config?.getOrder() ?? [];
		const shouldWrap = this.config?.get('wrapPropertyValues') === true;

		for (const propertyId of order) {
			if (propertyId === this.groupByPropertyId) continue;
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
				void this.app.workspace.openLinkText(filePath, '', Keymap.isModEvent(e));
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

	private createAddButton(columnValue: string, swimlaneValue: string | null): HTMLElement {
		const btn = document.createElement('div');
		btn.className = CSS_CLASSES.COLUMN_ADD_BTN;
		btn.setAttribute(
			'aria-label',
			swimlaneValue
				? `Add card to column: ${columnValue} in lane: ${swimlaneValue}`
				: `Add card to column: ${columnValue}`,
		);
		btn.setAttribute('role', 'button');
		btn.setAttribute('tabindex', '0');
		setIcon(btn, 'plus');
		btn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.openQuickAdd(columnValue, swimlaneValue);
		});
		btn.addEventListener('keydown', (e) => {
			if (e.key !== 'Enter' && e.key !== ' ') return;
			e.preventDefault();
			e.stopPropagation();
			this.openQuickAdd(columnValue, swimlaneValue);
		});
		return btn;
	}

	private openQuickAdd(columnValue: string, swimlaneValue: string | null): void {
		if (!this.app) return;
		new QuickAddModal(this.app, {
			columnValue,
			swimlaneValue,
			onSubmit: (title) => this.createQuickAddCard(title, columnValue, swimlaneValue),
		}).open();
	}

	private getWritableFrontmatterPropertyName(propertyId: BasesPropertyId | null): string | null {
		if (!propertyId) return null;
		const parsed = parsePropertyId(propertyId);
		if (parsed.type !== 'note') return null;
		return parsed.name || null;
	}

	private getQuickAddFolder(): string | null {
		const rawFolder = this.config?.get('quickAddFolder');
		if (typeof rawFolder !== 'string') return null;
		const folder = normalizePath(rawFolder.trim());
		return folder ? folder : null;
	}

	private sanitizeBaseFileName(title: string): string {
		return title
			.trim()
			.replace(/\.md$/i, '')
			.replace(/[\\/:*?"<>|]/g, '-')
			.replace(/\s+/g, ' ')
			.replace(/[.\s]+$/g, '')
			.trim();
	}

	private async createQuickAddCard(title: string, columnValue: string, swimlaneValue: string | null): Promise<void> {
		const baseFileName = this.sanitizeBaseFileName(title);
		if (!baseFileName) {
			new Notice('Enter a card title.');
			return;
		}

		const columnPropertyName = this.getWritableFrontmatterPropertyName(this._prefsPropertyId);
		if (!columnPropertyName) {
			new Notice('Quick add needs a writable note property for columns.');
			return;
		}

		const swimlanePropertyName = swimlaneValue
			? this.getWritableFrontmatterPropertyName(this._prefsSwimlanePropertyId)
			: null;
		if (swimlaneValue && !swimlanePropertyName) {
			new Notice('Quick add needs a writable note property for swimlanes.');
			return;
		}

		const quickAddFolder = this.getQuickAddFolder();
		if (quickAddFolder && !this.app?.vault.getFolderByPath(quickAddFolder)) {
			new Notice(`Quick add folder not found: ${quickAddFolder}`);
			return;
		}
		const createdFilePaths =
			quickAddFolder && this.app?.vault ? new Set(this.app.vault.getMarkdownFiles().map((file) => file.path)) : null;

		const setFrontmatter = (frontmatter: Record<string, unknown>): void => {
			if (columnValue === UNCATEGORIZED_LABEL) {
				delete frontmatter[columnPropertyName];
			} else {
				frontmatter[columnPropertyName] = columnValue;
			}

			if (!swimlaneValue || !swimlanePropertyName) return;
			if (swimlaneValue === UNCATEGORIZED_LABEL) {
				delete frontmatter[swimlanePropertyName];
			} else {
				frontmatter[swimlanePropertyName] = swimlaneValue;
			}
		};

		try {
			await this.createFileForView(baseFileName, setFrontmatter);
			if (quickAddFolder && createdFilePaths) {
				await this.moveCreatedCardToFolder(createdFilePaths, baseFileName, quickAddFolder);
			}
			this.closeNativeNewItemPopover();
		} catch (error) {
			console.error('Error creating kanban card:', error);
			new Notice('Could not create card.');
		}
	}

	private closeNativeNewItemPopover(): void {
		const closePopovers = () => {
			const popovers = Array.from(document.querySelectorAll<HTMLElement>('.bases-new-item-popover'));
			if (popovers.length === 0) return;

			document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
			document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
			popovers.forEach((popover) => {
				popover.remove();
			});
		};

		closePopovers();
		globalThis.requestAnimationFrame(closePopovers);
		for (const delay of [50, 250, 1000]) {
			globalThis.setTimeout(closePopovers, delay);
		}
	}

	private getCreatedMarkdownFile(previousPaths: Set<string>, baseFileName: string): TFile | null {
		if (!this.app?.vault) return null;

		const createdFiles = this.app.vault.getMarkdownFiles().filter((file) => !previousPaths.has(file.path));
		if (createdFiles.length === 0) return null;

		const preferredBasename = baseFileName.split('/').pop() ?? baseFileName;
		return createdFiles.find((file) => file.basename === preferredBasename) ?? createdFiles[0] ?? null;
	}

	private getAvailablePath(folder: string, fileName: string): string {
		const extension = fileName.toLowerCase().endsWith('.md') ? '.md' : '';
		const basename = extension ? fileName.slice(0, -extension.length) : fileName;
		let candidate = normalizePath(`${folder}/${extension ? fileName : `${fileName}.md`}`);
		let counter = 1;

		while (this.app?.vault.getAbstractFileByPath(candidate)) {
			candidate = normalizePath(`${folder}/${basename} ${counter}.md`);
			counter++;
		}

		return candidate;
	}

	private async moveCreatedCardToFolder(
		previousPaths: Set<string>,
		baseFileName: string,
		folder: string,
	): Promise<void> {
		if (!this.app?.vault || !this.app.fileManager) return;

		const targetFolder = this.app.vault.getFolderByPath(folder);
		if (!targetFolder) {
			new Notice(`Quick add folder not found: ${folder}`);
			return;
		}

		const createdFile = this.getCreatedMarkdownFile(previousPaths, baseFileName);
		if (!createdFile) {
			new Notice(`Created card, but could not move it to ${folder}.`);
			return;
		}

		const targetPath = this.getAvailablePath(folder, createdFile.name);
		if (targetPath === createdFile.path) return;

		await this.app.fileManager.renameFile(createdFile, targetPath);
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

	private detachColumn(value: string, colEl: HTMLElement): void {
		const sortable = this._columnSortables.get(value);
		if (sortable) {
			sortable.destroy();
			this._columnSortables.delete(value);
		}
		colEl.remove();
	}

	private removeColumn(value: string, columnEl: HTMLElement): void {
		if (!this._prefsPropertyId) return;
		this._prefs.columnOrder = this._prefs.columnOrder.filter((v) => v !== value);
		this._persistPrefs();
		this.detachColumn(value, columnEl);
	}

	private attachCardSortable(body: HTMLElement, value: string): void {
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
		this._columnSortables.set(value, sortable);
	}

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

		// Resolve swimlane axis (if active) from the dragged card's surrounding lanes
		const swimlaneSelector = `.${CSS_CLASSES.SWIMLANE}`;
		const oldLaneEl = evt.from.closest(swimlaneSelector);
		const newLaneEl = evt.to.closest(swimlaneSelector);
		const swimlaneActive = newLaneEl instanceof HTMLElement;
		const oldLaneValue = oldLaneEl instanceof HTMLElement ? oldLaneEl.getAttribute(DATA_ATTRIBUTES.SWIMLANE_VALUE) : null;
		const newLaneValue = swimlaneActive ? newLaneEl.getAttribute(DATA_ATTRIBUTES.SWIMLANE_VALUE) : null;

		// Helper: read card paths from a column body element
		const getColumnPaths = (bodyEl: Element): string[] =>
			Array.from(bodyEl.querySelectorAll(`.${CSS_CLASSES.CARD}`))
				.map((c) => (c instanceof HTMLElement ? c.getAttribute(DATA_ATTRIBUTES.ENTRY_PATH) : null))
				.filter((p): p is string => p !== null);

		const oldKey = this.cardOrderKey(oldLaneValue, oldColumnValue ?? '');
		const newKey = this.cardOrderKey(newLaneValue, newColumnValue);
		const sortActive = this.hasActiveSort();

		// Same cell reorder: update prefs and persist
		if (oldLaneValue === newLaneValue && oldColumnValue === newColumnValue) {
			if (sortActive) {
				this.render();
				return;
			}
			this._prefs.cardOrders[newKey] = getColumnPaths(evt.to);
			this._persistPrefs();
			return;
		}

		// Cross-cell drop: capture DOM order for both source and destination
		if (!sortActive) {
			if (oldColumnEl instanceof HTMLElement && oldColumnValue) {
				const oldBody = oldColumnEl.querySelector(`.${CSS_CLASSES.COLUMN_BODY}`);
				if (oldBody) this._prefs.cardOrders[oldKey] = getColumnPaths(oldBody);
			}
			this._prefs.cardOrders[newKey] = getColumnPaths(evt.to);
			this._persistPrefs();
		}

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
			const columnValueToSet = newColumnValue === UNCATEGORIZED_LABEL ? '' : newColumnValue;
			const columnPropertyName = parsePropertyId(this._prefsPropertyId).name;

			const swimlanePropertyId = swimlaneActive ? this._prefsSwimlanePropertyId : null;
			const swimlaneCrossed =
				swimlaneActive && swimlanePropertyId !== null && newLaneValue !== null && oldLaneValue !== newLaneValue;
			const swimlanePropertyName = swimlaneCrossed ? parsePropertyId(swimlanePropertyId).name : null;
			const swimlaneValueToSet = swimlaneCrossed && newLaneValue !== UNCATEGORIZED_LABEL ? newLaneValue : '';

			await this.app.fileManager.processFrontMatter(entry.file, (frontmatter: Record<string, unknown>) => {
				if (columnValueToSet === '') {
					delete frontmatter[columnPropertyName];
				} else {
					frontmatter[columnPropertyName] = columnValueToSet;
				}
				if (swimlanePropertyName) {
					if (swimlaneValueToSet === '') {
						delete frontmatter[swimlanePropertyName];
					} else {
						frontmatter[swimlanePropertyName] = swimlaneValueToSet;
					}
				}
			});
		} catch (error) {
			console.error('Error updating entry property:', error);
			this.render();
		}
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

	private hasActiveSort(): boolean {
		const sortConfig = this.config?.getSort();
		if (Array.isArray(sortConfig)) return sortConfig.length > 0;
		if (!sortConfig || typeof sortConfig !== 'object') return Boolean(sortConfig);
		return Object.keys(sortConfig).length > 0;
	}

	private getOrderedColumnValues(liveValues: string[]): string[] {
		if (!this._prefs.columnOrder.length) return liveValues.sort();
		// Include all saved columns (even empty ones); append any new live values.
		const newValues = liveValues.filter((v) => !this._prefs.columnOrder.includes(v));
		return [...this._prefs.columnOrder, ...newValues];
	}

	private applyCardOrder(entries: BasesEntry[], savedOrder: string[]): BasesEntry[] {
		const entryMap = new Map(entries.map((e) => [e.file.path, e]));
		const ordered = savedOrder.map((p) => entryMap.get(p)).filter((e): e is BasesEntry => e !== undefined);
		const unsaved = entries.filter((e) => !savedOrder.includes(e.file.path));
		return [...ordered, ...unsaved];
	}

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

	private handleColumnDrop(evt: Sortable.SortableEvent): void {
		if (!this._prefsPropertyId) return;

		const columns = this.containerEl.querySelectorAll(`.${CSS_CLASSES.COLUMN}`);
		const order = Array.from(columns)
			.map((col) => col.getAttribute(DATA_ATTRIBUTES.COLUMN_VALUE))
			.filter((v): v is string => v !== null);

		this._prefs.columnOrder = order;
		this._persistPrefs();
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
				placeholder: 'Optional: horizontal grouping',
			},
			{
				displayName: 'New card folder',
				type: 'folder',
				key: 'quickAddFolder',
				placeholder: 'Default: base file folder',
			},
			{
				displayName: 'Card title property',
				type: 'property',
				key: 'cardTitleProperty',
				placeholder: 'Default: file name',
			},
			{
				displayName: 'Image property',
				type: 'property',
				key: 'imageProperty',
				placeholder: 'Optional: image link property',
			},
			{
				displayName: 'Image fit',
				type: 'dropdown',
				key: 'imageFit',
				default: 'cover',
				options: { cover: 'Cover', contain: 'Contain' },
			},
			{
				displayName: 'Image aspect ratio',
				type: 'slider',
				key: 'imageAspectRatio',
				default: 0.5,
				min: 0.25,
				max: 2.5,
				step: 0.05,
			},
			{
				displayName: 'Wrap property values',
				type: 'toggle',
				key: 'wrapPropertyValues',
			},
		];
	}
}
