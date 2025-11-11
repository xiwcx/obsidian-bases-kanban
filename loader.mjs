import { pathToFileURL } from 'node:url';
import { resolve as resolvePath } from 'node:path';

const mockPaths = {
	'obsidian': resolvePath('tests/mocks/obsidian.ts'),
	'sortablejs': resolvePath('tests/mocks/sortablejs.js'),
};

export async function resolve(specifier, context, nextResolve) {
	// Intercept module specifiers that should be mocked BEFORE calling nextResolve
	if (mockPaths[specifier]) {
		return {
			url: pathToFileURL(mockPaths[specifier]).href,
			shortCircuit: true,
		};
	}
	
	return nextResolve(specifier, context);
}


