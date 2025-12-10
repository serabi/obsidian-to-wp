/**
 * Obsidian to WordPress Plugin
 * Publishes Obsidian notes to WordPress as Gutenberg block-formatted posts
 */

import { Plugin, TFile, Menu, Notice, TAbstractFile, normalizePath, TFolder } from "obsidian";
import type { PluginSettings, PostStatus } from "./types";
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

		this.addCommand({
			id: "create-wordpress-draft-note",
			name: "Create WordPress draft note",
			callback: () => this.createDraftNote(),
		});

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu: Menu, file: TAbstractFile) => {
				if (file instanceof TFile && this.publisher.isPublishable(file)) {
					menu.addItem((item) => {
						item
							.setTitle("Publish to WordPress")
							.setIcon("upload")
							.onClick(async () => {
								await this.publishFile(file, "publish");
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
								await this.publishFile(file, "publish");
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
		await this.publishFile(file, "publish");
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
		if (!this.publisher.isPublishable(file)) {
			new Notice(`Cannot publish: File is not in the publishable folder`);
			return;
		}

		new Notice(`Publishing ${file.basename}...`);
		
		const result = await this.publisher.publish(file, overrideStatus);
		
		if (result.success && result.postUrl) {
			new Notice(`Published successfully! Post URL: ${result.postUrl}`, 5000);
		}
	}

	private async createDraftNote(): Promise<void> {
		const publishFolder = this.settings.publishableFolder ? normalizePath(this.settings.publishableFolder) : "";
		
		let baseFolder = this.app.vault.getRoot().path || "/";

		if (publishFolder) {
			const target = this.app.vault.getAbstractFileByPath(publishFolder);
			if (!target) {
				try {
					await this.app.vault.createFolder(publishFolder);
				} catch (error) {
					const message = error instanceof Error ? error.message : "Unknown error";
					new Notice(`Failed to create folder: ${message}`);
					return;
				}
			} else if (!(target instanceof TFolder)) {
				new Notice(`Publishable folder path is not a folder: ${publishFolder}`);
				return;
			}
			baseFolder = publishFolder;
		}

		const timestamp = new Date();
		const parts = [
			timestamp.getFullYear(),
			String(timestamp.getMonth() + 1).padStart(2, "0"),
			String(timestamp.getDate()).padStart(2, "0"),
			String(timestamp.getHours()).padStart(2, "0"),
			String(timestamp.getMinutes()).padStart(2, "0"),
			String(timestamp.getSeconds()).padStart(2, "0"),
		];
		const baseName = `draft-${parts.join("")}.md`;

		let targetPath = publishFolder ? normalizePath(`${baseFolder}/${baseName}`) : baseName;
		let counter = 1;
		while (this.app.vault.getAbstractFileByPath(targetPath)) {
			const suffix = `-${counter}`;
			const name = baseName.replace(/\.md$/, `${suffix}.md`);
			targetPath = publishFolder ? normalizePath(`${baseFolder}/${name}`) : name;
			counter += 1;
		}

		const title = "Draft title";
		const content = `---
title: ${title}
slug: 
status: draft
categories:
  - 
tags:
  - 
excerpt: 
date: 
---

# ${title}
`;

		try {
			const file = await this.app.vault.create(targetPath, content);
			await this.app.workspace.getLeaf(true).openFile(file);
			new Notice(`Draft created: ${file.path}`);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			new Notice(`Failed to create draft: ${message}`);
		}
	}
}


