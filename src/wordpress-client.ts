import { requestUrl, RequestUrlParam } from "obsidian";
import type {
	PluginSettings,
	WordPressPost,
	WordPressPostPayload,
	WordPressMedia,
	WordPressTerm,
	WordPressError,
} from "./types";

/** Result of connection test */
export interface ConnectionTestResult {
	success: boolean;
	username?: string;
	error?: string;
}

export class WordPressClient {
	private getSettings: () => PluginSettings;

	constructor(getSettings: () => PluginSettings) {
		this.getSettings = getSettings;
	}

	private get apiBase(): string {
		const settings = this.getSettings();
		return `${settings.siteUrl}/wp-json/wp/v2`;
	}

	private get authHeader(): string {
		const settings = this.getSettings();
		const credentials = `${settings.username}:${settings.applicationPassword}`;
		return `Basic ${btoa(credentials)}`;
	}

	private async request<T>(
		endpoint: string,
		options: Partial<RequestUrlParam> = {}
	): Promise<T> {
		const settings = this.getSettings();
		
		if (!settings.siteUrl || !settings.username || !settings.applicationPassword) {
			throw new Error("WordPress connection not configured. Please check plugin settings.");
		}

		const url = endpoint.startsWith("http") ? endpoint : `${this.apiBase}${endpoint}`;

		const response = await requestUrl({
			url,
			method: options.method || "GET",
			headers: {
				Authorization: this.authHeader,
				"Content-Type": "application/json",
				...options.headers,
			},
			body: options.body,
			throw: false,
		});

		if (response.status >= 400) {
			const error = response.json as WordPressError;
			throw new Error(error?.message || `HTTP ${response.status}: Request failed`);
		}

		return response.json as T;
	}

	async testConnection(): Promise<ConnectionTestResult> {
		try {
			const user = await this.request<{ name: string }>("/users/me");
			return {
				success: true,
				username: user.name,
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	}

	async createPost(payload: WordPressPostPayload): Promise<WordPressPost> {
		return this.request<WordPressPost>("/posts", {
			method: "POST",
			body: JSON.stringify(payload),
		});
	}

	async updatePost(postId: number, payload: WordPressPostPayload): Promise<WordPressPost> {
		return this.request<WordPressPost>(`/posts/${postId}`, {
			method: "PUT",
			body: JSON.stringify(payload),
		});
	}

	async getPost(postId: number): Promise<WordPressPost | null> {
		try {
			return await this.request<WordPressPost>(`/posts/${postId}`);
		} catch {
			return null;
		}
	}

	async uploadMedia(
		filename: string,
		data: ArrayBuffer,
		mimeType: string
	): Promise<WordPressMedia> {
		const url = `${this.apiBase}/media`;

		const response = await requestUrl({
			url,
			method: "POST",
			headers: {
				Authorization: this.authHeader,
				"Content-Type": mimeType,
				"Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
			},
			body: data,
			throw: false,
		});

		if (response.status >= 400) {
			const error = response.json as WordPressError;
			throw new Error(error?.message || `Failed to upload media: HTTP ${response.status}`);
		}

		return response.json as WordPressMedia;
	}

	async getOrCreateCategory(name: string): Promise<number> {
		const existing = await this.request<WordPressTerm[]>(
			`/categories?search=${encodeURIComponent(name)}&per_page=100`
		);

		const match = existing.find(
			(cat) => cat.name.toLowerCase() === name.toLowerCase()
		);
		if (match) {
			return match.id;
		}

		const created = await this.request<WordPressTerm>("/categories", {
			method: "POST",
			body: JSON.stringify({ name }),
		});

		return created.id;
	}

	async getOrCreateTag(name: string): Promise<number> {
		const existing = await this.request<WordPressTerm[]>(
			`/tags?search=${encodeURIComponent(name)}&per_page=100`
		);

		const match = existing.find(
			(tag) => tag.name.toLowerCase() === name.toLowerCase()
		);
		if (match) {
			return match.id;
		}

		const created = await this.request<WordPressTerm>("/tags", {
			method: "POST",
			body: JSON.stringify({ name }),
		});

		return created.id;
	}

	async resolveCategoryIds(names: string[]): Promise<number[]> {
		const ids: number[] = [];
		for (const name of names) {
			try {
				const id = await this.getOrCreateCategory(name);
				ids.push(id);
			} catch (error) {
				console.warn(`Failed to resolve category "${name}":`, error);
			}
		}
		return ids;
	}

	async resolveTagIds(names: string[]): Promise<number[]> {
		const ids: number[] = [];
		for (const name of names) {
			try {
				const id = await this.getOrCreateTag(name);
				ids.push(id);
			} catch (error) {
				console.warn(`Failed to resolve tag "${name}":`, error);
			}
		}
		return ids;
	}
}


