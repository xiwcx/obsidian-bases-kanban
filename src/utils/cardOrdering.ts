/** Parse a finite numeric order; missing or invalid values have no explicit order. */
export function readCardOrderValue(value: unknown): number | null {
	if (typeof value === 'number') return Number.isFinite(value) ? value : null;
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (trimmed === '') return null;
	const numeric = Number(trimmed);
	return Number.isFinite(numeric) ? numeric : null;
}

/** Compare explicit orders in ascending order and place unordered cards last. */
export function compareCardOrderValues(a: number | null, b: number | null): number {
	if (a === null) return b === null ? 0 : 1;
	if (b === null) return -1;
	return a - b;
}
