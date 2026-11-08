import { getFrontMatterInfo, parseYaml, stringifyYaml } from 'obsidian';

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

/** Update the current file atomically; unchanged order preserves its exact bytes. */
export function updateCardOrderContent(content: string, propertyName: string, order: number): string {
	const info = getFrontMatterInfo(content);
	const frontmatter: unknown = info.exists ? (parseYaml(info.frontmatter) ?? {}) : {};
	if (!isFrontmatterRecord(frontmatter)) {
		throw new Error('Card order requires a frontmatter mapping');
	}
	const properties = frontmatter;
	if (readCardOrderValue(properties[propertyName]) === order) return content;
	const updated = stringifyYaml({ ...properties, [propertyName]: order });
	return info.exists ? content.slice(0, info.from) + updated + content.slice(info.to) : `---\n${updated}---\n${content}`;
}

function isFrontmatterRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
