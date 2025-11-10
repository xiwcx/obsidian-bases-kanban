// Mock obsidian module for testing
// This provides the minimal interface needed for tests

class BasesView {
	constructor(controller) {
		this.app = controller.app;
		this.data = controller.data;
		this.allProperties = controller.allProperties;
		this.config = controller.config;
	}
	
	onDataUpdated() {
		throw new Error('Must be implemented by subclass');
	}
	
	onClose() {}
}

class Plugin {
	constructor(app, manifest) {
		this.app = app;
		this.manifest = manifest;
	}
	
	async onload() {}
	onunload() {}
	
	registerBasesView(viewType, options) {}
}

function parsePropertyId(propertyId) {
	const parts = propertyId.split('.');
	if (parts.length > 1) {
		return {
			name: parts.slice(1).join('.'),
			source: parts[0],
		};
	}
	return {
		name: propertyId,
	};
}

module.exports = {
	BasesView,
	Plugin,
	parsePropertyId,
};

