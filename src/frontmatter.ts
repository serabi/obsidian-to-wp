import * as yaml from "js-yaml";
import type { PostFrontmatter, PostStatus } from "./types";

const VALID_STATUSES: PostStatus[] = ["draft", "publish", "private", "future"];

function toNonEmptyString(value: unknown): string | undefined {
	if (value === null || value === undefined) {
		return undefined;
	}

	const str = String(value).trim();
	return str.length > 0 ? str : undefined;
}

function normalizeStringList(value: unknown): string[] | undefined {
	if (Array.isArray(value)) {
		const cleaned = value
			.map((item) => toNonEmptyString(item))
			.filter((item): item is string => Boolean(item));
		return cleaned.length > 0 ? cleaned : undefined;
	}

	const single = toNonEmptyString(value);
	return single ? [single] : undefined;
}

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
		const slug = toNonEmptyString(parsedFrontmatter.slug);
		if (slug) {
			result.slug = slug;
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
		const categories = normalizeStringList(parsedFrontmatter.categories);
		if (categories) {
			result.categories = categories;
		}
		const tags = normalizeStringList(parsedFrontmatter.tags);
		if (tags) {
			result.tags = tags;
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


