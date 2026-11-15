import { Plugin, TFile, Menu, Notice, TAbstractFile, TFolder, normalizePath } from "obsidian";
import type { PluginSettings, PostStatus } from "./types";
import { DEFAULT_SETTINGS, SettingsTab } from "./settings";
import { WordPressClient } from "./wordpress-client";
import { Publisher } from "./publisher";
import { MissingFolderModal } from "./ui/missing-folder-modal";

const LEGACY_PASSWORD_SECRET = "sync-for-wordpress-password";

export default class SyncForWordPress extends Plugin {
	settings!: PluginSettings;
	wordpressClient!: WordPressClient;
	private publisher!: Publisher;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.wordpressClient = new WordPressClient(this.app, () => this.settings);
		this.publisher = new Publisher(
			this.app,
			() => this.settings,
			() => this.saveSettings(),
			this.wordpressClient
		);

		this.addCommand({
			id: "publish-current-note",
			name: "Publish current note",
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (file && this.publisher.isPublishable(file)) {
					if (!checking) {
						void this.publishCurrentNote();
					}
					return true;
				}
				return false;
			},
		});

		this.addCommand({
			id: "publish-current-note-as-draft",
			name: "Publish current note as draft",
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (file && this.publisher.isPublishable(file)) {
					if (!checking) {
						void this.publishCurrentNoteAsDraft();
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

		this.addRibbonIcon("cloud-upload", "WordPress publishing", (evt: MouseEvent) => {
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
						// ponytail: app.setting is not public API, but there is no public way to open a plugin's tab
						const setting = (this.app as unknown as {
							setting: { open(): void; openTabById(id: string): void };
						}).setting;
						setting.open();
						setting.openTabById(this.manifest.id);
					});
			});

			menu.showAtMouseEvent(evt);
		});
	}

	async loadSettings(): Promise<void> {
		const { applicationPassword: legacyPassword, ...saved } =
			((await this.loadData()) ?? {}) as Partial<PluginSettings> & { applicationPassword?: string };
		this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
		if (legacyPassword === undefined) return;
		if (legacyPassword && !this.settings.applicationPasswordSecret) {
			this.app.secretStorage.setSecret(LEGACY_PASSWORD_SECRET, legacyPassword);
			this.settings.applicationPasswordSecret = LEGACY_PASSWORD_SECRET;
		}
		await this.saveSettings();
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

		await this.publishFile(file, "draft");
	}

	private async publishFile(file: TFile, overrideStatus?: PostStatus): Promise<void> {
		const folderMissing = await this.checkPublishableFolder();
		if (folderMissing) {
			return;
		}

		new Notice(`Publishing ${file.basename}...`);
		await this.publisher.publish(file, overrideStatus);
	}

	private async checkPublishableFolder(): Promise<boolean> {
		const folderPath = this.settings.publishableFolder;
		if (!folderPath) {
			return false;
		}

		const normalized = normalizePath(folderPath);
		if (this.app.vault.getAbstractFileByPath(normalized) instanceof TFolder) {
			return false;
		}

		return new Promise((resolve) => {
			new MissingFolderModal(this.app, normalized, (create) => {
				if (!create) {
					resolve(true);
					return;
				}
				this.app.vault.createFolder(normalized).then(
					() => {
						new Notice(`Created folder: ${normalized}`);
						resolve(false);
					},
					(error: unknown) => {
						new Notice(`Failed to create folder: ${error instanceof Error ? error.message : "Unknown error"}`);
						resolve(true);
					},
				);
			}).open();
		});
	}
}
