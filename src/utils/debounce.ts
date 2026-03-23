export interface DebouncedFn<T extends (...args: unknown[]) => void> {
	(...args: Parameters<T>): void;
	cancel(): void;
}

/**
 * Returns a debounced version of `fn` that delays invocation until `delay` ms
 * have elapsed since the last call. Exposes a `cancel()` method to clear any
 * pending invocation (e.g. on cleanup).
 */
export function debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number): DebouncedFn<T> {
	let timer: ReturnType<typeof setTimeout> | null = null;

	const debounced = Object.assign(
		function (...args: Parameters<T>): void {
			if (timer !== null) {
				clearTimeout(timer);
			}
			timer = setTimeout(() => {
				timer = null;
				fn(...args);
			}, delay);
		},
		{
			cancel(): void {
				if (timer !== null) {
					clearTimeout(timer);
					timer = null;
				}
			},
		},
	);

	return debounced;
}
