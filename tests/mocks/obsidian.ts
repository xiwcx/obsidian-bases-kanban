// Mock obsidian module for testing
// This provides the minimal interface needed for tests

export type BasesPropertyId = string;
export type ViewOption = any;

export interface TFile {
	path: string;
	name: string;
	basename: string;
	extension: string;
	stat: {
		size: number;
		ctime: number;
		mtime: number;
	};
	vault: any;
	parent: any;
}

export interface BasesEntry {
	file: TFile;
	getValue(propertyId: BasesPropertyId): any;
	getProperty(propertyId: BasesPropertyId): any;
}

export interface QueryController {
	data: {
		data: BasesEntry[];
	};
	allProperties: BasesPropertyId[];
	config: {
		getAsPropertyId(key: string): BasesPropertyId | null;
		getOrder(): BasesPropertyId[];
		getDisplayName(propertyId: BasesPropertyId): string;
	};
	app?: App;
}

export interface App {
	workspace: {
		openLinkText(path: string, source: string, newLeaf: boolean): void;
	};
	fileManager: {
		processFrontMatter(file: TFile, fn: (frontmatter: any) => void | Promise<void>): Promise<void>;
	};
}

export abstract class BasesView {
	app?: App;
	data?: {
		data: BasesEntry[];
	};
	allProperties?: BasesPropertyId[];
	config?: {
		getAsPropertyId(key: string): BasesPropertyId | null;
		getOrder(): BasesPropertyId[];
		getDisplayName(propertyId: BasesPropertyId): string;
	};

	constructor(controller: QueryController) {
		this.app = controller.app;
		this.data = controller.data;
		this.allProperties = controller.allProperties;
		this.config = controller.config;
	}

	abstract onDataUpdated(): void;
	onClose?(): void;
}

export class Plugin {
	app: App;
	manifest: any;

	constructor(app: App, manifest: any) {
		this.app = app;
		this.manifest = manifest;
	}

	async onload(): Promise<void> {}
	onunload(): void {}

	registerBasesView?(viewType: string, options: any): void {
		// Mock implementation
	}
}

export function setIcon(parent: HTMLElement, iconId: string): void {
	while (parent.firstChild) parent.removeChild(parent.firstChild);
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('data-icon', iconId);
	parent.appendChild(svg);
}

// Value type hierarchy mocks
//
// Source: https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts
// All classes @since 1.10.0. Check that file for drift when upgrading obsidian devDependency.
//
// Hierarchy reproduced here:
//   Value
//     NotNullValue
//       PrimitiveValue<T>
//         StringValue  → HTMLValue, LinkValue, TagValue, UrlValue, IconValue, ImageValue
//         NumberValue
//         BooleanValue
//       ListValue
//     NullValue

export abstract class Value {
	abstract toString(): string;
	abstract isTruthy(): boolean;
}

export abstract class NotNullValue extends Value {}

export class NullValue extends Value {
	toString() {
		return '';
	}
	isTruthy() {
		return false;
	}
}

export abstract class PrimitiveValue<T> extends NotNullValue {
	constructor(protected value: T) {
		super();
	}
	toString() {
		return String(this.value);
	}
	isTruthy() {
		return !!this.value;
	}
}

export class StringValue extends PrimitiveValue<string> {}

// Wraps an HTML string produced by the html("") formula function.
// Real class: HTMLValue extends StringValue — toString() returns the raw HTML string.
export class HTMLValue extends StringValue {}

// Wraps a wikilink string such as "[[Note Name]]".
// Real class: LinkValue extends StringValue — includes static parseFromString().
export class LinkValue extends StringValue {}

export class TagValue extends StringValue {}
export class UrlValue extends StringValue {}
export class IconValue extends StringValue {}
export class ImageValue extends StringValue {}

export class NumberValue extends PrimitiveValue<number> {}
export class BooleanValue extends PrimitiveValue<boolean> {}

// Real class: DateValue extends NotNullValue — toString() returns ISO string.
export class DateValue extends NotNullValue {
	constructor(private date: Date) {
		super();
	}
	toString() {
		return this.date.toISOString().split('T')[0];
	}
	isTruthy() {
		return true;
	}
}

// Real class: ListValue extends NotNullValue
// API surface used: length(), get(index) → Value, toString() → comma-separated string
export class ListValue extends NotNullValue {
	private items: Value[];
	constructor(items: Value[]) {
		super();
		this.items = items;
	}
	toString() {
		return this.items.map((i) => i.toString()).join(', ');
	}
	isTruthy() {
		return this.items.length > 0;
	}
	length() {
		return this.items.length;
	}
	get(index: number): Value {
		return this.items[index] ?? new NullValue();
	}
}

// Source: sanitizeHTMLToDom — https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts
// Real impl sanitizes the string through Obsidian's DOMPurify instance before parsing.
// This mock uses innerHTML directly — safe enough for tests since we control all input.
export function sanitizeHTMLToDom(html: string): DocumentFragment {
	const fragment = document.createDocumentFragment();
	const div = document.createElement('div');
	div.innerHTML = html;
	while (div.firstChild) fragment.appendChild(div.firstChild);
	return fragment;
}

export class MarkdownRenderer {
	static render(
		_app: unknown,
		markdown: string,
		el: HTMLElement,
		_sourcePath: string,
		_component: unknown,
	): Promise<void> {
		const p = document.createElement('p');
		p.innerHTML = markdown.replace(/\[\[([^\]]+)\]\]/g, (_, target: string) => {
			const escaped = target.replace(/"/g, '&quot;');
			return `<a class="internal-link" data-href="${escaped}" href="${escaped}">${target}</a>`;
		});
		el.appendChild(p);
		return Promise.resolve();
	}
}

export class Keymap {
	static isModEvent(evt?: { ctrlKey?: boolean; metaKey?: boolean } | null): boolean {
		return !!(evt?.ctrlKey || evt?.metaKey);
	}
}

export function parsePropertyId(propertyId: BasesPropertyId): { name: string; source?: string } {
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
