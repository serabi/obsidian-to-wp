/**
 * Converts Obsidian-flavored markdown to WordPress Gutenberg block markup
 */

import type { ImageReference, CalloutInfo, UploadedImage } from "./types";

/** 
 * Main converter class for transforming Obsidian markdown to Gutenberg blocks
 */
export class MarkdownConverter {
	private imageMap: Map<string, UploadedImage> = new Map();

	/** Set the image URL mapping for converting local paths to WordPress URLs */
	setImageMap(map: Map<string, UploadedImage>): void {
		this.imageMap = map;
	}

	/** Convert full markdown content to Gutenberg block format */
	convert(markdown: string): string {
		// Remove frontmatter first (it's handled separately)
		const content = this.removeFrontmatter(markdown);

		// Split into blocks and convert each
		const blocks = this.splitIntoBlocks(content);
		const gutenbergBlocks = blocks.map((block) => this.convertBlock(block));

		return gutenbergBlocks.join("\n\n");
	}

	/** Remove YAML frontmatter from content */
	private removeFrontmatter(content: string): string {
		const frontmatterRegex = /^---\n[\s\S]*?\n---\n*/;
		return content.replace(frontmatterRegex, "").trim();
	}

	/** Split markdown content into logical blocks */
	private splitIntoBlocks(content: string): string[] {
		const blocks: string[] = [];
		const lines = content.split("\n");
		let currentBlock: string[] = [];
		let inCodeBlock = false;
		let inCallout = false;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];

			// Handle code blocks
			if (line.startsWith("```")) {
				if (inCodeBlock) {
					currentBlock.push(line);
					blocks.push(currentBlock.join("\n"));
					currentBlock = [];
					inCodeBlock = false;
				} else {
					if (currentBlock.length > 0) {
						blocks.push(currentBlock.join("\n"));
						currentBlock = [];
					}
					currentBlock.push(line);
					inCodeBlock = true;
				}
				continue;
			}

			if (inCodeBlock) {
				currentBlock.push(line);
				continue;
			}

			// Handle callouts (> [!type] format)
			if (line.match(/^>\s*\[!/)) {
				if (currentBlock.length > 0) {
					blocks.push(currentBlock.join("\n"));
					currentBlock = [];
				}
				inCallout = true;
				currentBlock.push(line);
				continue;
			}

			// Continue callout if line starts with >
			if (inCallout) {
				if (line.startsWith(">") || line.trim() === "") {
					currentBlock.push(line);
					continue;
				} else {
					blocks.push(currentBlock.join("\n"));
					currentBlock = [];
					inCallout = false;
				}
			}

			// Handle headers
			if (line.match(/^#{1,6}\s/)) {
				if (currentBlock.length > 0) {
					blocks.push(currentBlock.join("\n"));
					currentBlock = [];
				}
				blocks.push(line);
				continue;
			}

			// Handle horizontal rules
			if (line.match(/^(-{3,}|\*{3,}|_{3,})$/)) {
				if (currentBlock.length > 0) {
					blocks.push(currentBlock.join("\n"));
					currentBlock = [];
				}
				blocks.push(line);
				continue;
			}

			// Handle lists (unordered and ordered)
			if (line.match(/^(\s*[-*+]|\s*\d+\.)\s/)) {
				// Check if we're continuing a list or starting a new one
				if (currentBlock.length > 0 && !currentBlock[0].match(/^(\s*[-*+]|\s*\d+\.)\s/)) {
					blocks.push(currentBlock.join("\n"));
					currentBlock = [];
				}
				currentBlock.push(line);
				continue;
			}

			// Handle blockquotes (not callouts)
			if (line.startsWith(">") && !line.match(/^>\s*\[!/)) {
				if (currentBlock.length > 0 && !currentBlock[0].startsWith(">")) {
					blocks.push(currentBlock.join("\n"));
					currentBlock = [];
				}
				currentBlock.push(line);
				continue;
			}

			// Handle images on their own line
			if (line.match(/^!\[.*?\]\(.*?\)$/) || line.match(/^!\[\[.*?\]\]$/)) {
				if (currentBlock.length > 0) {
					blocks.push(currentBlock.join("\n"));
					currentBlock = [];
				}
				blocks.push(line);
				continue;
			}

			// Empty line - end current block
			if (line.trim() === "") {
				if (currentBlock.length > 0) {
					blocks.push(currentBlock.join("\n"));
					currentBlock = [];
				}
				continue;
			}

			// Regular paragraph content
			currentBlock.push(line);
		}

		// Don't forget the last block
		if (currentBlock.length > 0) {
			blocks.push(currentBlock.join("\n"));
		}

		return blocks.filter((b) => b.trim() !== "");
	}

	/** Convert a single block to Gutenberg format */
	private convertBlock(block: string): string {
		const trimmed = block.trim();

		// Headers
		const headerMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
		if (headerMatch) {
			const level = headerMatch[1].length;
			const text = this.convertInlineFormatting(headerMatch[2]);
			return `<!-- wp:heading {"level":${level}} -->\n<h${level}>${text}</h${level}>\n<!-- /wp:heading -->`;
		}

		// Code blocks
		if (trimmed.startsWith("```")) {
			return this.convertCodeBlock(trimmed);
		}

		// Callouts
		if (trimmed.match(/^>\s*\[!/)) {
			return this.convertCallout(trimmed);
		}

		// Blockquotes
		if (trimmed.startsWith(">")) {
			return this.convertBlockquote(trimmed);
		}

		// Horizontal rule
		if (trimmed.match(/^(-{3,}|\*{3,}|_{3,})$/)) {
			return "<!-- wp:separator -->\n<hr class=\"wp-block-separator has-alpha-channel-opacity\"/>\n<!-- /wp:separator -->";
		}

		// Ordered lists
		if (trimmed.match(/^\d+\.\s/)) {
			return this.convertOrderedList(trimmed);
		}

		// Unordered lists
		if (trimmed.match(/^[-*+]\s/)) {
			return this.convertUnorderedList(trimmed);
		}

		// Images (standalone)
		if (trimmed.match(/^!\[.*?\]\(.*?\)$/) || trimmed.match(/^!\[\[.*?\]\]$/)) {
			return this.convertImage(trimmed);
		}

		// Default: paragraph
		return this.convertParagraph(trimmed);
	}

	/** Convert a code block */
	private convertCodeBlock(block: string): string {
		const lines = block.split("\n");
		const firstLine = lines[0];
		const language = firstLine.replace(/^```/, "").trim() || "";
		const code = lines.slice(1, -1).join("\n");
		const escapedCode = this.escapeHtml(code);

		if (language) {
			return `<!-- wp:code -->\n<pre class="wp-block-code"><code class="language-${language}">${escapedCode}</code></pre>\n<!-- /wp:code -->`;
		}
		return `<!-- wp:code -->\n<pre class="wp-block-code"><code>${escapedCode}</code></pre>\n<!-- /wp:code -->`;
	}

	/** Convert an Obsidian callout to a styled quote block */
	private convertCallout(block: string): string {
		const calloutInfo = this.parseCallout(block);
		
		// Convert to a styled blockquote with a title
		const contentHtml = this.convertInlineFormatting(calloutInfo.content);
		const typeClass = `callout-${calloutInfo.type.toLowerCase()}`;
		
		// Create a quote block with callout styling
		return `<!-- wp:quote {"className":"${typeClass}"} -->
<blockquote class="wp-block-quote ${typeClass}"><p><strong>${this.escapeHtml(calloutInfo.title)}</strong></p><p>${contentHtml}</p></blockquote>
<!-- /wp:quote -->`;
	}

	/** Parse callout syntax into structured data */
	private parseCallout(block: string): CalloutInfo {
		const lines = block.split("\n");
		const firstLine = lines[0];
		
		// Match > [!type] or > [!type]+ or > [!type]- with optional title
		const headerMatch = firstLine.match(/^>\s*\[!(\w+)\]([-+])?\s*(.*)$/);
		
		let type = "note";
		let title = "";
		let foldable = false;
		let defaultFolded = false;

		if (headerMatch) {
			type = headerMatch[1];
			if (headerMatch[2] === "+") {
				foldable = true;
				defaultFolded = false;
			} else if (headerMatch[2] === "-") {
				foldable = true;
				defaultFolded = true;
			}
			title = headerMatch[3] || type.charAt(0).toUpperCase() + type.slice(1);
		}

		// Get content (remaining lines, stripped of > prefix)
		const content = lines
			.slice(1)
			.map((line) => line.replace(/^>\s?/, ""))
			.join("\n")
			.trim();

		return { type, title, content, foldable, defaultFolded };
	}

	/** Convert a blockquote */
	private convertBlockquote(block: string): string {
		const content = block
			.split("\n")
			.map((line) => line.replace(/^>\s?/, ""))
			.join("\n");
		const html = this.convertInlineFormatting(content);
		return `<!-- wp:quote -->\n<blockquote class="wp-block-quote"><p>${html}</p></blockquote>\n<!-- /wp:quote -->`;
	}

	/** Convert an unordered list */
	private convertUnorderedList(block: string): string {
		const items = this.parseListItems(block, /^[-*+]\s/);
		const listHtml = items.map((item) => `<li>${this.convertInlineFormatting(item)}</li>`).join("");
		return `<!-- wp:list -->\n<ul class="wp-block-list">${listHtml}</ul>\n<!-- /wp:list -->`;
	}

	/** Convert an ordered list */
	private convertOrderedList(block: string): string {
		const items = this.parseListItems(block, /^\d+\.\s/);
		const listHtml = items.map((item) => `<li>${this.convertInlineFormatting(item)}</li>`).join("");
		return `<!-- wp:list {"ordered":true} -->\n<ol class="wp-block-list">${listHtml}</ol>\n<!-- /wp:list -->`;
	}

	/** Parse list items from a block */
	private parseListItems(block: string, pattern: RegExp): string[] {
		const lines = block.split("\n");
		const items: string[] = [];
		let currentItem = "";

		for (const line of lines) {
			if (line.match(pattern)) {
				if (currentItem) {
					items.push(currentItem);
				}
				currentItem = line.replace(pattern, "");
			} else if (line.match(/^\s+/) && currentItem) {
				// Continuation of previous item
				currentItem += " " + line.trim();
			}
		}

		if (currentItem) {
			items.push(currentItem);
		}

		return items;
	}

	/** Convert a standalone image */
	private convertImage(block: string): string {
		const imageRef = this.extractImageReference(block);
		if (!imageRef) {
			return this.convertParagraph(block);
		}

		const uploaded = this.imageMap.get(imageRef.path);
		const url = uploaded?.wordpressUrl || imageRef.path;
		const alt = this.escapeHtml(imageRef.altText);

		return `<!-- wp:image -->\n<figure class="wp-block-image"><img src="${url}" alt="${alt}"/></figure>\n<!-- /wp:image -->`;
	}

	/** Convert a paragraph with inline formatting */
	private convertParagraph(block: string): string {
		const html = this.convertInlineFormatting(block);
		return `<!-- wp:paragraph -->\n<p>${html}</p>\n<!-- /wp:paragraph -->`;
	}

	/** Convert inline markdown formatting to HTML */
	private convertInlineFormatting(text: string): string {
		let result = text;

		// Handle inline images first (both syntaxes)
		result = result.replace(/!\[\[([^\]]+)\]\]/g, (match, path) => {
			const uploaded = this.imageMap.get(path);
			const url = uploaded?.wordpressUrl || path;
			return `<img src="${url}" alt="${this.escapeHtml(path)}"/>`;
		});

		result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, path) => {
			const uploaded = this.imageMap.get(path);
			const url = uploaded?.wordpressUrl || path;
			return `<img src="${url}" alt="${this.escapeHtml(alt)}"/>`;
		});

		// Convert wikilinks to text (or could be converted to links)
		result = result.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2"); // [[link|display]]
		result = result.replace(/\[\[([^\]]+)\]\]/g, "$1"); // [[link]]

		// Bold and italic combined (***text*** or ___text___)
		result = result.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>");
		result = result.replace(/___([^_]+)___/g, "<strong><em>$1</em></strong>");

		// Bold (**text** or __text__)
		result = result.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
		result = result.replace(/__([^_]+)__/g, "<strong>$1</strong>");

		// Italic (*text* or _text_)
		result = result.replace(/\*([^*]+)\*/g, "<em>$1</em>");
		result = result.replace(/(?<![a-zA-Z])_([^_]+)_(?![a-zA-Z])/g, "<em>$1</em>");

		// Strikethrough (~~text~~)
		result = result.replace(/~~([^~]+)~~/g, "<del>$1</del>");

		// Inline code (`code`)
		result = result.replace(/`([^`]+)`/g, "<code>$1</code>");

		// Highlights (==text==)
		result = result.replace(/==([^=]+)==/g, "<mark>$1</mark>");

		// Links [text](url)
		result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

		return result;
	}

	/** Extract all image references from markdown content */
	extractImageReferences(markdown: string): ImageReference[] {
		const images: ImageReference[] = [];
		const content = this.removeFrontmatter(markdown);

		// Standard markdown images: ![alt](path)
		const standardRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
		let match;
		while ((match = standardRegex.exec(content)) !== null) {
			images.push({
				originalSyntax: match[0],
				altText: match[1],
				path: match[2],
				isWikilink: false,
			});
		}

		// Wikilink images: ![[path]] or ![[path|alt]]
		const wikilinkRegex = /!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
		while ((match = wikilinkRegex.exec(content)) !== null) {
			images.push({
				originalSyntax: match[0],
				path: match[1],
				altText: match[2] || match[1],
				isWikilink: true,
			});
		}

		return images;
	}

	/** Extract image reference from a single image block */
	private extractImageReference(block: string): ImageReference | null {
		// Standard markdown: ![alt](path)
		const standardMatch = block.match(/!\[([^\]]*)\]\(([^)]+)\)/);
		if (standardMatch) {
			return {
				originalSyntax: standardMatch[0],
				altText: standardMatch[1],
				path: standardMatch[2],
				isWikilink: false,
			};
		}

		// Wikilink: ![[path]] or ![[path|alt]]
		const wikilinkMatch = block.match(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
		if (wikilinkMatch) {
			return {
				originalSyntax: wikilinkMatch[0],
				path: wikilinkMatch[1],
				altText: wikilinkMatch[2] || wikilinkMatch[1],
				isWikilink: true,
			};
		}

		return null;
	}

	/** Escape HTML special characters */
	private escapeHtml(text: string): string {
		return text
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#039;");
	}
}
