/**
 * Error handling utilities with proper type guards
 */

/**
 * Type guard to check if an unknown value is an Error instance
 * @param error - The value to check
 * @returns True if the value is an Error instance
 */
export function isError(error: unknown): error is Error {
	return error instanceof Error;
}

/**
 * Converts an unknown error value to an Error instance
 * Handles cases where the error might not be an Error object
 * @param error - The error value to convert
 * @returns An Error instance
 */
export function toError(error: unknown): Error {
	if (isError(error)) {
		return error;
	}
	
	if (typeof error === 'string') {
		return new Error(error);
	}
	
	if (error && typeof error === 'object' && 'message' in error) {
		return new Error(String(error.message));
	}
	
	return new Error(String(error));
}

/**
 * Creates a standardized error message from an error
 * @param error - The error instance
 * @param context - The context where the error occurred
 * @returns Formatted error message
 */
export function formatErrorMessage(error: Error, context: string): string {
	return `[${context}] ${error.name}: ${error.message}`;
}

