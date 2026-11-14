import { App, TFile, Notice, normalizePath, getFrontMatterInfo, parseYaml } from "obsidian";
import type { PluginSettings, PublishResult, UploadedImage, WordPressPostPayload, PostStatus } from "./types";
import { WordPressClient } from "./wordpress-client";
import { MarkdownConverter } from "./markdown-converter";
import { normalizeFrontmatter, getTitle } from "./frontmatter";

/** MIME type mapping for common image extensions */
const MIME_TYPES: Record<string, string> = {
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".png": "image/png",
	".gif": "image/gif",
	".webp": "image/webp",
	".svg": "image/svg+xml",
};

export class Publisher {
	private markdownConverter = new MarkdownConverter();
	private inFlight = new Set<string>();

	constructor(
		private app: App,
		private getSettings: () => PluginSettings,
		private saveSettings: () => Promise<void>,
		private wordpressClient: WordPressClient
	) {}

	isPublishable(file: TFile): boolean {
		if (file.extension !== "md") {
			return false;
		}
		const folder = this.getSettings().publishableFolder;
		return !folder || file.path.startsWith(`${normalizePath(folder)}/`);
	}

	async publish(file: TFile, overrideStatus?: PostStatus): Promise<PublishResult> {
		const result = await this.publishOnce(file, overrideStatus);
		if (!result.success) {
			new Notice(`Publishing failed: ${result.error}`);
		}
		return result;
	}

	private async publishOnce(file: TFile, overrideStatus?: PostStatus): Promise<PublishResult> {
		const settings = this.getSettings();

		if (!this.wordpressClient.isConfigured()) {
			return { success: false, error: "WordPress connection is not set up. Check the plugin settings." };
		}
		if (!this.isPublishable(file)) {
			return { success: false, error: `This note is not in the publishable folder: ${settings.publishableFolder}` };
		}
		if (this.inFlight.has(file.path)) {
			return { success: false, error: "This note is already being published." };
		}

		this.inFlight.add(file.path);
		try {
			const content = await this.app.vault.read(file);
			const info = getFrontMatterInfo(content);
			const frontmatter = normalizeFrontmatter(info.exists ? parseYaml(info.frontmatter) : {});
			const body = content.slice(info.contentStart);
			const warnings: string[] = [];

			const imageMap = new Map<string, UploadedImage>();
			if (settings.uploadImages) {
				warnings.push(...await this.uploadImages(file, body, imageMap));
			}

			this.markdownConverter.setImageMap(imageMap);
			const status: PostStatus = overrideStatus ?? frontmatter.status ?? settings.defaultPostStatus;

			const payload: WordPressPostPayload = {
				title: getTitle(frontmatter, file.basename),
				content: this.markdownConverter.convert(body),
				status,
			};

			if (frontmatter.slug) {
				payload.slug = frontmatter.slug;
			}
			if (frontmatter.excerpt) {
				payload.excerpt = frontmatter.excerpt;
			}
			if (frontmatter.date) {
				payload.date = frontmatter.date;
			}

			if (frontmatter.categories?.length) {
				const { ids, failed } = await this.wordpressClient.resolveTermIds("categories", frontmatter.categories.map(String));
				payload.categories = ids;
				warnings.push(...failed.map((name) => `category "${name}"`));
			}
			if (frontmatter.tags?.length) {
				const { ids, failed } = await this.wordpressClient.resolveTermIds("tags", frontmatter.tags);
				payload.tags = ids;
				warnings.push(...failed.map((name) => `tag "${name}"`));
			}

			const post = frontmatter.wp_post_id
				? await this.wordpressClient.updatePost(frontmatter.wp_post_id, payload)
				: await this.wordpressClient.createPost(payload);

			await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
				fm.wp_post_id = post.id;
				fm.wp_post_url = post.link;
				fm.status = post.status;
			});

			new Notice(`${frontmatter.wp_post_id ? "Updated" : "Published"}: ${post.title.rendered}`);
			if (warnings.length > 0) {
				new Notice(`Skipped ${warnings.join(", ")}`, 8000);
			}

			return { success: true, postId: post.id, postUrl: post.link };
		} catch (error) {
			return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
		} finally {
			this.inFlight.delete(file.path);
		}
	}

	/** Uploads local images, reusing earlier uploads of unchanged files. Returns descriptions of skipped images. */
	private async uploadImages(file: TFile, content: string, imageMap: Map<string, UploadedImage>): Promise<string[]> {
		const settings = this.getSettings();
		const skipped: string[] = [];
		let cacheChanged = false;

		for (const ref of this.markdownConverter.extractImageReferences(content)) {
			if (imageMap.has(ref.path) || /^https?:\/\//.test(ref.path)) {
				continue;
			}

			const imageFile = this.app.vault.getAbstractFileByPath(this.resolveImagePath(file, ref.path));
			if (!(imageFile instanceof TFile)) {
				skipped.push(`missing image "${ref.path}"`);
				continue;
			}

			const mimeType = MIME_TYPES[`.${imageFile.extension.toLowerCase()}`];
			if (!mimeType) {
				skipped.push(`unsupported image "${ref.path}"`);
				continue;
			}

			const cacheKey = `${settings.siteUrl}|${imageFile.path}`;
			let cached = settings.mediaCache[cacheKey];
			if (!cached || cached.mtime !== imageFile.stat.mtime) {
				try {
					const data = await this.app.vault.readBinary(imageFile);
					const media = await this.wordpressClient.uploadMedia(imageFile.name, data, mimeType);
					cached = { id: media.id, url: media.source_url, mtime: imageFile.stat.mtime };
					settings.mediaCache[cacheKey] = cached;
					cacheChanged = true;
				} catch {
					skipped.push(`image "${ref.path}" (upload failed)`);
					continue;
				}
			}

			imageMap.set(ref.path, { localPath: ref.path, wordpressUrl: cached.url, mediaId: cached.id });
		}

		if (cacheChanged) {
			await this.saveSettings();
		}
		return skipped;
	}

	private resolveImagePath(file: TFile, imagePath: string): string {
		if (imagePath.startsWith("/")) {
			return normalizePath(imagePath.substring(1));
		}

		const linkedFile = this.app.metadataCache.getFirstLinkpathDest(
			imagePath,
			file.path
		);

		if (linkedFile) {
			return linkedFile.path;
		}

		const noteFolder = file.parent?.path || "";
		return normalizePath(`${noteFolder}/${imagePath}`);
	}
}


