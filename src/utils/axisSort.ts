import { UNCATEGORIZED_LABEL } from '../constants.ts';

export type AxisSort = 'manual' | 'asc' | 'desc';

export function parseAxisSort(value: unknown): AxisSort {
	return value === 'asc' || value === 'desc' ? value : 'manual';
}

const collator = new Intl.Collator(undefined, { numeric: true });

/**
 * Sort normalized group keys, not cards. ISO dates sort chronologically;
 * numeric labels sort numerically. Missing-value groups stay last in either
 * direction. Never mutate the persisted manual order.
 */
export function sortAxisValues(values: string[], direction: Exclude<AxisSort, 'manual'>): string[] {
	return [...values].sort((a, b) => {
		if (a === b) return 0;
		if (a === UNCATEGORIZED_LABEL) return 1;
		if (b === UNCATEGORIZED_LABEL) return -1;
		const aNumber = Number(a);
		const bNumber = Number(b);
		const aNumeric = Number.isFinite(aNumber);
		const bNumeric = Number.isFinite(bNumber);
		// Keep numeric and textual keys in separate buckets so mixed labels still
		// have a transitive comparator (not pairwise numeric/text comparisons).
		let comparison: number;
		if (aNumeric && bNumeric) comparison = aNumber - bNumber;
		else if (aNumeric !== bNumeric) comparison = aNumeric ? -1 : 1;
		else comparison = collator.compare(a, b);
		return direction === 'asc' ? comparison : -comparison;
	});
}
