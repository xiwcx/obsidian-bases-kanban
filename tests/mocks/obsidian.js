// CommonJS mock for obsidian module
// This file is required by node_modules/obsidian/index.js
// The loader intercepts 'obsidian' imports and redirects to obsidian.ts for ESM,
// but this file is needed for the CommonJS require() call in node_modules/obsidian/index.js

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
	
	registerBasesView(viewType, options) {
		// Mock implementation
	}
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
