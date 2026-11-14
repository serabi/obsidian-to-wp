/**
 * Plugin settings interface, defaults, and settings tab
 */

import { App, PluginSettingTab, Setting, Notice, normalizePath } from "obsidian";
import type SyncForWordPress from "./main";
import { FolderSuggest } from "./ui/folder-suggest";
import type { PluginSettings, PostStatus } from "./types";

/** Default plugin settings */
export const DEFAULT_SETTINGS: PluginSettings = {
	siteUrl: "",
	username: "",
	applicationPassword: "",
	publishableFolder: "",
	defaultPostStatus: "draft",
	uploadImages: true,
	createTemplate: false,
};

/** Settings tab UI for the plugin */
export class SettingsTab extends PluginSettingTab {
	plugin: SyncForWordPress;

	constructor(app: App, plugin: SyncForWordPress) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Site URL")
			.setDesc("Your WordPress site address, for example https://example.com.")
			.addText((text) =>
				text
					.setPlaceholder("https://example.com")
					.setValue(this.plugin.settings.siteUrl)
					.onChange(async (value) => {
						this.plugin.settings.siteUrl = value.replace(/\/+$/, "");
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Username")
			.setDesc("Your WordPress username, not your email address.")
			.addText((text) =>
				text
					.setPlaceholder("admin")
					.setValue(this.plugin.settings.username)
					.onChange(async (value) => {
						this.plugin.settings.username = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Application password")
			.setDesc(
				"Create one in WordPress under Users → Profile → Application passwords."
			)
			.addText((text) => {
				text
					.setPlaceholder("xxxx xxxx xxxx xxxx xxxx xxxx")
					.setValue(this.plugin.settings.applicationPassword)
					.onChange(async (value) => {
						this.plugin.settings.applicationPassword = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.type = "password";
			});

		new Setting(containerEl)
			.setName("Test connection")
			.setDesc("Check that the plugin can sign in to your site.")
			.addButton((button) =>
				button.setButtonText("Test").onClick(async () => {
					button.setDisabled(true);
					button.setButtonText("Testing...");
					try {
						const result = await this.plugin.wordpressClient.testConnection();
						if (result.success) {
							new Notice(`Connection successful! Logged in as: ${result.username}`);
						} else {
							new Notice(`Connection failed: ${result.error}`);
						}
					} catch (error) {
						new Notice(`Connection error: ${error instanceof Error ? error.message : "Unknown error"}`);
					} finally {
						button.setDisabled(false);
						button.setButtonText("Test");
					}
				})
			);

		new Setting(containerEl).setName("Publishing").setHeading();

		new Setting(containerEl)
			.setName("Publishable folder")
			.setDesc("Only notes in this folder and its subfolders can be published. Leave empty to allow all notes.")
			.addSearch((search) => {
				new FolderSuggest(this.app, search.inputEl);
				search
					.setPlaceholder("Blog/Posts")
					.setValue(this.plugin.settings.publishableFolder)
					.onChange(async (value) => {
						const trimmed = value.trim();
						this.plugin.settings.publishableFolder = trimmed ? normalizePath(trimmed) : "";
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Create template file")
			.setDesc("Add a Template.md file with the supported properties to the publishable folder.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.createTemplate)
					.onChange(async (value) => {
						this.plugin.settings.createTemplate = value;
						await this.plugin.saveSettings();

						if (value && this.plugin.settings.publishableFolder) {
							await this.createTemplateFile(this.plugin.settings.publishableFolder);
						}
					})
			);

		new Setting(containerEl)
			.setName("Default post status")
			.setDesc("Used when a note has no status property.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("draft", "Draft")
					.addOption("publish", "Published")
					.addOption("private", "Private")
					.setValue(this.plugin.settings.defaultPostStatus)
					.onChange(async (value) => {
						this.plugin.settings.defaultPostStatus = value as PostStatus;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Upload images")
			.setDesc("Upload images from your vault to the WordPress media library.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.uploadImages)
					.onChange(async (value) => {
						this.plugin.settings.uploadImages = value;
						await this.plugin.saveSettings();
					})
			);
	}

	private async createTemplateFile(folderPath: string): Promise<void> {
		const templatePath = normalizePath(`${folderPath}/Template.md`);

		const existingFile = this.app.vault.getAbstractFileByPath(templatePath);
		if (existingFile) {
			return;
		}

		const templateContent = `---
title: Post Title
slug: post-slug
status: draft
categories:
  - Category 1
tags:
  - tag1
  - tag2
excerpt: A brief summary of your post
---

# Your Post Title

Write your content here.

## Section Heading

Your content goes here.
`;

		try {
			await this.app.vault.create(templatePath, templateContent);
			new Notice(`Template created: ${templatePath}`);
		} catch (error) {
			new Notice(`Failed to create template: ${error instanceof Error ? error.message : "Unknown error"}`);
		}
	}
}
