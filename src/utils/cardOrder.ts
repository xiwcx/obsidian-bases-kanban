/**
 * Merge a filtered DOM order without forgetting hidden cards.
 *
 * Hidden runs follow their preceding visible, non-dragged saved anchor. Runs
 * without an anchor stay at the front. The dragged path never anchors a run:
 * its hidden neighbours must not move with it, or follow it into another cell.
 * Building buckets keeps the merge linear even on large boards.
 */
export function mergeCardOrder(saved: string[], visible: string[], draggedPath: string): string[] {
	const orderedVisible = [...new Set(visible)];
	const visibleSet = new Set(orderedVisible);
	const hiddenByAnchor = new Map<string | null, string[]>();
	const seen = new Set(orderedVisible);
	let anchor: string | null = null;
	for (const path of saved) {
		if (path === draggedPath) continue;
		if (visibleSet.has(path)) {
			anchor = path;
		} else if (!seen.has(path)) {
			seen.add(path);
			const bucket = hiddenByAnchor.get(anchor) ?? [];
			bucket.push(path);
			hiddenByAnchor.set(anchor, bucket);
		}
	}
	const result = [...(hiddenByAnchor.get(null) ?? [])];
	for (const path of orderedVisible) {
		result.push(path, ...(hiddenByAnchor.get(path) ?? []));
	}
	return result;
}
