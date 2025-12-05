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

		// Initialize WordPress client
		this.wordpressClient = new WordPressClient(() => this.settings);

		// Initialize publisher
		this.publisher = new Publisher(
			this.app,
			() => this.settings,
			this.wordpressClient
		);

		// Add command: Publish current note to WordPress
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

		// Add command: Publish current note as draft
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

		// Register file menu (right-click context menu in file explorer)
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

		// Register editor menu (right-click in editor)
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

		// Add settings tab
		this.addSettingTab(new SettingsTab(this.app, this));
	}

	onunload(): void {
		// Cleanup handled automatically by register* helpers
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/**
	 * Publish the currently active note
	 */
	private async publishCurrentNote(): Promise<void> {
		const file = this.app.workspace.getActiveFile();
		if (!file) {
			new Notice("No active file to publish");
			return;
		}
		await this.publishFile(file);
	}

	/**
	 * Publish the currently active note as a draft (override status)
	 */
	private async publishCurrentNoteAsDraft(): Promise<void> {
		const file = this.app.workspace.getActiveFile();
		if (!file) {
			new Notice("No active file to publish");
			return;
		}

		// Temporarily override default status
		const originalStatus = this.settings.defaultPostStatus;
		this.settings.defaultPostStatus = "draft";
		
		try {
			await this.publishFile(file);
		} finally {
			this.settings.defaultPostStatus = originalStatus;
		}
	}

	/**
	 * Publish a specific file
	 */
	private async publishFile(file: TFile): Promise<void> {
		if (!this.publisher.isPublishable(file)) {
			new Notice(`Cannot publish: File is not in the publishable folder`);
			return;
		}

		new Notice(`Publishing ${file.basename}...`);
		
		const result = await this.publisher.publish(file);
		
		if (result.success && result.postUrl) {
			// Offer to open the post in browser
			new Notice(`Published successfully! Click to view post.`, 5000);
		}
	}
}

