/**
 * Obsidian to WordPress Plugin
 * Publishes Obsidian notes to WordPress as Gutenberg block-formatted posts
 */

import { Plugin, TFile, Menu, Notice, TAbstractFile } from "obsidian";
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
}

