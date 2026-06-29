import type { BasesEntry } from 'obsidian';
import { COLOR_PALETTE, CSS_CLASSES, DATA_ATTRIBUTES } from '../constants.ts';
import { createCard, computeCardFingerprint, type CardRenderCtx, type CardCallbacks } from './card.ts';

export interface ColumnRenderCtx {
	doc: Document;
	card: CardRenderCtx;
	cardCb: CardCallbacks;
	prefs: { columnColors: Record<string, string> };
	dragging: boolean;
	cardFingerprints: Map<string, string>;
	// Column values that are empty across the whole board (every swimlane). These
	// persist only because they're saved in columnOrder, so they get a remove
	// button. Board-wide, so it can't be derived from a single column's entries.
	globallyEmptyColumns: Set<string>;
}

export interface ColumnCallbacks {
	applyColumnColor: (columnEl: HTMLElement, colorName: string | null) => void;
	onColorPickerClick: (anchorEl: HTMLElement, columnEl: HTMLElement, columnValue: string) => void;
	onRemoveColumn: (columnValue: string, columnEl: HTMLElement) => void;
	createAddButton: (columnValue: string, swimlaneValue: string | null) => HTMLElement;
	getQuickAddFolder: () => string | null;
}

export function applyColumnColor(columnEl: HTMLElement, colorName: string | null): void {
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

export function createRemoveButton(doc: Document, value: string, onRemove: () => void): HTMLElement {
	const btn = doc.createElement('div');
	btn.className = CSS_CLASSES.COLUMN_REMOVE_BTN;
	btn.setAttribute('aria-label', `Remove column: ${value}`);
	btn.setAttribute('role', 'button');
	btn.textContent = '×';
	btn.addEventListener('click', (e) => {
		e.stopPropagation();
		onRemove();
	});
	return btn;
}

export function createColumn(
	value: string,
	entries: BasesEntry[],
	options: { swimlaneValue?: string | null },
	ctx: ColumnRenderCtx,
	cb: ColumnCallbacks,
): HTMLElement {
	const columnEl = ctx.doc.createElement('div');
	columnEl.className = CSS_CLASSES.COLUMN;
	columnEl.setAttribute(DATA_ATTRIBUTES.COLUMN_VALUE, value);

	const colorName = ctx.prefs.columnColors[value] ?? null;
	cb.applyColumnColor(columnEl, colorName);

	const headerEl = columnEl.createDiv({ cls: CSS_CLASSES.COLUMN_HEADER });

	const dragHandle = headerEl.createDiv({ cls: CSS_CLASSES.COLUMN_DRAG_HANDLE });
	dragHandle.textContent = '⋮⋮';

	const colorBtn = headerEl.createDiv({ cls: CSS_CLASSES.COLUMN_COLOR_BTN });
	colorBtn.setAttribute('aria-label', `Set color for column: ${value}`);
	colorBtn.setAttribute('role', 'button');
	colorBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		cb.onColorPickerClick(colorBtn, columnEl, value);
	});

	headerEl.createSpan({ text: value, cls: CSS_CLASSES.COLUMN_TITLE });
	headerEl.createSpan({ text: `${entries.length}`, cls: CSS_CLASSES.COLUMN_COUNT });

	if (cb.getQuickAddFolder()) {
		headerEl.appendChild(cb.createAddButton(value, options.swimlaneValue ?? null));
	}

	if (ctx.globallyEmptyColumns.has(value)) {
		headerEl.appendChild(createRemoveButton(ctx.doc, value, () => cb.onRemoveColumn(value, columnEl)));
	}

	const bodyEl = columnEl.createDiv({ cls: CSS_CLASSES.COLUMN_BODY });
	bodyEl.setAttribute(DATA_ATTRIBUTES.SORTABLE_CONTAINER, 'true');

	entries.forEach((entry) => {
		bodyEl.appendChild(createCard(entry, ctx.card, ctx.cardCb));
	});

	return columnEl;
}

export function patchColumnCards(
	columnEl: HTMLElement,
	newEntries: BasesEntry[],
	ctx: ColumnRenderCtx,
	cb: ColumnCallbacks,
): void {
	const body = columnEl.querySelector<HTMLElement>(`.${CSS_CLASSES.COLUMN_BODY}`);
	if (!body) return;

	const countEl = columnEl.querySelector(`.${CSS_CLASSES.COLUMN_COUNT}`);
	if (countEl) countEl.textContent = `${newEntries.length}`;

	// The remove button reflects board-wide emptiness, not this column's local
	// count: in swimlane mode a column can be empty in one lane while holding cards
	// in another, so `newEntries.length` is not a reliable signal of global emptiness.
	const headerEl = columnEl.querySelector<HTMLElement>(`.${CSS_CLASSES.COLUMN_HEADER}`);
	const columnValue = columnEl.getAttribute(DATA_ATTRIBUTES.COLUMN_VALUE);
	const existingRemoveBtn = headerEl?.querySelector(`.${CSS_CLASSES.COLUMN_REMOVE_BTN}`) ?? null;
	const showRemoveButton = !!columnValue && ctx.globallyEmptyColumns.has(columnValue);
	if (headerEl && showRemoveButton && !existingRemoveBtn && columnValue) {
		headerEl.appendChild(createRemoveButton(ctx.doc, columnValue, () => cb.onRemoveColumn(columnValue, columnEl)));
	} else if (!showRemoveButton && existingRemoveBtn) {
		existingRemoveBtn.remove();
	}

	const existingAddBtn = headerEl?.querySelector(`.${CSS_CLASSES.COLUMN_ADD_BTN}`) ?? null;
	const hasFolder = !!cb.getQuickAddFolder();
	if (headerEl && columnValue && hasFolder && !existingAddBtn) {
		const swimlaneEl = columnEl.closest<HTMLElement>(`[${DATA_ATTRIBUTES.SWIMLANE_VALUE}]`);
		const swimlaneValue = swimlaneEl?.getAttribute(DATA_ATTRIBUTES.SWIMLANE_VALUE) ?? null;
		headerEl.appendChild(cb.createAddButton(columnValue, swimlaneValue));
	} else if (!hasFolder && existingAddBtn) {
		existingAddBtn.remove();
	}

	const newPaths = new Set(newEntries.map((e) => e.file.path));
	body.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.CARD}`).forEach((card) => {
		const path = card.getAttribute(DATA_ATTRIBUTES.ENTRY_PATH);
		if (path && !newPaths.has(path)) card.remove();
	});

	const existingCards = new Map<string, HTMLElement>();
	body.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.CARD}`).forEach((card) => {
		const path = card.getAttribute(DATA_ATTRIBUTES.ENTRY_PATH);
		if (path) existingCards.set(path, card);
	});
	newEntries.forEach((entry) => {
		const fp = computeCardFingerprint(entry, ctx.card);
		const existing = existingCards.get(entry.file.path);
		if (existing && ctx.cardFingerprints.get(entry.file.path) === fp) {
			return;
		}
		const newCard = createCard(entry, ctx.card, ctx.cardCb);
		ctx.cardFingerprints.set(entry.file.path, fp);
		if (existing) {
			body.replaceChild(newCard, existing);
		} else {
			body.appendChild(newCard);
		}
	});

	// Reorder cards in the DOM to match newEntries order.
	// Skipped during active drags — Sortable owns the DOM during a drag and
	// reordering here would fight its live preview, causing visual thrashing.
	if (!ctx.dragging) {
		const pathToCard = new Map<string, Element>();
		body.querySelectorAll(`.${CSS_CLASSES.CARD}`).forEach((card) => {
			const path = card.instanceOf(HTMLElement) ? card.getAttribute(DATA_ATTRIBUTES.ENTRY_PATH) : null;
			if (path) pathToCard.set(path, card);
		});
		newEntries.forEach((entry) => {
			const card = pathToCard.get(entry.file.path);
			if (card) body.appendChild(card);
		});
	}
}
