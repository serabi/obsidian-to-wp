
/** WordPress post status options */
export type PostStatus = "draft" | "publish" | "private" | "future";

/** Plugin settings stored in Obsidian */
export interface PluginSettings {
	/** WordPress site URL (e.g., https://example.com) */
	siteUrl: string;
	/** WordPress username */
	username: string;
	/** ID of the application password in Obsidian's secret storage */
	applicationPasswordSecret: string;
	/** Folder path to scope publishable notes (empty = all notes) */
	publishableFolder: string;
	/** Default post status when publishing */
	defaultPostStatus: PostStatus;
	/** Whether to upload images to WordPress media library */
	uploadImages: boolean;
	/** Whether to create a template file in the publishable folder */
	createTemplate: boolean;
	/** Uploaded media keyed by site URL and vault path, so unchanged images are not uploaded twice */
	mediaCache: Record<string, CachedMedia>;
}

export interface CachedMedia {
	id: number;
	url: string;
	mtime: number;
}

/** Frontmatter fields that map to WordPress post properties */
export interface PostFrontmatter {
	/** Post title (overrides note title) */
	title?: string;
	/** Post slug/permalink */
	slug?: string;
	/** Post status (overrides default) */
	status?: PostStatus;
	/** Category names or IDs */
	categories?: string[] | number[];
	/** Tag names */
	tags?: string[];
	/** Post excerpt */
	excerpt?: string;
	/** Scheduled publish date (ISO 8601 format) */
	date?: string;
	/** WordPress post ID (set after first publish for updates) */
	wp_post_id?: number;
	/** WordPress post URL (set after publishing) */
	wp_post_url?: string;
}

/** WordPress REST API post creation/update payload */
export interface WordPressPostPayload {
	title: string;
	content: string;
	status: PostStatus;
	slug?: string;
	categories?: number[];
	tags?: number[];
	excerpt?: string;
	date?: string;
}

/** WordPress REST API post response */
export interface WordPressPost {
	id: number;
	link: string;
	status: PostStatus;
	title: {
		rendered: string;
	};
	slug: string;
}

/** WordPress REST API media upload response */
export interface WordPressMedia {
	id: number;
	source_url: string;
	media_details?: {
		width: number;
		height: number;
	};
}

/** WordPress REST API category/tag response */
export interface WordPressTerm {
	id: number;
	name: string;
	slug: string;
}

/** WordPress REST API error response */
export interface WordPressError {
	code: string;
	message: string;
	data?: {
		status: number;
		term_id?: number;
	};
}

/** Result of publishing a note */
export interface PublishResult {
	success: boolean;
	postId?: number;
	postUrl?: string;
	error?: string;
}
