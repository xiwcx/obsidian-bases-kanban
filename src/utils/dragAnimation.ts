import { SORTABLE_CONFIG } from '../constants.ts';

// Sortable captures and animates every child's bounding box on dragover. Avoid
// that synchronous layout work in large cells; keep normal small-board motion.
export const MAX_ANIMATED_CARDS = 100;

export function cardDragAnimation(cardCount: number): number {
	return cardCount > MAX_ANIMATED_CARDS ? 0 : SORTABLE_CONFIG.ANIMATION_DURATION;
}
