import { COLOR_PALETTE } from '../constants.ts';

/** A stable, theme-aware accent for categorical values, or an explicit color. */
export function cardColor(value: string): string | null {
	const text = value.trim();
	if (!text || text === 'null') return null;
	const named = COLOR_PALETTE.find((color) => color.name === text.toLowerCase());
	if (named) return named.cssVar;
	if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(text)) return text;
	let hash = 0;
	for (const char of text) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
	return COLOR_PALETTE[hash % COLOR_PALETTE.length].cssVar;
}
