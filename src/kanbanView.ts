import type { BasesEntry, BasesPropertyId, HoverPopover, QueryController, ViewOption } from 'obsidian';
import { BasesView, Keymap, Notice, normalizePath, parsePropertyId } from 'obsidian';
import {
	createCard as createCardEl,
	computeCardFingerprint,
	type CardRenderCtx,
	type CardCallbacks,
} from './components/card.ts';
import {
	createAddButton as createAddButtonEl,
	createQuickAddCard as createQuickAddCardEl,
	closeNativeNewItemPopover as closeNativeNewItemPopoverEl,
	type QuickAddCtx,
	type QuickAddCallbacks,
} from './components/quickAdd.ts';
import {
	applyColumnColor as applyColumnColorEl,
	createColumn as createColumnEl,
	patchColumnCards as patchColumnCardsEl,
	type ColumnRenderCtx,
	type ColumnCallbacks,
} from './components/column.ts';
import {
	buildSwimlaneElement as buildSwimlaneElementEl,
	updateSwimlaneToggle as updateSwimlaneToggleEl,
	sortSwimlaneValues,
	getOrderedSwimlaneValues as getOrderedSwimlaneValuesEl,
	type RowRenderCtx,
	type RowCallbacks,
} from './components/row.ts';
import type { TFile } from 'obsidian';
import Sortable from 'sortablejs';
import {
	COLOR_PALETTE,
	CSS_CLASSES,
	DATA_ATTRIBUTES,
	DEBOUNCE_DELAY,
	EMPTY_STATE_MESSAGES,
	HOVER_LINK_SOURCE_ID,
	SORTABLE_CONFIG,
	SORTABLE_GROUP,
	SORTED_CARD_ORDER_NOTICE,
	SWIMLANE_KEY_SEPARATOR,
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

export class KanbanView extends BasesView {
	type = 'kanban-view';
	hoverPopover: HoverPopover | null = null;

	scrollEl: HTMLElement;
	containerEl: HTMLElement;
	private legacyData: LegacyData | null;
	private groupByPropertyId: BasesPropertyId | null = null;
	private swimlaneByPropertyId: BasesPropertyId | null = null;
	private cardTitlePropertyId: BasesPropertyId | null = null;
	private imagePropertyId: BasesPropertyId | null = null;
	private _columnSortables: Map<string, Sortable> = new Map();
	private _entryMap: Map<string, BasesEntry> = new Map();
	private swimlaneSortable: Sortable | null = null;
	private swimlaneColumnSortables: Map<string | null, Sortable> = new Map();
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
	private _lastQuickAddFolder: string | null | undefined = undefined;
	private _cardFingerprints: Map<string, string> = new Map();
	private _deferredSortableListeners: Map<string, { el: HTMLElement; handler: () => void }> = new Map();

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
				const sourcePath = cardEl.instanceOf(HTMLElement) ? (cardEl.getAttribute(DATA_ATTRIBUTES.ENTRY_PATH) ?? '') : '';
				void this.app.workspace.openLinkText(href, sourcePath, Keymap.isModEvent(evt));
			}
		});

		// Middle-click on internal links inside cards opens the linked note in a
		// background tab — same convention as middle-clicking the card itself.
		this.containerEl.on('auxclick', 'a.internal-link', (evt, linkEl) => {
			if (!evt.instanceOf(MouseEvent) || evt.button !== 1) return;
			evt.preventDefault();
			const href = linkEl.getAttribute('data-href') || linkEl.getAttribute('href');
			if (!href || !this.app) return;
			const cardEl = linkEl.closest(`[${DATA_ATTRIBUTES.ENTRY_PATH}]`);
			const sourcePath = cardEl.instanceOf(HTMLElement) ? (cardEl.getAttribute(DATA_ATTRIBUTES.ENTRY_PATH) ?? '') : '';
			const file = this.app.metadataCache.getFirstLinkpathDest(href, sourcePath);
			if (file) this.openInBackgroundTab(file);
		});

		this.containerEl.on('mouseover', 'a.internal-link', (evt, linkEl) => {
			if (!evt.instanceOf(MouseEvent)) return;
			const href = linkEl.getAttribute('data-href') || linkEl.getAttribute('href');
			if (!href) return;
			const cardEl = linkEl.closest(`[${DATA_ATTRIBUTES.ENTRY_PATH}]`);
			const sourcePath = cardEl.instanceOf(HTMLElement) ? (cardEl.getAttribute(DATA_ATTRIBUTES.ENTRY_PATH) ?? '') : '';
			this.triggerHoverPreview(href, sourcePath, evt, linkEl);
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

	private triggerHoverPreview(linktext: string, sourcePath: string, event: MouseEvent, targetEl: HTMLElement): void {
		this.app?.workspace.trigger('hover-link', {
			event,
			source: HOVER_LINK_SOURCE_ID,
			hoverParent: this,
			targetEl,
			linktext,
			sourcePath,
		});
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
			this.config?.set('columnOrders', {
				...allOrders,
				[propertyId]: legacyOrder,
			});
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
			this.config?.set('columnColors', {
				...allColors,
				[propertyId]: legacyColors,
			});
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
			const groupChanged = this.groupByPropertyId !== this._prefsPropertyId;
			if (groupChanged || swimlanePropertyId !== this._prefsSwimlanePropertyId) {
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

			const currentQuickAddFolder = this.getQuickAddFolder();
			const quickAddFolderChanged = currentQuickAddFolder !== this._lastQuickAddFolder;
			this._lastQuickAddFolder = currentQuickAddFolder;

			const existingBoard = this.containerEl.querySelector<HTMLElement>(`.${CSS_CLASSES.BOARD}`);
			const optionsChanged =
				orderChanged ||
				wrapChanged ||
				cardTitleChanged ||
				imagePropertyChanged ||
				imageFitChanged ||
				imageAspectRatioChanged ||
				swimlanePropertyChanged ||
				quickAddFolderChanged;

			const lanes = new Map<string | null, Map<string, BasesEntry[]>>();
			if (groupedByLane) {
				groupedByLane.forEach((v, k) => lanes.set(k, v));
			} else {
				lanes.set(null, groupedEntries);
			}
			const hasSwimlanes = groupedByLane !== null;
			const existingIsSwimlane = existingBoard?.classList.contains(CSS_CLASSES.BOARD_WITH_SWIMLANES) ?? false;
			const modeChanged = hasSwimlanes !== existingIsSwimlane;

			if (!existingBoard || modeChanged || groupChanged || optionsChanged) {
				this.fullRebuild(orderedValues, lanes, hasSwimlanes);
			} else {
				this.patchBoard(orderedValues, lanes, hasSwimlanes);
			}
			this.reapplyActiveCard();
		} catch (error) {
			console.error('KanbanView error:', error);
		}
	}

	private destroySortables(): void {
		this._columnSortables.forEach((s) => s.destroy());
		this._columnSortables.clear();
		if (this.swimlaneSortable) {
			this.swimlaneSortable.destroy();
			this.swimlaneSortable = null;
		}
		this.swimlaneColumnSortables.forEach((s) => s.destroy());
		this.swimlaneColumnSortables.clear();
		this._deferredSortableListeners.forEach(({ el, handler }) => {
			el.removeEventListener('pointerdown', handler);
		});
		this._deferredSortableListeners.clear();
	}

	private fullReset(): void {
		this.containerEl.empty();
		this.destroySortables();
		this._entryMap.clear();
		this._cardFingerprints.clear();
	}

	private fullRebuild(
		orderedColumnValues: string[],
		lanes: Map<string | null, Map<string, BasesEntry[]>>,
		hasSwimlanes: boolean,
	): void {
		this.containerEl.empty();
		this.containerEl.classList.toggle(CSS_CLASSES.VIEW_CONTAINER_WITH_SWIMLANES, hasSwimlanes);
		this.destroySortables();
		const boardEl = this.containerEl.createDiv({
			cls: hasSwimlanes ? `${CSS_CLASSES.BOARD} ${CSS_CLASSES.BOARD_WITH_SWIMLANES}` : CSS_CLASSES.BOARD,
		});

		if (hasSwimlanes) {
			const liveLaneValues = [...lanes.keys()].filter((k): k is string => k !== null);
			// Merge any newly-seen lane values into prefs once, on first observation.
			// Mirrors the column-order init in render() — alphabetical for the
			// initial save, append for subsequent additions. Persisted eagerly so
			// the order survives a reload even before the user reorders manually.
			const newLaneValues = liveLaneValues.filter((v) => !this._prefs.swimlaneOrder.includes(v));
			if (newLaneValues.length > 0) {
				const isInitialOrder = this._prefs.swimlaneOrder.length === 0;
				if (isInitialOrder) {
					this._prefs.swimlaneOrder = this._sortSwimlaneValues(newLaneValues);
				} else {
					this._prefs.swimlaneOrder = [...this._prefs.swimlaneOrder, ...newLaneValues];
				}
				this._persistPrefs();
			}

			const orderedLanes = this.getOrderedSwimlaneValues(liveLaneValues);
			orderedLanes.forEach((laneValue) => {
				const laneEntries = lanes.get(laneValue) ?? new Map<string, BasesEntry[]>();
				const laneEl = this._buildSwimlaneElement(laneValue, laneEntries, orderedColumnValues);
				boardEl.appendChild(laneEl);
				const bodyEl = laneEl.querySelector<HTMLElement>(`.${CSS_CLASSES.SWIMLANE_BODY}`);
				if (bodyEl) this.swimlaneColumnSortables.set(laneValue, this._createColumnSortable(bodyEl));
			});

			this.initializeSwimlaneSortable(boardEl);
		} else {
			const colEntries = lanes.get(null) ?? new Map<string, BasesEntry[]>();
			orderedColumnValues.forEach((colValue) => {
				const colEl = this.createColumn(colValue, colEntries.get(colValue) ?? []);
				boardEl.appendChild(colEl);
				const cardBody = colEl.querySelector<HTMLElement>(
					`.${CSS_CLASSES.COLUMN_BODY}[${DATA_ATTRIBUTES.SORTABLE_CONTAINER}]`,
				);
				if (cardBody) this.attachCardSortable(cardBody, this.cardOrderKey(null, colValue));
			});
			this.swimlaneColumnSortables.set(null, this._createColumnSortable(boardEl));
		}
	}

	private _buildRowCtx(): RowRenderCtx {
		return {
			...this._buildColumnCtx(),
			collapsedLanes: this._prefs.collapsedLanes,
		};
	}

	private _buildRowCallbacks(): RowCallbacks {
		return {
			...this._buildColumnCallbacks(),
			onToggleCollapsed: (laneVal, laneEl, toggleBtn) => this.toggleSwimlaneCollapsed(laneVal, laneEl, toggleBtn),
			attachCardSortable: (body, key) => this.attachCardSortable(body, key),
			cardOrderKey: (laneVal, colVal) => this.cardOrderKey(laneVal, colVal),
		};
	}

	private _buildSwimlaneElement(
		laneValue: string,
		laneEntries: Map<string, BasesEntry[]>,
		orderedColumnValues: string[],
	): HTMLElement {
		return buildSwimlaneElementEl(
			laneValue,
			laneEntries,
			orderedColumnValues,
			this._buildRowCtx(),
			this._buildRowCallbacks(),
		);
	}

	private _createColumnSortable(containerEl: HTMLElement): Sortable {
		return new Sortable(containerEl, {
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
				try {
					this.handleSwimlaneColumnDrop(evt);
				} catch (error) {
					console.error('KanbanView: error handling column drop', error);
				}
			},
		});
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

	private handleSwimlaneColumnDrop(evt: Sortable.SortableEvent): void {
		if (!this._prefsPropertyId || !evt.to.instanceOf(HTMLElement)) return;

		const order = Array.from(evt.to.children)
			.filter(
				(child): child is HTMLElement => child.instanceOf(HTMLElement) && child.classList.contains(CSS_CLASSES.COLUMN),
			)
			.map((col) => col.getAttribute(DATA_ATTRIBUTES.COLUMN_VALUE))
			.filter((v): v is string => v !== null);

		if (order.length === 0) return;

		this._prefs.columnOrder = order;
		this._persistPrefs();
		this.render();
	}

	private patchBoard(
		orderedColumnValues: string[],
		lanes: Map<string | null, Map<string, BasesEntry[]>>,
		hasSwimlanes: boolean,
	): void {
		const boardEl = this.containerEl.querySelector<HTMLElement>(`.${CSS_CLASSES.BOARD}`);
		if (!boardEl) {
			console.error('KanbanView: patchBoard called but board element not found; skipping patch');
			return;
		}

		// Card rebuilds and DOM re-parenting can clamp scrollTop. Capture up-front
		// keyed by cardOrderKey(laneValue, colValue) and restore after layout settles.
		const scrollPositions = new Map<string, number>();
		boardEl.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.COLUMN_BODY}`).forEach((body) => {
			const colEl = body.closest<HTMLElement>(`.${CSS_CLASSES.COLUMN}`);
			const colVal = colEl?.getAttribute(DATA_ATTRIBUTES.COLUMN_VALUE);
			const laneEl = body.closest<HTMLElement>(`.${CSS_CLASSES.SWIMLANE}`);
			const laneVal = laneEl?.getAttribute(DATA_ATTRIBUTES.SWIMLANE_VALUE) ?? null;
			if (colVal) scrollPositions.set(this.cardOrderKey(laneVal, colVal), body.scrollTop);
		});

		if (hasSwimlanes) {
			const liveLaneValues = [...lanes.keys()].filter((k): k is string => k !== null);
			// Merge any newly-seen lane values into prefs.
			const newLaneValues = liveLaneValues.filter((v) => !this._prefs.swimlaneOrder.includes(v));
			if (newLaneValues.length > 0) {
				const isInitialOrder = this._prefs.swimlaneOrder.length === 0;
				if (isInitialOrder) {
					this._prefs.swimlaneOrder = this._sortSwimlaneValues(newLaneValues);
				} else {
					this._prefs.swimlaneOrder = [...this._prefs.swimlaneOrder, ...newLaneValues];
				}
				this._persistPrefs();
			}

			const orderedLanes = this.getOrderedSwimlaneValues(liveLaneValues);
			const newLaneSet = new Set(orderedLanes);

			// Index existing lanes
			const existingLanes = new Map<string, HTMLElement>();
			boardEl.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.SWIMLANE}`).forEach((laneEl) => {
				const val = laneEl.getAttribute(DATA_ATTRIBUTES.SWIMLANE_VALUE);
				if (val !== null) existingLanes.set(val, laneEl);
			});

			// Remove lanes not in new set
			existingLanes.forEach((laneEl, laneValue) => {
				if (!newLaneSet.has(laneValue)) {
					const colSortable = this.swimlaneColumnSortables.get(laneValue);
					if (colSortable) {
						colSortable.destroy();
						this.swimlaneColumnSortables.delete(laneValue);
					}
					orderedColumnValues.forEach((colVal) => {
						const key = this.cardOrderKey(laneValue, colVal);
						const s = this._columnSortables.get(key);
						if (s) {
							s.destroy();
							this._columnSortables.delete(key);
						}
					});
					laneEl.remove();
					existingLanes.delete(laneValue);
				}
			});

			// Patch or create lanes
			orderedLanes.forEach((laneValue) => {
				const laneEntries = lanes.get(laneValue) ?? new Map<string, BasesEntry[]>();
				if (!existingLanes.has(laneValue)) {
					const laneEl = this._buildSwimlaneElement(laneValue, laneEntries, orderedColumnValues);
					boardEl.appendChild(laneEl);
					existingLanes.set(laneValue, laneEl);
					const bodyEl = laneEl.querySelector<HTMLElement>(`.${CSS_CLASSES.SWIMLANE_BODY}`);
					if (bodyEl) {
						this.swimlaneColumnSortables.set(laneValue, this._createColumnSortable(bodyEl));
					} else {
						console.error('KanbanView: swimlane body element not found; column sorting will be broken', laneValue);
					}
				} else {
					const laneEl = existingLanes.get(laneValue);
					if (laneEl) {
						// Update lane count
						const countEl = laneEl.querySelector(`.${CSS_CLASSES.SWIMLANE_COUNT}`);
						if (countEl) {
							const count = orderedColumnValues.reduce((sum, col) => sum + (laneEntries.get(col)?.length ?? 0), 0);
							countEl.textContent = `${count}`;
						}
						// Patch columns within lane body
						const bodyEl = laneEl.querySelector<HTMLElement>(`.${CSS_CLASSES.SWIMLANE_BODY}`);
						if (bodyEl) this._patchColumns(bodyEl, orderedColumnValues, laneEntries, laneValue);
					}
				}
			});

			// Re-order lanes in the DOM
			orderedLanes.forEach((laneValue) => {
				const laneEl = existingLanes.get(laneValue);
				if (laneEl) boardEl.appendChild(laneEl);
			});

			if (!this.swimlaneSortable) this.initializeSwimlaneSortable(boardEl);
		} else {
			// Null lane: columns are direct children of boardEl
			const colEntries = lanes.get(null) ?? new Map<string, BasesEntry[]>();
			this._patchColumns(boardEl, orderedColumnValues, colEntries, null);
		}

		// Defer scroll restoration to the next frame so layout has finalized.
		// Synchronous scrollTop assignment can be clamped when a transient layout
		// pass reports a smaller scrollHeight (e.g. image-backed cards not yet laid out).
		window.requestAnimationFrame(() => {
			try {
				boardEl.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.COLUMN_BODY}`).forEach((body) => {
					const colEl = body.closest<HTMLElement>(`.${CSS_CLASSES.COLUMN}`);
					const colVal = colEl?.getAttribute(DATA_ATTRIBUTES.COLUMN_VALUE);
					const laneEl = body.closest<HTMLElement>(`.${CSS_CLASSES.SWIMLANE}`);
					const laneVal = laneEl?.getAttribute(DATA_ATTRIBUTES.SWIMLANE_VALUE) ?? null;
					if (colVal) {
						const top = scrollPositions.get(this.cardOrderKey(laneVal, colVal));
						if (top !== undefined) body.scrollTop = top;
					}
				});
			} catch (error) {
				console.error('KanbanView: error restoring scroll positions', error);
			}
		});
	}

	private _patchColumns(
		containerEl: HTMLElement,
		orderedColumnValues: string[],
		groupedEntries: Map<string, BasesEntry[]>,
		laneValue: string | null,
	): void {
		// Index existing columns
		const existingColumns = new Map<string, HTMLElement>();
		containerEl.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.COLUMN}`).forEach((col) => {
			const val = col.getAttribute(DATA_ATTRIBUTES.COLUMN_VALUE);
			if (val !== null) existingColumns.set(val, col);
		});

		const newColSet = new Set(orderedColumnValues);

		// Remove columns not in the new ordered set
		existingColumns.forEach((colEl, colValue) => {
			if (!newColSet.has(colValue)) {
				const key = this.cardOrderKey(laneValue, colValue);
				const s = this._columnSortables.get(key);
				if (s) {
					s.destroy();
					this._columnSortables.delete(key);
				}
				colEl.remove();
				existingColumns.delete(colValue);
			}
		});

		// Add new columns or patch existing
		orderedColumnValues.forEach((colValue) => {
			const entries = groupedEntries.get(colValue) ?? [];
			if (!existingColumns.has(colValue)) {
				const options = laneValue !== null ? { showRemoveButton: false as const, swimlaneValue: laneValue } : {};
				const colEl = this.createColumn(colValue, entries, options);
				containerEl.appendChild(colEl);
				existingColumns.set(colValue, colEl);
				const cardBody = colEl.querySelector<HTMLElement>(
					`.${CSS_CLASSES.COLUMN_BODY}[${DATA_ATTRIBUTES.SORTABLE_CONTAINER}]`,
				);
				if (cardBody) {
					const key = this.cardOrderKey(laneValue, colValue);
					const attachOnce = () => {
						this.attachCardSortable(cardBody, key);
						this._deferredSortableListeners.delete(key);
						cardBody.removeEventListener('pointerdown', attachOnce);
					};
					cardBody.addEventListener('pointerdown', attachOnce);
					this._deferredSortableListeners.set(key, {
						el: cardBody,
						handler: attachOnce,
					});
				} else {
					console.warn('KanbanView: column body not found for new column; card drag will not work', colValue);
				}
			} else {
				const colEl = existingColumns.get(colValue);
				if (colEl) this.patchColumnCards(colEl, entries);
			}
		});

		// Re-order columns in the DOM to match orderedColumnValues
		orderedColumnValues.forEach((colValue) => {
			const colEl = existingColumns.get(colValue);
			if (colEl) containerEl.appendChild(colEl);
		});
	}

	private _computeCardFingerprint(entry: BasesEntry): string {
		return computeCardFingerprint(entry, this._buildCardCtx());
	}

	private patchColumnCards(columnEl: HTMLElement, newEntries: BasesEntry[]): void {
		patchColumnCardsEl(columnEl, newEntries, this._buildColumnCtx(), this._buildColumnCallbacks());
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
		updateSwimlaneToggleEl(toggleBtn, willCollapse);
		this._persistPrefs();
	}

	private _sortSwimlaneValues(values: string[]): string[] {
		return sortSwimlaneValues(values);
	}

	private getOrderedSwimlaneValues(liveValues: string[]): string[] {
		return getOrderedSwimlaneValuesEl(liveValues, this._prefs.swimlaneOrder);
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

	private _buildColumnCtx(): ColumnRenderCtx {
		return {
			doc: this.containerEl.doc,
			card: this._buildCardCtx(),
			cardCb: this._buildCardCallbacks(),
			prefs: { columnColors: this._prefs.columnColors },
			dragging: this._dragging,
			cardFingerprints: this._cardFingerprints,
			metadataCache: this.app?.metadataCache ?? null,
		};
	}

	private _buildColumnCallbacks(): ColumnCallbacks {
		return {
			applyColumnColor: (el, name) => this.applyColumnColor(el, name),
			onColorPickerClick: (anchor, col, val) => this.openColorPicker(anchor, col, val),
			onRemoveColumn: (val, el) => this.removeColumn(val, el),
			createAddButton: (colVal, laneVal) => this.createAddButton(colVal, laneVal),
			getQuickAddFolder: () => this.getQuickAddFolder(),
		};
	}

	private createColumn(
		value: string,
		entries: BasesEntry[],
		options: { showRemoveButton?: boolean; swimlaneValue?: string | null } = {},
	): HTMLElement {
		return createColumnEl(value, entries, options, this._buildColumnCtx(), this._buildColumnCallbacks());
	}

	private _buildCardCtx(): CardRenderCtx {
		return {
			app: this.app,
			doc: this.containerEl.doc,
			groupByPropertyId: this.groupByPropertyId,
			cardTitlePropertyId: this.cardTitlePropertyId,
			imagePropertyId: this.imagePropertyId,
			imageFit: this._lastImageFit ?? 'cover',
			imageAspectRatio: this._lastImageAspectRatio ?? 0.5,
			wrapValues: this._lastWrapValue ?? false,
			order: this.config?.getOrder() ?? [],
			getDisplayName: (id) => this.config?.getDisplayName(id) ?? id,
		};
	}

	private _buildCardCallbacks(): CardCallbacks {
		return {
			onHoverPreview: (lt, sp, e, el) => this.triggerHoverPreview(lt, sp, e, el),
			onSetActiveCard: (path) => this.setActiveCard(path),
			onOpenInBackgroundTab: (file) => this.openInBackgroundTab(file),
		};
	}

	private createCard(entry: BasesEntry): HTMLElement {
		return createCardEl(entry, this._buildCardCtx(), this._buildCardCallbacks());
	}

	private applyColumnColor(columnEl: HTMLElement, colorName: string | null): void {
		applyColumnColorEl(columnEl, colorName);
	}

	private openColorPicker(anchorEl: HTMLElement, columnEl: HTMLElement, columnValue: string): void {
		this.activeColorPicker?.remove();
		this.activeColorPicker = null;

		const popover = anchorEl.doc.createElement('div');
		popover.className = CSS_CLASSES.COLUMN_COLOR_POPOVER;

		const currentColor = columnEl.getAttribute(DATA_ATTRIBUTES.COLUMN_COLOR);

		const noneSwatch = anchorEl.doc.createElement('div');
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
			const swatch = anchorEl.doc.createElement('div');
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
		anchorEl.doc.body.appendChild(popover);
		this.activeColorPicker = popover;

		const dismiss = (e: MouseEvent) => {
			if (e.target instanceof Node && !popover.contains(e.target) && e.target !== anchorEl) {
				popover.remove();
				this.activeColorPicker = null;
				anchorEl.doc.removeEventListener('click', dismiss);
			}
		};
		anchorEl.doc.addEventListener('click', dismiss);
	}

	private getQuickAddFolder(): string | null {
		const raw = this.config?.get('quickAddFolder');
		if (typeof raw !== 'string') return null;
		const trimmed = raw.trim();
		if (!trimmed) return null;
		return normalizePath(trimmed);
	}

	private _buildQuickAddCtx(): QuickAddCtx {
		return {
			app: this.app,
			doc: this.containerEl.doc,
			prefsPropertyId: this._prefsPropertyId,
			prefsSwimlanePropertyId: this._prefsSwimlanePropertyId,
			quickAddFolder: this.getQuickAddFolder(),
		};
	}

	private _buildQuickAddCallbacks(): QuickAddCallbacks {
		return {
			createFileForView: (path, setFm) => this.createFileForView(path, setFm),
		};
	}

	private createAddButton(columnValue: string, swimlaneValue: string | null): HTMLElement {
		return createAddButtonEl(columnValue, swimlaneValue, this._buildQuickAddCtx(), this._buildQuickAddCallbacks());
	}

	private async createQuickAddCard(title: string, columnValue: string, swimlaneValue: string | null): Promise<void> {
		return createQuickAddCardEl(
			title,
			columnValue,
			swimlaneValue,
			this._buildQuickAddCtx(),
			this._buildQuickAddCallbacks(),
		);
	}

	private closeNativeNewItemPopover(): void {
		closeNativeNewItemPopoverEl(this.containerEl.doc);
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

			// require a press-and-hold before drag begins on touch so that
			// swiping to scroll a column isn't mistaken for a card drag
			delay: SORTABLE_CONFIG.TOUCH_DELAY,
			delayOnTouchOnly: true,
			touchStartThreshold: SORTABLE_CONFIG.TOUCH_START_THRESHOLD,

			// Keep same-column sorting enabled so Sortable can report whether the
			// user actually tried to move a card. Sorted boards snap back in
			// handleCardDrop after optionally showing an action-specific notice.
			sort: true,

			dragClass: CSS_CLASSES.CARD_DRAGGING,
			ghostClass: CSS_CLASSES.CARD_GHOST,
			chosenClass: CSS_CLASSES.CARD_CHOSEN,
			onStart: (evt: Sortable.SortableEvent) => {
				this._dragging = true;
				if (evt.item.instanceOf(HTMLElement)) evt.item.classList.remove(CSS_CLASSES.CARD_HOVER);
			},
			onEnd: (evt: Sortable.SortableEvent) => {
				this._dragging = false;
				this.setActiveCard(null);
				void this.handleCardDrop(evt);
			},
		});
		this._columnSortables.set(value, sortable);
	}

	private async handleCardDrop(evt: Sortable.SortableEvent): Promise<void> {
		if (!evt.item.instanceOf(HTMLElement)) {
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

		if (!newColumnEl || !newColumnEl.instanceOf(HTMLElement)) {
			console.warn('Could not find new column element');
			return;
		}

		const oldColumnValue = oldColumnEl?.instanceOf(HTMLElement)
			? oldColumnEl.getAttribute(DATA_ATTRIBUTES.COLUMN_VALUE)
			: null;
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
		const swimlaneActive = newLaneEl?.instanceOf(HTMLElement) ?? false;
		const oldLaneValue = oldLaneEl?.instanceOf(HTMLElement)
			? oldLaneEl.getAttribute(DATA_ATTRIBUTES.SWIMLANE_VALUE)
			: null;
		const newLaneValue = swimlaneActive ? newLaneEl.getAttribute(DATA_ATTRIBUTES.SWIMLANE_VALUE) : null;

		// Helper: read card paths from a column body element
		const getColumnPaths = (bodyEl: Element): string[] =>
			Array.from(bodyEl.querySelectorAll(`.${CSS_CLASSES.CARD}`))
				.map((c) => (c.instanceOf(HTMLElement) ? c.getAttribute(DATA_ATTRIBUTES.ENTRY_PATH) : null))
				.filter((p): p is string => p !== null);

		const oldKey = this.cardOrderKey(oldLaneValue, oldColumnValue ?? '');
		const newKey = this.cardOrderKey(newLaneValue, newColumnValue);
		const sortActive = this.hasActiveSort();

		// Same cell reorder: update prefs and persist
		if (oldLaneValue === newLaneValue && oldColumnValue === newColumnValue) {
			if (sortActive) {
				if (this.didSortableIndexChange(evt)) {
					new Notice(SORTED_CARD_ORDER_NOTICE, 4000);
				}
				this.render();
				return;
			}
			this._prefs.cardOrders[newKey] = getColumnPaths(evt.to);
			this._persistPrefs();
			return;
		}

		// Cross-cell drop: capture DOM order for both source and destination
		if (!sortActive) {
			if (oldColumnEl?.instanceOf(HTMLElement) && oldColumnValue) {
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

	/**
	 * Open a file in a new background tab, keeping the kanban as the active leaf.
	 *
	 * Obsidian's getLeaf('tab') makes the new tab the visible one in its group,
	 * so we capture the kanban's leaf, kick off openFile (fire-and-forget), and
	 * switch the active leaf back synchronously — before the browser repaints —
	 * so the new tab is never visible to the user. { focus: false } avoids an
	 * extra focus-driven scroll-into-view; the kanban still becomes the active
	 * (visible) leaf.
	 *
	 * During the leaf swap a transient layout pass clamps column scrollTop on
	 * image-backed cards (their <img> hasn't decoded, so scrollHeight briefly
	 * shrinks). We capture column scroll positions and restore them aggressively —
	 * synchronously plus over several animation frames — so no paint shows the
	 * clamped state.
	 */
	private openInBackgroundTab(file: TFile): void {
		if (!this.app?.workspace) return;

		const scrollPositions: Array<[HTMLElement, number]> = [];
		this.containerEl.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.COLUMN_BODY}`).forEach((body) => {
			if (body.scrollTop > 0) scrollPositions.push([body, body.scrollTop]);
		});

		const previousLeaf = this.app.workspace.getMostRecentLeaf();
		const newLeaf = this.app.workspace.getLeaf('tab');
		void newLeaf.openFile(file, { active: false });
		if (previousLeaf && previousLeaf !== newLeaf) {
			this.app.workspace.setActiveLeaf(previousLeaf, { focus: false });
		}

		if (scrollPositions.length === 0) return;
		const restore = () => {
			scrollPositions.forEach(([body, top]) => {
				if (body.scrollTop !== top) body.scrollTop = top;
			});
		};
		restore();
		let frames = 4;
		const tick = () => {
			restore();
			if (--frames > 0) window.requestAnimationFrame(tick);
		};
		window.requestAnimationFrame(tick);
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

	private didSortableIndexChange(evt: Sortable.SortableEvent): boolean {
		if (evt.oldDraggableIndex !== undefined || evt.newDraggableIndex !== undefined) {
			return evt.oldDraggableIndex !== evt.newDraggableIndex;
		}
		if (evt.oldIndex !== undefined || evt.newIndex !== undefined) {
			return evt.oldIndex !== evt.newIndex;
		}
		return false;
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
				displayName: 'Add card to column folder',
				type: 'folder',
				key: 'quickAddFolder',
				placeholder: 'Required for + button',
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
