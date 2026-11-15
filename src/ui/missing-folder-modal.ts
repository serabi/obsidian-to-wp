import { App, Modal } from "obsidian";

export class MissingFolderModal extends Modal {
	private folderPath: string;
	private onResult: (create: boolean) => void;
	private create = false;

	constructor(app: App, folderPath: string, onResult: (create: boolean) => void) {
		super(app);
		this.folderPath = folderPath;
		this.onResult = onResult;
	}

	onOpen(): void {
		const { contentEl } = this;
		this.setTitle("Publishable folder not found");
		contentEl.createEl("p", {
			text: `The publishable folder "${this.folderPath}" does not exist.`,
		});

		const buttons = contentEl.createDiv({ cls: "modal-button-container" });
		buttons.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
		buttons
			.createEl("button", { text: "Create folder", cls: "mod-cta" })
			.addEventListener("click", () => {
				this.create = true;
				this.close();
			});
	}

	onClose(): void {
		this.contentEl.empty();
		this.onResult(this.create);
	}
}
