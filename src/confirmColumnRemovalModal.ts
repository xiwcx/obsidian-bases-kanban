import type { App } from 'obsidian';
import { Modal } from 'obsidian';
import { CSS_CLASSES } from './constants.ts';

export class ConfirmColumnRemovalModal extends Modal {
	constructor(
		app: App,
		private readonly columnValue: string,
		private readonly onConfirm: () => void,
		private readonly onDismiss: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle('Remove column?');
		this.modalEl.classList.add(CSS_CLASSES.COLUMN_REMOVE_DIALOG);
		this.contentEl.createEl('p', {
			text: `Remove “${this.columnValue}” from this view's saved column order? This also affects notes that embed this view. No notes will be deleted.`,
		});
		const actions = this.contentEl.createDiv({ cls: 'modal-button-container' });
		const cancel = actions.createEl('button', {
			text: 'Cancel',
			cls: CSS_CLASSES.COLUMN_REMOVE_CANCEL,
			attr: { type: 'button' },
		});
		const confirm = actions.createEl('button', {
			text: 'Remove column',
			cls: [CSS_CLASSES.COLUMN_REMOVE_CONFIRM, 'mod-warning'],
			attr: { type: 'button' },
		});
		cancel.addEventListener('click', () => this.close());
		confirm.addEventListener('click', () => {
			confirm.disabled = true;
			this.close();
			this.onConfirm();
		});
		// Enter should not accidentally approve a destructive action.
		cancel.focus();
	}

	onClose(): void {
		this.contentEl.empty();
		this.onDismiss();
	}
}
