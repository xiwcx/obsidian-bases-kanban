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
		const aliasFromCache = lookupFrontmatterAlias(metadataCache, target);
		if (aliasFromCache) return aliasFromCache;
	}

	const parts = target.split('/');
	const last = parts[parts.length - 1];
	return last || target || value;
}

function lookupFrontmatterAlias(metadataCache: MetadataCache, target: string): string | undefined {
	try {
		const file = metadataCache.getFirstLinkpathDest(target, '');
		if (!file) return undefined;
		const cache = metadataCache.getFileCache(file);
		const frontmatter: unknown = cache?.frontmatter;
		if (!frontmatter || typeof frontmatter !== 'object') return undefined;
		if (!('aliases' in frontmatter)) return undefined;
		return firstNonEmptyAlias(frontmatter.aliases);
	} catch (error) {
		console.warn('resolveWikilinkDisplay: metadataCache lookup failed', error);
		return undefined;
	}
}

function firstNonEmptyAlias(aliases: unknown): string | undefined {
	if (Array.isArray(aliases)) {
		for (const a of aliases) {
			if (typeof a === 'string' && a.trim().length > 0) return a.trim();
		}
		return undefined;
	}
	if (typeof aliases === 'string' && aliases.trim().length > 0) return aliases.trim();
	return undefined;
}
