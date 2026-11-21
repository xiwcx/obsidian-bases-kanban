import type { BasesEntry, MetadataCache } from 'obsidian';
import { setIcon } from 'obsidian';
import { COLOR_PALETTE, CSS_CLASSES, DATA_ATTRIBUTES } from '../constants.ts';
import { resolveWikilinkDisplay } from '../utils/wikilink.ts';
import { createCard, computeCardFingerprint, type CardRenderCtx, type CardCallbacks } from './card.ts';

export interface ColumnRenderCtx {
	card: CardRenderCtx;
	cardCb: CardCallbacks;
	prefs: { columnColors: Record<string, string>; collapsedColumns: Set<string> };
	dragging: boolean;
	cardFingerprints: Map<string, string>;
	// Column values that are empty across the whole board (every swimlane). These
	// persist only because they're saved in columnOrder, so they get a remove
	// button. Board-wide, so it can't be derived from a single column's entries.
	globallyEmptyColumns: Set<string>;
	metadataCache: MetadataCache | null;
}

export interface ColumnCallbacks {
	applyColumnColor: (columnEl: HTMLElement, colorName: string | null) => void;
	onColorPickerClick: (anchorEl: HTMLElement, columnEl: HTMLElement, columnValue: string) => void;
	onRemoveColumn: (columnValue: string, columnEl: HTMLElement) => void;
	onToggleColumn: (columnValue: string) => void;
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

export function createRemoveButton(value: string, onRemove: () => void): HTMLElement {
	const btn = createEl('button', {
		cls: [CSS_CLASSES.COLUMN_REMOVE_BTN, CSS_CLASSES.COLUMN_CONTROL],
		attr: { type: 'button' },
	});
	btn.setAttribute('aria-label', `Remove column: ${value}`);
	setIcon(btn, 'trash-2');
	btn.addEventListener('click', (e) => {
		e.stopPropagation();
		onRemove();
	});
	return btn;
}

export function applyColumnCollapsed(columnEl: HTMLElement, collapsed: boolean): void {
	columnEl.classList.toggle(CSS_CLASSES.COLUMN_COLLAPSED, collapsed);
	const toggle = columnEl.querySelector<HTMLElement>(`.${CSS_CLASSES.COLUMN_TOGGLE}`);
	if (!toggle || toggle.getAttribute('aria-expanded') === String(!collapsed)) return;
	const value = columnEl.getAttribute(DATA_ATTRIBUTES.COLUMN_VALUE) ?? '';
	toggle.empty();
	setIcon(toggle, collapsed ? 'chevron-right' : 'chevron-left');
	toggle.setAttribute('aria-label', `${collapsed ? 'Expand' : 'Collapse'} column: ${value}`);
	toggle.setAttribute('aria-expanded', String(!collapsed));
}

export function createColumn(
	value: string,
	entries: BasesEntry[],
	options: { swimlaneValue?: string | null },
	ctx: ColumnRenderCtx,
	cb: ColumnCallbacks,
): HTMLElement {
	const columnEl = createDiv({ cls: CSS_CLASSES.COLUMN });
	columnEl.setAttribute(DATA_ATTRIBUTES.COLUMN_VALUE, value);

	const colorName = ctx.prefs.columnColors[value] ?? null;
	cb.applyColumnColor(columnEl, colorName);

	const headerEl = columnEl.createDiv({ cls: CSS_CLASSES.COLUMN_HEADER });

	const dragHandle = headerEl.createDiv({ cls: [CSS_CLASSES.COLUMN_DRAG_HANDLE, CSS_CLASSES.COLUMN_CONTROL] });
	dragHandle.setAttribute('aria-label', `Drag to reorder column: ${value}`);
	setIcon(dragHandle, 'grip-vertical');

	const colorBtn = headerEl.createEl('button', {
		cls: [CSS_CLASSES.COLUMN_COLOR_BTN, CSS_CLASSES.COLUMN_CONTROL],
		attr: { type: 'button' },
	});
	colorBtn.setAttribute('aria-label', `Set color for column: ${value}`);
	colorBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		cb.onColorPickerClick(colorBtn, columnEl, value);
	});

	const headingEl = headerEl.createDiv({ cls: CSS_CLASSES.COLUMN_HEADING });
	headingEl.createSpan({
		text: resolveWikilinkDisplay(value, ctx.metadataCache),
		cls: CSS_CLASSES.COLUMN_TITLE,
	});
	headingEl.createSpan({ text: `${entries.length}`, cls: CSS_CLASSES.COLUMN_COUNT });
	if (cb.getQuickAddFolder()) {
		headerEl.appendChild(cb.createAddButton(value, options.swimlaneValue ?? null));
	}
	const toggle = headerEl.createEl('button', {
		cls: [CSS_CLASSES.COLUMN_TOGGLE, CSS_CLASSES.COLUMN_CONTROL],
		attr: { type: 'button' },
	});
	toggle.addEventListener('click', (event) => {
		event.stopPropagation();
		cb.onToggleColumn(value);
	});
	applyColumnCollapsed(columnEl, ctx.prefs.collapsedColumns.has(value));

	if (ctx.globallyEmptyColumns.has(value)) {
		headerEl.appendChild(createRemoveButton(value, () => cb.onRemoveColumn(value, columnEl)));
	}

	const bodyEl = columnEl.createDiv({ cls: CSS_CLASSES.COLUMN_BODY });
	bodyEl.setAttribute(DATA_ATTRIBUTES.SORTABLE_CONTAINER, 'true');

	entries.forEach((entry) => {
		bodyEl.appendChild(createCard(entry, ctx.card, ctx.cardCb));
		ctx.cardFingerprints.set(entry.file.path, computeCardFingerprint(entry, ctx.card));
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
	if (columnValue) applyColumnCollapsed(columnEl, ctx.prefs.collapsedColumns.has(columnValue));
	const existingRemoveBtn = headerEl?.querySelector(`.${CSS_CLASSES.COLUMN_REMOVE_BTN}`) ?? null;
	const showRemoveButton = !!columnValue && ctx.globallyEmptyColumns.has(columnValue);
	if (headerEl && showRemoveButton && !existingRemoveBtn && columnValue) {
		headerEl.appendChild(createRemoveButton(columnValue, () => cb.onRemoveColumn(columnValue, columnEl)));
	} else if (!showRemoveButton && existingRemoveBtn) {
		existingRemoveBtn.remove();
	}

	const existingAddBtn = headerEl?.querySelector(`.${CSS_CLASSES.COLUMN_ADD_BTN}`) ?? null;
	const hasFolder = !!cb.getQuickAddFolder();
	if (headerEl && columnValue && hasFolder && !existingAddBtn) {
		const swimlaneEl = columnEl.closest<HTMLElement>(`[${DATA_ATTRIBUTES.SWIMLANE_VALUE}]`);
		const swimlaneValue = swimlaneEl?.getAttribute(DATA_ATTRIBUTES.SWIMLANE_VALUE) ?? null;
		headerEl.insertBefore(
			cb.createAddButton(columnValue, swimlaneValue),
			headerEl.querySelector(`.${CSS_CLASSES.COLUMN_TOGGLE}`),
		);
	} else if (!hasFolder && existingAddBtn) {
		existingAddBtn.remove();
	}

	const newPaths = new Set(newEntries.map((e) => e.file.path));
	const existingCards = new Map<string, HTMLElement>();
	body.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.CARD}`).forEach((card) => {
		const path = card.getAttribute(DATA_ATTRIBUTES.ENTRY_PATH);
		if (!path) return;
		if (newPaths.has(path)) existingCards.set(path, card);
		else card.remove();
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
		existingCards.set(entry.file.path, newCard);
	});

	// Reorder cards in the DOM to match newEntries order.
	// Skipped during active drags — Sortable owns the DOM during a drag and
	// reordering here would fight its live preview, causing visual thrashing.
	if (!ctx.dragging) {
		let next = body.firstElementChild;
		newEntries.forEach((entry) => {
			const card = existingCards.get(entry.file.path);
			if (!card) return;
			// Leave already-correct nodes in place. Appending every card on every
			// update invalidates layout for the whole column after a single drop.
			if (card !== next) body.insertBefore(card, next);
			next = card.nextElementSibling;
		});
	}
}
