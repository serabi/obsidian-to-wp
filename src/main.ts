/**
 * Obsidian to WordPress Plugin
 * Publishes Obsidian notes to WordPress as Gutenberg block-formatted posts
 */

import { Plugin, TFile, Menu, Notice, TAbstractFile, Modal, TFolder, normalizePath } from "obsidian";
import type { PluginSettings } from "./types";
import { DEFAULT_SETTINGS, SettingsTab } from "./settings";
import { WordPressClient } from "./wordpress-client";
import { Publisher } from "./publisher";

export default class ObsidianToWordPress extends Plugin {
	settings!: PluginSettings;
	wordpressClient!: WordPressClient;
	private publisher!: Publisher;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.wordpressClient = new WordPressClient(() => this.settings);
		this.publisher = new Publisher(
			this.app,
			() => this.settings,
			this.wordpressClient
		);

		this.addCommand({
			id: "publish-to-wordpress",
			name: "Publish current note to WordPress",
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (file && this.publisher.isPublishable(file)) {
					if (!checking) {
						this.publishCurrentNote();
					}
					return true;
				}
				return false;
			},
		});

		this.addCommand({
			id: "publish-to-wordpress-draft",
			name: "Publish current note to WordPress as draft",
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (file && this.publisher.isPublishable(file)) {
					if (!checking) {
						this.publishCurrentNoteAsDraft();
					}
					return true;
				}
				return false;
			},
		});

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu: Menu, file: TAbstractFile) => {
				if (file instanceof TFile && this.publisher.isPublishable(file)) {
					menu.addItem((item) => {
						item
							.setTitle("Publish to WordPress")
							.setIcon("upload")
							.onClick(async () => {
								await this.publishFile(file);
							});
					});
				}
			})
		);

		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu: Menu) => {
				const file = this.app.workspace.getActiveFile();
				if (file && this.publisher.isPublishable(file)) {
					menu.addItem((item) => {
						item
							.setTitle("Publish to WordPress")
							.setIcon("upload")
							.onClick(async () => {
								await this.publishFile(file);
							});
					});
				}
			})
		);

		this.addSettingTab(new SettingsTab(this.app, this));

		this.addRibbonIcon("cloud-upload", "WordPress Publishing", (evt: MouseEvent) => {
			const menu = new Menu();
			const file = this.app.workspace.getActiveFile();
			const canPublish = file && this.publisher.isPublishable(file);

			menu.addItem((item) => {
				item
					.setTitle("Publish current note")
					.setIcon("upload")
					.setDisabled(!canPublish)
					.onClick(() => this.publishCurrentNote());
			});

			menu.addItem((item) => {
				item
					.setTitle("Publish as draft")
					.setIcon("file-edit")
					.setDisabled(!canPublish)
					.onClick(() => this.publishCurrentNoteAsDraft());
			});

			menu.addSeparator();

			menu.addItem((item) => {
				item
					.setTitle("Open settings")
					.setIcon("settings")
					.onClick(() => {
						const setting = (this.app as any).setting;
						setting.open();
						setting.openTabById(this.manifest.id);
					});
			});

			menu.showAtMouseEvent(evt);
		});
	}

	onunload(): void {
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private async publishCurrentNote(): Promise<void> {
		const file = this.app.workspace.getActiveFile();
		if (!file) {
			new Notice("No active file to publish");
			return;
		}
		await this.publishFile(file);
	}

	private async publishCurrentNoteAsDraft(): Promise<void> {
		const file = this.app.workspace.getActiveFile();
		if (!file) {
			new Notice("No active file to publish");
			return;
		}

		const originalStatus = this.settings.defaultPostStatus;
		this.settings.defaultPostStatus = "draft";
		
		try {
			await this.publishFile(file);
		} finally {
			this.settings.defaultPostStatus = originalStatus;
		}
	}

	private async publishFile(file: TFile): Promise<void> {
		const folderMissing = await this.checkPublishableFolder();
		if (folderMissing) {
			return;
		}

		if (!this.publisher.isPublishable(file)) {
			new Notice(`Cannot publish: File is not in the publishable folder`);
			return;
		}

		new Notice(`Publishing ${file.basename}...`);

		const result = await this.publisher.publish(file);

		if (result.success && result.postUrl) {
			new Notice(`Published successfully! Post URL: ${result.postUrl}`, 5000);
		}
	}

	private async checkPublishableFolder(): Promise<boolean> {
		const folderPath = this.settings.publishableFolder;
		if (!folderPath) {
			return false;
		}

		const folder = this.app.vault.getAbstractFileByPath(normalizePath(folderPath));
		if (folder instanceof TFolder) {
			return false;
		}

		return new Promise((resolve) => {
			new MissingFolderModal(this.app, folderPath, async (create) => {
				if (create) {
					try {
						await this.app.vault.createFolder(folderPath);
						new Notice(`Created folder: ${folderPath}`);
						resolve(false);
					} catch (error) {
						new Notice(`Failed to create folder: ${error instanceof Error ? error.message : "Unknown error"}`);
						resolve(true);
					}
				} else {
					resolve(true);
				}
			}).open();
		});
	}
}

class MissingFolderModal extends Modal {
	private folderPath: string;
	private onResult: (create: boolean) => void;

	constructor(app: any, folderPath: string, onResult: (create: boolean) => void) {
		super(app);
		this.folderPath = folderPath;
		this.onResult = onResult;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h3", { text: "Publishable folder not found" });
		contentEl.createEl("p", {
			text: `The configured publishable folder "${this.folderPath}" does not exist.`,
		});

		const buttonContainer = contentEl.createEl("div", {
			attr: { style: "display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px;" },
		});

		buttonContainer.createEl("button", { text: "Cancel" }).addEventListener("click", () => {
			this.close();
			this.onResult(false);
		});

		const createButton = buttonContainer.createEl("button", {
			text: "Create folder",
			cls: "mod-cta",
		});
		createButton.addEventListener("click", () => {
			this.close();
			this.onResult(true);
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}

