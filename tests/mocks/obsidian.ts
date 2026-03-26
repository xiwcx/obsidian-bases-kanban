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
