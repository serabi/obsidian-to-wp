/**
 * Main publishing logic - orchestrates conversion and WordPress API calls
 */

import { App, TFile, Notice, normalizePath } from "obsidian";
import type { PluginSettings, PublishResult, UploadedImage, WordPressPostPayload } from "./types";
import { WordPressClient } from "./wordpress-client";
import { MarkdownConverter } from "./markdown-converter";
import { parseFrontmatter, updateFrontmatter, getTitle } from "./frontmatter";

/** MIME type mapping for common image extensions */
const MIME_TYPES: Record<string, string> = {
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".png": "image/png",
	".gif": "image/gif",
	".webp": "image/webp",
	".svg": "image/svg+xml",
};

/**
 * Publisher class handles the full publishing workflow
 */
export class Publisher {
	private app: App;
	private getSettings: () => PluginSettings;
	private wordpressClient: WordPressClient;
	private markdownConverter: MarkdownConverter;

	constructor(
		app: App,
		getSettings: () => PluginSettings,
		wordpressClient: WordPressClient
	) {
		this.app = app;
		this.getSettings = getSettings;
		this.wordpressClient = wordpressClient;
		this.markdownConverter = new MarkdownConverter();
	}

	/**
	 * Check if a file is within the publishable folder scope
	 */
	isPublishable(file: TFile): boolean {
		const settings = this.getSettings();
		
		// If no folder is configured, all markdown files are publishable
		if (!settings.publishableFolder) {
			return file.extension === "md";
		}

		// Check if file is within the configured folder
		const normalizedFolder = normalizePath(settings.publishableFolder);
		return file.extension === "md" && file.path.startsWith(normalizedFolder);
	}

	/**
	 * Publish a note to WordPress
	 */
	async publish(file: TFile): Promise<PublishResult> {
		const settings = this.getSettings();

		// Validate settings
		if (!settings.siteUrl || !settings.username || !settings.applicationPassword) {
			return {
				success: false,
				error: "WordPress connection not configured. Please check plugin settings.",
			};
		}

		// Check if file is publishable
		if (!this.isPublishable(file)) {
			return {
				success: false,
				error: `File is not in the publishable folder: ${settings.publishableFolder}`,
			};
		}

		try {
			// Read file content
			const content = await this.app.vault.read(file);

			// Parse frontmatter
			const frontmatter = parseFrontmatter(content);

			// Upload images if enabled
			const imageMap = new Map<string, UploadedImage>();
			if (settings.uploadImages) {
				await this.uploadImages(file, content, imageMap);
			}

			// Set up converter with image mapping
			this.markdownConverter.setImageMap(imageMap);

			// Convert markdown to Gutenberg blocks
			const gutenbergContent = this.markdownConverter.convert(content);

			// Determine post status
			const status = frontmatter.status || settings.defaultPostStatus;

			// Build post payload
			const payload: WordPressPostPayload = {
				title: getTitle(frontmatter, file.basename),
				content: gutenbergContent,
				status,
			};

			// Add optional fields
			if (frontmatter.slug) {
				payload.slug = frontmatter.slug;
			}
			if (frontmatter.excerpt) {
				payload.excerpt = frontmatter.excerpt;
			}
			if (frontmatter.date && status === "future") {
				payload.date = frontmatter.date;
			}

			// Resolve categories and tags
			if (frontmatter.categories && frontmatter.categories.length > 0) {
				const categoryNames = frontmatter.categories.map((c) => String(c));
				payload.categories = await this.wordpressClient.resolveCategoryIds(categoryNames);
			}
			if (frontmatter.tags && frontmatter.tags.length > 0) {
				payload.tags = await this.wordpressClient.resolveTagIds(frontmatter.tags);
			}

			// Create or update post
			let post;
			if (frontmatter.wp_post_id) {
				// Update existing post
				post = await this.wordpressClient.updatePost(frontmatter.wp_post_id, payload);
				new Notice(`Updated post: ${post.title.rendered}`);
			} else {
				// Create new post
				post = await this.wordpressClient.createPost(payload);
				
				// Update frontmatter with post ID
				const updatedContent = updateFrontmatter(content, {
					wp_post_id: post.id,
				});
				await this.app.vault.modify(file, updatedContent);
				
				new Notice(`Published: ${post.title.rendered}`);
			}

			return {
				success: true,
				postId: post.id,
				postUrl: post.link,
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			new Notice(`Publishing failed: ${message}`);
			return {
				success: false,
				error: message,
			};
		}
	}

	/**
	 * Upload images referenced in the markdown to WordPress
	 */
	private async uploadImages(
		file: TFile,
		content: string,
		imageMap: Map<string, UploadedImage>
	): Promise<void> {
		const imageRefs = this.markdownConverter.extractImageReferences(content);

		for (const ref of imageRefs) {
			try {
				// Skip external URLs
				if (ref.path.startsWith("http://") || ref.path.startsWith("https://")) {
					continue;
				}

				// Resolve the image file path relative to the note
				const imagePath = this.resolveImagePath(file, ref.path);
				const imageFile = this.app.vault.getAbstractFileByPath(imagePath);

				if (!(imageFile instanceof TFile)) {
					console.warn(`Image not found: ${ref.path}`);
					continue;
				}

				// Get file extension and MIME type
				const ext = imageFile.extension.toLowerCase();
				const mimeType = MIME_TYPES[`.${ext}`];
				if (!mimeType) {
					console.warn(`Unsupported image type: ${ext}`);
					continue;
				}

				// Read and upload the image
				const data = await this.app.vault.readBinary(imageFile);
				const media = await this.wordpressClient.uploadMedia(
					imageFile.name,
					data,
					mimeType
				);

				// Store mapping
				imageMap.set(ref.path, {
					localPath: ref.path,
					wordpressUrl: media.source_url,
					mediaId: media.id,
				});
			} catch (error) {
				console.warn(`Failed to upload image ${ref.path}:`, error);
			}
		}
	}

	/**
	 * Resolve an image path relative to the current note
	 */
	private resolveImagePath(file: TFile, imagePath: string): string {
		// If it's an absolute vault path, use it directly
		if (imagePath.startsWith("/")) {
			return normalizePath(imagePath.substring(1));
		}

		// Try to find the file using Obsidian's link resolution
		const linkedFile = this.app.metadataCache.getFirstLinkpathDest(
			imagePath,
			file.path
		);

		if (linkedFile) {
			return linkedFile.path;
		}

		// Fall back to resolving relative to the note's folder
		const noteFolder = file.parent?.path || "";
		return normalizePath(`${noteFolder}/${imagePath}`);
	}
}

