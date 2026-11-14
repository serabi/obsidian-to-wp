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

export function normalizeFrontmatter(parsed: unknown): PostFrontmatter {
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		return {};
	}

	const raw = parsed as Record<string, unknown>;
	const result: PostFrontmatter = {};

	const title = toNonEmptyString(raw.title);
	if (title) {
		result.title = title;
	}
	const slug = toNonEmptyString(raw.slug);
	if (slug) {
		result.slug = slug;
	}
	const status = toNonEmptyString(raw.status);
	if (status && VALID_STATUSES.includes(status as PostStatus)) {
		result.status = status as PostStatus;
	}
	const excerpt = toNonEmptyString(raw.excerpt);
	if (excerpt) {
		result.excerpt = excerpt;
	}
	const date = toNonEmptyString(raw.date);
	if (date) {
		result.date = date;
	}
	const id = parseInt(String(raw.wp_post_id), 10);
	if (!isNaN(id)) {
		result.wp_post_id = id;
	}
	const url = toNonEmptyString(raw.wp_post_url);
	if (url) {
		result.wp_post_url = url;
	}
	const categories = normalizeStringList(raw.categories);
	if (categories) {
		result.categories = categories;
	}
	const tags = normalizeStringList(raw.tags);
	if (tags) {
		result.tags = tags;
	}

	return result;
}

export function getTitle(frontmatter: PostFrontmatter, filename: string): string {
	return frontmatter.title ?? filename.replace(/\.md$/, "");
}
