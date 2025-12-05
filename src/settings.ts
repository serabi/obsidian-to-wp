/**
 * Plugin settings interface, defaults, and settings tab
 */

import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import type ObsidianToWordPress from "./main";
import type { PluginSettings, PostStatus } from "./types";

/** Default plugin settings */
export const DEFAULT_SETTINGS: PluginSettings = {
	siteUrl: "",
	username: "",
	applicationPassword: "",
	publishableFolder: "",
	defaultPostStatus: "draft",
	uploadImages: true,
};

/** Settings tab UI for the plugin */
export class SettingsTab extends PluginSettingTab {
	plugin: ObsidianToWordPress;

	constructor(app: App, plugin: ObsidianToWordPress) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "WordPress connection" });

		new Setting(containerEl)
			.setName("Site URL")
			.setDesc("Your WordPress site URL (e.g., https://example.com)")
			.addText((text) =>
				text
					.setPlaceholder("https://example.com")
					.setValue(this.plugin.settings.siteUrl)
					.onChange(async (value) => {
						// Normalize URL: remove trailing slash
						this.plugin.settings.siteUrl = value.replace(/\/+$/, "");
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Username")
			.setDesc("Your WordPress username")
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
				"Generate an Application Password in WordPress under Users > Profile > Application Passwords"
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
			.setDesc("Verify your WordPress credentials are working")
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

		containerEl.createEl("h2", { text: "Publishing options" });

		new Setting(containerEl)
			.setName("Publishable folder")
			.setDesc(
				"Only notes in this folder (and subfolders) can be published. Leave empty to allow all notes."
			)
			.addText((text) =>
				text
					.setPlaceholder("Blog/Posts")
					.setValue(this.plugin.settings.publishableFolder)
					.onChange(async (value) => {
						this.plugin.settings.publishableFolder = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Default post status")
			.setDesc("Default status for new posts (can be overridden per-post via frontmatter)")
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
			.setDesc("Automatically upload local images to WordPress media library")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.uploadImages)
					.onChange(async (value) => {
						this.plugin.settings.uploadImages = value;
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("h2", { text: "Frontmatter reference" });

		const frontmatterDesc = containerEl.createEl("div", {
			cls: "setting-item-description",
		});
		frontmatterDesc.innerHTML = `
			<p>Use these frontmatter fields to control post properties:</p>
			<ul>
				<li><code>title</code> - Post title (defaults to note filename)</li>
				<li><code>slug</code> - URL slug/permalink</li>
				<li><code>status</code> - Post status: draft, publish, private, or future</li>
				<li><code>categories</code> - List of category names</li>
				<li><code>tags</code> - List of tag names</li>
				<li><code>excerpt</code> - Post excerpt/summary</li>
				<li><code>date</code> - Scheduled publish date (ISO 8601, e.g., 2024-12-25T10:00:00)</li>
				<li><code>wp_post_id</code> - WordPress post ID (auto-set after first publish)</li>
			</ul>
			<p>Example:</p>
			<pre>---
title: My Blog Post
slug: my-blog-post
status: draft
categories:
  - Technology
  - Tutorials
tags:
  - obsidian
  - wordpress
excerpt: A short summary of my post
date: 2024-12-25T10:00:00
---</pre>
		`;
	}
}

