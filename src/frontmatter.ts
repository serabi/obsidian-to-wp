import * as yaml from "js-yaml";
import type { PostFrontmatter, PostStatus } from "./types";

const VALID_STATUSES: PostStatus[] = ["draft", "publish", "private", "future"];

export function parseFrontmatter(content: string): PostFrontmatter {
	const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
	
	if (!frontmatterMatch) {
		return {};
	}

	const yamlContent = frontmatterMatch[1];
	
	try {
		const parsed: unknown = yaml.load(yamlContent, { schema: yaml.FAILSAFE_SCHEMA });
		
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return {};
		}

		const parsedFrontmatter = parsed as Record<string, unknown>;

		const result: PostFrontmatter = {};

		if (parsedFrontmatter.title !== undefined) {
			result.title = String(parsedFrontmatter.title);
		}
		if (parsedFrontmatter.slug !== undefined) {
			result.slug = String(parsedFrontmatter.slug);
		}
		if (parsedFrontmatter.status !== undefined) {
			const status = String(parsedFrontmatter.status);
			if (VALID_STATUSES.includes(status as PostStatus)) {
				result.status = status as PostStatus;
			}
		}
		if (parsedFrontmatter.excerpt !== undefined) {
			result.excerpt = String(parsedFrontmatter.excerpt);
		}
		if (parsedFrontmatter.date !== undefined) {
			result.date = String(parsedFrontmatter.date);
		}
		if (parsedFrontmatter.wp_post_id !== undefined) {
			const id = typeof parsedFrontmatter.wp_post_id === "number" 
				? parsedFrontmatter.wp_post_id 
				: parseInt(String(parsedFrontmatter.wp_post_id), 10);
			if (!isNaN(id)) {
				result.wp_post_id = id;
			}
		}
		if (parsedFrontmatter.wp_post_url !== undefined) {
			result.wp_post_url = String(parsedFrontmatter.wp_post_url);
		}
		if (parsedFrontmatter.categories !== undefined) {
			if (Array.isArray(parsedFrontmatter.categories)) {
				result.categories = parsedFrontmatter.categories.map((c) => String(c));
			} else if (typeof parsedFrontmatter.categories === "string" || typeof parsedFrontmatter.categories === "number") {
				result.categories = [String(parsedFrontmatter.categories)];
			}
		}
		if (parsedFrontmatter.tags !== undefined) {
			if (Array.isArray(parsedFrontmatter.tags)) {
				result.tags = parsedFrontmatter.tags.map((t) => String(t));
			} else if (typeof parsedFrontmatter.tags === "string" || typeof parsedFrontmatter.tags === "number") {
				result.tags = [String(parsedFrontmatter.tags)];
			}
		}

		return result;
	} catch (error) {
		console.warn("Failed to parse frontmatter:", error);
		return {};
	}
}

export function updateFrontmatter(
	content: string,
	updates: Partial<PostFrontmatter>
): string {
	const hasFrontmatter = content.match(/^---\n[\s\S]*?\n---/);

	if (!hasFrontmatter) {
		const yaml = generateYaml(updates);
		return `---\n${yaml}---\n\n${content}`;
	}

	const existing = parseFrontmatter(content);
	const merged = { ...existing, ...updates };
	const yaml = generateYaml(merged);

	return content.replace(/^---\n[\s\S]*?\n---/, `---\n${yaml}---`);
}

function generateYaml(frontmatter: PostFrontmatter): string {
	const yamlObj: Record<string, unknown> = {};

	if (frontmatter.title !== undefined) {
		yamlObj.title = frontmatter.title;
	}
	if (frontmatter.slug !== undefined) {
		yamlObj.slug = frontmatter.slug;
	}
	if (frontmatter.status !== undefined) {
		yamlObj.status = frontmatter.status;
	}
	if (frontmatter.excerpt !== undefined) {
		yamlObj.excerpt = frontmatter.excerpt;
	}
	if (frontmatter.date !== undefined) {
		yamlObj.date = frontmatter.date;
	}
	if (frontmatter.wp_post_id !== undefined) {
		yamlObj.wp_post_id = frontmatter.wp_post_id;
	}
	if (frontmatter.wp_post_url !== undefined) {
		yamlObj.wp_post_url = frontmatter.wp_post_url;
	}
	if (frontmatter.categories && frontmatter.categories.length > 0) {
		yamlObj.categories = frontmatter.categories;
	}
	if (frontmatter.tags && frontmatter.tags.length > 0) {
		yamlObj.tags = frontmatter.tags;
	}

	try {
		return yaml.dump(yamlObj, {
			lineWidth: -1,
			noRefs: true,
			sortKeys: false,
		});
	} catch (error) {
		console.warn("Failed to generate YAML:", error);
		return "";
	}
}

export function getTitle(frontmatter: PostFrontmatter, filename: string): string {
	if (frontmatter.title) {
		return frontmatter.title;
	}
	return filename.replace(/\.md$/, "");
}


