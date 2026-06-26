import { setIcon } from 'obsidian';
import { CSS_CLASSES, DATA_ATTRIBUTES, UNCATEGORIZED_LABEL } from '../constants.ts';
import type { BasesEntry } from 'obsidian';
import { createColumn, type ColumnRenderCtx, type ColumnCallbacks } from './column.ts';

export interface RowRenderCtx extends ColumnRenderCtx {
	collapsedLanes: Set<string>;
}

export interface RowCallbacks extends ColumnCallbacks {
	onToggleCollapsed: (laneValue: string, laneEl: HTMLElement, toggleBtn: HTMLElement) => void;
	attachCardSortable: (cardBody: HTMLElement, key: string) => void;
	cardOrderKey: (laneValue: string, columnValue: string) => string;
}

export function updateSwimlaneToggle(toggleBtn: HTMLElement, isCollapsed: boolean): void {
	const label = isCollapsed ? 'Expand lane' : 'Collapse lane';
	toggleBtn.empty();
	setIcon(toggleBtn, isCollapsed ? 'chevron-right' : 'chevron-down');
	toggleBtn.setAttribute('aria-label', label);
	toggleBtn.setAttribute('title', label);
	toggleBtn.setAttribute('aria-expanded', String(!isCollapsed));
}

export function sortSwimlaneValues(values: string[]): string[] {
	return [...values].sort((a, b) => {
		if (a === UNCATEGORIZED_LABEL) return 1;
		if (b === UNCATEGORIZED_LABEL) return -1;
		return a.localeCompare(b);
	});
}

export function getOrderedSwimlaneValues(liveValues: string[], swimlaneOrder: string[]): string[] {
	if (!swimlaneOrder.length) {
		return sortSwimlaneValues(liveValues);
	}
	const liveSet = new Set(liveValues);
	const ordered = swimlaneOrder.filter((v) => liveSet.has(v));
	const orderedSet = new Set(ordered);
	const newOnes = liveValues.filter((v) => !orderedSet.has(v));
	return [...ordered, ...newOnes];
}

export function buildSwimlaneElement(
	laneValue: string,
	laneEntries: Map<string, BasesEntry[]>,
	orderedColumnValues: string[],
	ctx: RowRenderCtx,
	cb: RowCallbacks,
): HTMLElement {
	const laneEl = ctx.doc.createElement('div');
	laneEl.className = CSS_CLASSES.SWIMLANE;
	laneEl.setAttribute(DATA_ATTRIBUTES.SWIMLANE_VALUE, laneValue);
	const isCollapsed = ctx.collapsedLanes.has(laneValue);
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
	updateSwimlaneToggle(toggleBtn, isCollapsed);
	toggleBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		try {
			cb.onToggleCollapsed(laneValue, laneEl, toggleBtn);
		} catch (error) {
			console.error('KanbanView: error toggling swimlane collapsed state', error);
		}
	});

	const bodyEl = laneEl.createDiv({ cls: CSS_CLASSES.SWIMLANE_BODY });
	orderedColumnValues.forEach((columnValue) => {
		const columnEl = createColumn(
			columnValue,
			laneEntries.get(columnValue) ?? [],
			{
				swimlaneValue: laneValue,
			},
			ctx,
			cb,
		);
		bodyEl.appendChild(columnEl);
		const cardBody = columnEl.querySelector<HTMLElement>(
			`.${CSS_CLASSES.COLUMN_BODY}[${DATA_ATTRIBUTES.SORTABLE_CONTAINER}]`,
		);
		if (cardBody) cb.attachCardSortable(cardBody, cb.cardOrderKey(laneValue, columnValue));
	});

	return laneEl;
}
