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
		const parsed = yaml.load(yamlContent) as any;
		
		if (!parsed || typeof parsed !== "object") {
			return {};
		}

		const result: PostFrontmatter = {};

		if (parsed.title !== undefined) {
			result.title = String(parsed.title);
		}
		if (parsed.slug !== undefined) {
			result.slug = String(parsed.slug);
		}
		if (parsed.status !== undefined) {
			const status = String(parsed.status);
			if (VALID_STATUSES.includes(status as PostStatus)) {
				result.status = status as PostStatus;
			}
		}
		if (parsed.excerpt !== undefined) {
			result.excerpt = String(parsed.excerpt);
		}
		if (parsed.date !== undefined) {
			result.date = String(parsed.date);
		}
		if (parsed.wp_post_id !== undefined) {
			const id = typeof parsed.wp_post_id === "number" 
				? parsed.wp_post_id 
				: parseInt(String(parsed.wp_post_id), 10);
			if (!isNaN(id)) {
				result.wp_post_id = id;
			}
		}
		if (parsed.wp_post_url !== undefined) {
			result.wp_post_url = String(parsed.wp_post_url);
		}
		if (parsed.categories !== undefined) {
			if (Array.isArray(parsed.categories)) {
				result.categories = parsed.categories.map((c: any) => String(c));
			} else if (typeof parsed.categories === "string" || typeof parsed.categories === "number") {
				result.categories = [String(parsed.categories)];
			}
		}
		if (parsed.tags !== undefined) {
			if (Array.isArray(parsed.tags)) {
				result.tags = parsed.tags.map((t: any) => String(t));
			} else if (typeof parsed.tags === "string") {
				result.tags = [parsed.tags];
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
	const yamlObj: any = {};

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


