// Mock sortablejs module for testing
let mockInstances = [];
let MockSortableConstructor = null;

function setMockSortable(mockFn) {
	MockSortableConstructor = mockFn;
}

function getMockInstances() {
	return mockInstances;
}

function resetMockInstances() {
	mockInstances = [];
}

class MockSortable {
	constructor(element, options) {
		this.element = element;
		this.options = options;
		this.destroyed = false;
		mockInstances.push(this);
		
		// Call the original mock if provided
		if (MockSortableConstructor) {
			const instance = MockSortableConstructor(element, options);
			// Copy properties
			Object.assign(this, instance);
		}
	}
	
	destroy() {
		this.destroyed = true;
	}
}

// Default export
module.exports = MockSortable;

// Also export as default for ES modules
module.exports.default = MockSortable;

// Export helper functions
module.exports.setMockSortable = setMockSortable;
module.exports.getMockInstances = getMockInstances;
module.exports.resetMockInstances = resetMockInstances;

