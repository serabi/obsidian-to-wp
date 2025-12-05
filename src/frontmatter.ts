/**
 * Frontmatter parsing and validation for WordPress post properties
 */

import type { PostFrontmatter, PostStatus } from "./types";

/** Valid post status values */
const VALID_STATUSES: PostStatus[] = ["draft", "publish", "private", "future"];

/**
 * Parse YAML frontmatter from markdown content
 */
export function parseFrontmatter(content: string): PostFrontmatter {
	const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
	
	if (!frontmatterMatch) {
		return {};
	}

	const yaml = frontmatterMatch[1];
	const result: PostFrontmatter = {};

	// Parse each line of the YAML
	const lines = yaml.split("\n");
	let currentKey = "";
	let inArray = false;
	let arrayValues: string[] = [];

	for (const line of lines) {
		// Skip empty lines
		if (!line.trim()) continue;

		// Check for array item (starts with -)
		if (line.match(/^\s+-\s+/)) {
			if (inArray && currentKey) {
				const value = line.replace(/^\s+-\s+/, "").trim();
				// Remove quotes if present
				arrayValues.push(value.replace(/^["']|["']$/g, ""));
			}
			continue;
		}

		// Save previous array if we were in one
		if (inArray && currentKey && arrayValues.length > 0) {
			setArrayValue(result, currentKey, arrayValues);
			arrayValues = [];
			inArray = false;
		}

		// Parse key: value pairs
		const kvMatch = line.match(/^(\w+):\s*(.*)$/);
		if (kvMatch) {
			const key = kvMatch[1].toLowerCase();
			const value = kvMatch[2].trim();

			currentKey = key;

			// Check if this starts an array (empty value or bracket notation)
			if (value === "" || value === "[]") {
				inArray = true;
				arrayValues = [];
				continue;
			}

			// Check for inline array [item1, item2]
			const inlineArrayMatch = value.match(/^\[(.*)\]$/);
			if (inlineArrayMatch) {
				const items = inlineArrayMatch[1]
					.split(",")
					.map((item) => item.trim().replace(/^["']|["']$/g, ""))
					.filter((item) => item !== "");
				setArrayValue(result, key, items);
				continue;
			}

			// Single value - remove quotes if present
			const cleanValue = value.replace(/^["']|["']$/g, "");
			setSingleValue(result, key, cleanValue);
		}
	}

	// Don't forget the last array if we were in one
	if (inArray && currentKey && arrayValues.length > 0) {
		setArrayValue(result, currentKey, arrayValues);
	}

	return result;
}

/** Set a single value on the frontmatter object */
function setSingleValue(result: PostFrontmatter, key: string, value: string): void {
	switch (key) {
		case "title":
			result.title = value;
			break;
		case "slug":
			result.slug = value;
			break;
		case "status":
			if (VALID_STATUSES.includes(value as PostStatus)) {
				result.status = value as PostStatus;
			}
			break;
		case "excerpt":
			result.excerpt = value;
			break;
		case "date":
			result.date = value;
			break;
		case "wp_post_id": {
			const id = parseInt(value, 10);
			if (!isNaN(id)) {
				result.wp_post_id = id;
			}
			break;
		}
		case "categories":
			// Single category as string
			result.categories = [value];
			break;
		case "tags":
			// Single tag as string
			result.tags = [value];
			break;
	}
}

/** Set an array value on the frontmatter object */
function setArrayValue(result: PostFrontmatter, key: string, values: string[]): void {
	switch (key) {
		case "categories":
			result.categories = values;
			break;
		case "tags":
			result.tags = values;
			break;
	}
}

/**
 * Update frontmatter in markdown content with new values
 */
export function updateFrontmatter(
	content: string,
	updates: Partial<PostFrontmatter>
): string {
	const hasFrontmatter = content.match(/^---\n[\s\S]*?\n---/);

	if (!hasFrontmatter) {
		// Create new frontmatter
		const yaml = generateYaml(updates);
		return `---\n${yaml}---\n\n${content}`;
	}

	// Parse existing and merge
	const existing = parseFrontmatter(content);
	const merged = { ...existing, ...updates };
	const yaml = generateYaml(merged);

	return content.replace(/^---\n[\s\S]*?\n---/, `---\n${yaml}---`);
}

/** Generate YAML string from frontmatter object */
function generateYaml(frontmatter: PostFrontmatter): string {
	const lines: string[] = [];

	if (frontmatter.title !== undefined) {
		lines.push(`title: "${escapeYamlString(frontmatter.title)}"`);
	}
	if (frontmatter.slug !== undefined) {
		lines.push(`slug: ${frontmatter.slug}`);
	}
	if (frontmatter.status !== undefined) {
		lines.push(`status: ${frontmatter.status}`);
	}
	if (frontmatter.excerpt !== undefined) {
		lines.push(`excerpt: "${escapeYamlString(frontmatter.excerpt)}"`);
	}
	if (frontmatter.date !== undefined) {
		lines.push(`date: ${frontmatter.date}`);
	}
	if (frontmatter.wp_post_id !== undefined) {
		lines.push(`wp_post_id: ${frontmatter.wp_post_id}`);
	}
	if (frontmatter.categories && frontmatter.categories.length > 0) {
		lines.push("categories:");
		for (const cat of frontmatter.categories) {
			lines.push(`  - ${cat}`);
		}
	}
	if (frontmatter.tags && frontmatter.tags.length > 0) {
		lines.push("tags:");
		for (const tag of frontmatter.tags) {
			lines.push(`  - ${tag}`);
		}
	}

	return lines.length > 0 ? lines.join("\n") + "\n" : "";
}

/** Escape special characters in YAML strings */
function escapeYamlString(str: string): string {
	return str.replace(/"/g, '\\"');
}

/**
 * Get the title from frontmatter or filename
 */
export function getTitle(frontmatter: PostFrontmatter, filename: string): string {
	if (frontmatter.title) {
		return frontmatter.title;
	}
	// Remove .md extension and return
	return filename.replace(/\.md$/, "");
}

