import { JSDOM } from 'jsdom';
import type { BasesEntry, BasesPropertyId, TFile, App, QueryController } from 'obsidian';
import type Sortable from 'sortablejs';

// Setup jsdom environment
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
	url: 'http://localhost',
	pretendToBeVisual: true,
	resources: 'usable',
});

// Make DOM globals available
(global as any).window = dom.window;
(global as any).document = dom.window.document;
(global as any).HTMLElement = dom.window.HTMLElement;
(global as any).HTMLDivElement = dom.window.HTMLDivElement;

// Extend HTMLElement prototype with Obsidian-like methods
const HTMLElementProto = dom.window.HTMLElement.prototype as any;

if (!HTMLElementProto.createDiv) {
	HTMLElementProto.createDiv = function(options?: { cls?: string; text?: string }): HTMLElement {
		const child = document.createElement('div');
		if (options?.cls) {
			child.className = options.cls;
		}
		if (options?.text) {
			child.textContent = options.text;
		}
		this.appendChild(child);
		return child;
	};
}

if (!HTMLElementProto.createSpan) {
	HTMLElementProto.createSpan = function(options?: { text?: string; cls?: string }): HTMLElement {
		const span = document.createElement('span');
		if (options?.text) {
			span.textContent = options.text;
		}
		if (options?.cls) {
			span.className = options.cls;
		}
		this.appendChild(span);
		return span;
	};
}

if (!HTMLElementProto.createEl) {
	HTMLElementProto.createEl = function(tag: string, options?: { cls?: string; text?: string }): HTMLElement {
		const el = document.createElement(tag);
		if (options?.cls) {
			el.className = options.cls;
		}
		if (options?.text) {
			el.textContent = options.text;
		}
		this.appendChild(el);
		return el;
	};
}

if (!HTMLElementProto.empty) {
	HTMLElementProto.empty = function(): void {
		while (this.firstChild) {
			this.removeChild(this.firstChild);
		}
	};
}

// Mock TFile
export function createMockTFile(path: string, basename?: string): TFile {
	return {
		path,
		name: path.split('/').pop() || path,
		basename: basename || path.split('/').pop()?.replace(/\.[^/.]+$/, '') || path,
		extension: path.split('.').pop() || '',
		stat: {
			size: 100,
			ctime: Date.now(),
			mtime: Date.now(),
		},
		vault: {} as any,
		parent: null,
	} as TFile;
}

// Mock BasesEntry
export function createMockBasesEntry(
	file: TFile,
	properties: Record<string, any> = {}
): BasesEntry {
	const entry = {
		file,
		getValue: (propertyId: BasesPropertyId) => {
			return properties[propertyId] ?? null;
		},
		getProperty: (propertyId: BasesPropertyId) => {
			return properties[propertyId] ?? null;
		},
	} as BasesEntry;

	return entry;
}

// Mock QueryController
export function createMockQueryController(
	entries: BasesEntry[] = [],
	properties: BasesPropertyId[] = []
): QueryController {
	const controller = {
		data: {
			data: entries,
		},
		allProperties: properties,
		config: {
			getAsPropertyId: (key: string): BasesPropertyId | null => {
				return null;
			},
		},
	} as unknown as QueryController;
	return controller;
}

// Mock function type
export interface MockFn {
	(...args: any[]): any;
	calls: any[][];
	reset(): void;
}

// Create a mock function
export function createMockFn(): MockFn {
	const calls: any[][] = [];
	const fn = function(...args: any[]) {
		calls.push(args);
		return Promise.resolve();
	} as MockFn;
	fn.calls = calls;
	fn.reset = () => {
		calls.length = 0;
	};
	return fn;
}

// Mock App
export function createMockApp(): App & { 
	workspace: { openLinkText: MockFn };
	fileManager: { processFrontMatter: MockFn };
} {
	const openLinkText = createMockFn();
	const processFrontMatter = createMockFn();

	return {
		workspace: {
			openLinkText,
		} as any,
		fileManager: {
			processFrontMatter,
		} as any,
	} as any;
}

// Mock Sortable
export class MockSortable {
	public destroyed = false;
	public options: any;
	public element: HTMLElement;

	constructor(element: HTMLElement, options: any) {
		this.element = element;
		this.options = options;
	}

	destroy(): void {
		this.destroyed = true;
	}
}

// Mock Sortable module
export function mockSortable() {
	const instances: MockSortable[] = [];
	
	const SortableConstructor = (element: HTMLElement, options: any) => {
		const instance = new MockSortable(element, options);
		instances.push(instance);
		return instance as any;
	};

	return {
		Sortable: SortableConstructor,
		instances,
		getInstances: () => {
			return instances;
		},
	};
}

// Helper to create DOM element (Obsidian methods are now on prototype)
export function createDivWithMethods(parent?: HTMLElement): HTMLElement {
	const div = document.createElement('div');
	if (parent) {
		parent.appendChild(div);
	}
	return div;
}

// Helper to simulate drag and drop event
export function createMockSortableEvent(
	item: HTMLElement,
	from: HTMLElement,
	to: HTMLElement,
	oldIndex: number = 0,
	newIndex: number = 0
): any {
	return {
		item,
		from,
		to,
		oldIndex,
		newIndex,
	};
}

// Helper to find closest element
export function addClosestPolyfill(element: HTMLElement): void {
	if (!element.closest) {
		element.closest = function(selector: string): HTMLElement | null {
			let el: HTMLElement | null = this;
			while (el) {
				if (el.matches && el.matches(selector)) {
					return el;
				}
				el = el.parentElement;
			}
			return null;
		};
	}
}

// Setup function to initialize test environment
export function setupTestEnvironment(): void {
	// DOM is already set up at module level, but ensure it's available
	if (typeof document === 'undefined') {
		const newDom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
		(global as any).document = newDom.window.document;
		(global as any).window = newDom.window;
		(global as any).HTMLElement = newDom.window.HTMLElement;
	}
}

// Helper to set up KanbanView with app access
export function setupKanbanViewWithApp(view: any, app: App): void {
	// BasesView has an app property that needs to be set
	(view as any).app = app;
}

// Helper to create a fully set up KanbanView (for convenience in tests)
// Note: KanbanView should be imported dynamically in test files using dynamic import
export function createKanbanViewWithApp(
	KanbanView: any,
	controller: QueryController,
	scrollEl: HTMLElement,
	app: App
): any {
	const view = new KanbanView(controller, scrollEl);
	setupKanbanViewWithApp(view, app);
	return view;
}


