import type { MetadataCache } from 'obsidian';

const WIKILINK_RE = /^\[\[([^\]]+)\]\]$/;

/**
 * If `value` is wrapped in `[[ ]]`, return a human-readable display string.
 * Resolution order:
 *   1. Explicit pipe alias: `[[Note|My Alias]]` → "My Alias"
 *   2. First entry of the target note's `aliases` frontmatter, if the note
 *      exists in the vault and the metadata cache has a record for it.
 *   3. The link target's basename (last path segment, with any `#heading`
 *      or `^block-ref` stripped).
 *
 * Non-wikilink values are returned unchanged so this is safe to call on every
 * lane/column label without first checking the shape.
 */
export function resolveWikilinkDisplay(value: string, metadataCache: MetadataCache | null | undefined): string {
	if (typeof value !== 'string') return value;
	const match = value.match(WIKILINK_RE);
	if (!match) return value;

	const inner = match[1];
	const pipeIdx = inner.indexOf('|');
	if (pipeIdx >= 0) {
		const alias = inner.slice(pipeIdx + 1).trim();
		if (alias) return alias;
	}

	const rawTarget = pipeIdx >= 0 ? inner.slice(0, pipeIdx) : inner;
	const target = rawTarget.replace(/[#^].*$/, '').trim();

	if (metadataCache && target) {
		try {
			const file = metadataCache.getFirstLinkpathDest(target, '');
			if (file) {
				const cache = metadataCache.getFileCache(file);
				const aliases = cache?.frontmatter?.aliases;
				if (Array.isArray(aliases)) {
					const first = aliases.find((a) => typeof a === 'string' && a.trim().length > 0);
					if (typeof first === 'string') return first.trim();
				} else if (typeof aliases === 'string' && aliases.trim().length > 0) {
					return aliases.trim();
				}
			}
		} catch (error) {
			console.warn('resolveWikilinkDisplay: metadataCache lookup failed', error);
		}
	}

	const parts = target.split('/');
	const last = parts[parts.length - 1];
	return last || target || value;
}
