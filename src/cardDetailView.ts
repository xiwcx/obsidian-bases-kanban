import type { TFile } from 'obsidian';
import { ItemView, MarkdownRenderer, WorkspaceLeaf, setIcon } from 'obsidian';
import { CSS_CLASSES, VIEW_TYPE_CARD_DETAIL } from './constants.ts';

/**
 * Card Detail Side Panel
 *
 * A right-sidebar ItemView that renders a card's note content when the user
 * clicks a Kanban card. Behaves like Jira's issue detail panel: the board
 * stays focused and a persistent panel shows the full note on the right.
 *
 * Single-click a card → opens here.
 * Cmd/Ctrl-click a card → opens in a new tab as before.
 * The "↗" button in the panel header opens the note in the main editor.
 */
export class CardDetailView extends ItemView {
	private currentFile: TFile | null = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_CARD_DETAIL;
	}

	getDisplayText(): string {
		return this.currentFile?.basename ?? 'Card Detail';
	}

	getIcon(): string {
		return 'file-text';
	}

	async onOpen(): Promise<void> {
		this.renderPlaceholder();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
		this.currentFile = null;
	}

	private renderPlaceholder(): void {
		this.contentEl.empty();
		this.contentEl.addClass(CSS_CLASSES.DETAIL_VIEW);
		const placeholder = this.contentEl.createDiv({ cls: CSS_CLASSES.DETAIL_PLACEHOLDER });
		placeholder.createSpan({ text: 'Click a card to preview it here' });
	}

	/**
	 * Load a new file into the panel. Called by KanbanView on card click.
	 * Re-renders the header, properties, and note body each time.
	 */
	async openFile(file: TFile): Promise<void> {
		this.currentFile = file;
		this.contentEl.empty();
		this.contentEl.addClass(CSS_CLASSES.DETAIL_VIEW);

		// ── Header ──────────────────────────────────────────────────────────
		const headerEl = this.contentEl.createDiv({ cls: CSS_CLASSES.DETAIL_HEADER });

		headerEl.createDiv({ text: file.basename, cls: CSS_CLASSES.DETAIL_TITLE });

		const actionsEl = headerEl.createDiv({ cls: CSS_CLASSES.DETAIL_ACTIONS });
		const openBtn = actionsEl.createEl('button', { cls: CSS_CLASSES.DETAIL_OPEN_BTN });
		setIcon(openBtn, 'arrow-up-right');
		openBtn.setAttribute('aria-label', 'Open in editor');
		openBtn.addEventListener('click', () => {
			void this.app.workspace.openLinkText(file.path, '', false);
		});

		// ── Frontmatter properties ───────────────────────────────────────────
		const cache = this.app.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter;
		if (frontmatter) {
			const entries = Object.entries(frontmatter).filter(([key]) => key !== 'position');
			if (entries.length > 0) {
				const propsEl = this.contentEl.createDiv({ cls: CSS_CLASSES.DETAIL_PROPERTIES });
				for (const [key, value] of entries) {
					const rowEl = propsEl.createDiv({ cls: CSS_CLASSES.DETAIL_PROPERTY_ROW });
					rowEl.createSpan({ text: key, cls: CSS_CLASSES.DETAIL_PROPERTY_KEY });
					const display = Array.isArray(value)
						? value.join(', ')
						: value === null || value === undefined
							? '—'
							: String(value);
					rowEl.createSpan({ text: display, cls: CSS_CLASSES.DETAIL_PROPERTY_VALUE });
				}
			}
		}

		// ── Divider ──────────────────────────────────────────────────────────
		this.contentEl.createEl('hr', { cls: CSS_CLASSES.DETAIL_DIVIDER });

		// ── Note body ────────────────────────────────────────────────────────
		const bodyEl = this.contentEl.createDiv({ cls: CSS_CLASSES.DETAIL_BODY });
		const raw = await this.app.vault.read(file);

		// Strip the YAML frontmatter block before rendering so it isn't doubled
		// with the property list above. Matches both `---\n...\n---` and
		// `---\n...\n---\n` at the very start of the file.
		const bodyContent = raw.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();

		if (bodyContent) {
			await MarkdownRenderer.render(this.app, bodyContent, bodyEl, file.path, this);
		} else {
			bodyEl.createDiv({ text: 'No content', cls: CSS_CLASSES.DETAIL_EMPTY });
		}
	}
}
