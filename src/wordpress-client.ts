import { App, requestUrl, RequestUrlParam, RequestUrlResponse } from "obsidian";
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

type Taxonomy = "categories" | "tags";

export class WordPressRequestError extends Error {
	constructor(message: string, readonly code?: string, readonly data?: WordPressError["data"]) {
		super(message);
	}
}

function decodeEntities(text: string): string {
	return new DOMParser().parseFromString(text, "text/html").documentElement.textContent ?? text;
}

function toRequestError(response: RequestUrlResponse): WordPressRequestError {
	let body: Partial<WordPressError> = {};
	try {
		body = response.json as WordPressError;
	} catch {
		// Not JSON, such as an HTML error page from a proxy or security plugin.
	}
	return new WordPressRequestError(body?.message || `HTTP ${response.status}: Request failed`, body?.code, body?.data);
}

export class WordPressClient {
	constructor(private app: App, private getSettings: () => PluginSettings) {}

	private get password(): string | null {
		const id = this.getSettings().applicationPasswordSecret;
		return id ? this.app.secretStorage.getSecret(id) : null;
	}

	isConfigured(): boolean {
		const settings = this.getSettings();
		return Boolean(settings.siteUrl && settings.username && this.password);
	}

	private async request<T>(endpoint: string, options: Partial<RequestUrlParam> = {}): Promise<T> {
		if (!this.isConfigured()) {
			throw new Error("WordPress connection is not set up. Check the plugin settings.");
		}
		const settings = this.getSettings();

		const response = await requestUrl({
			url: `${settings.siteUrl}/wp-json/wp/v2${endpoint}`,
			method: options.method || "GET",
			headers: {
				Authorization: `Basic ${btoa(`${settings.username}:${this.password}`)}`,
				"Content-Type": "application/json",
				...options.headers,
			},
			body: options.body,
			throw: false,
		});

		if (response.status >= 400) {
			throw toRequestError(response);
		}
		return response.json as T;
	}

	async testConnection(): Promise<ConnectionTestResult> {
		try {
			const user = await this.request<{ name: string }>("/users/me");
			return { success: true, username: user.name };
		} catch (error) {
			return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
		}
	}

	async createPost(payload: WordPressPostPayload): Promise<WordPressPost> {
		return this.request<WordPressPost>("/posts", { method: "POST", body: JSON.stringify(payload) });
	}

	async updatePost(postId: number, payload: WordPressPostPayload): Promise<WordPressPost> {
		return this.request<WordPressPost>(`/posts/${postId}`, { method: "PUT", body: JSON.stringify(payload) });
	}

	async uploadMedia(filename: string, data: ArrayBuffer, mimeType: string): Promise<WordPressMedia> {
		// WordPress reads only the plain filename parameter; filename* is there for standards-aware proxies.
		const asciiName = filename.replace(/[^\x20-\x7e]|["\\]/g, "_");
		return this.request<WordPressMedia>("/media", {
			method: "POST",
			headers: {
				"Content-Type": mimeType,
				"Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
			},
			body: data,
		});
	}

	private async getOrCreateTerm(taxonomy: Taxonomy, name: string): Promise<number> {
		const existing = await this.request<WordPressTerm[]>(
			`/${taxonomy}?search=${encodeURIComponent(name)}&per_page=100`
		);
		const wanted = name.toLowerCase();
		const match = existing.find((term) => decodeEntities(term.name).toLowerCase() === wanted);
		if (match) {
			return match.id;
		}

		try {
			const created = await this.request<WordPressTerm>(`/${taxonomy}`, {
				method: "POST",
				body: JSON.stringify({ name }),
			});
			return created.id;
		} catch (error) {
			if (error instanceof WordPressRequestError && error.code === "term_exists" && error.data?.term_id) {
				return error.data.term_id;
			}
			throw error;
		}
	}

	/** Resolves term names to IDs, creating missing terms. Names that fail are returned in `failed`. */
	async resolveTermIds(taxonomy: Taxonomy, names: string[]): Promise<{ ids: number[]; failed: string[] }> {
		const ids: number[] = [];
		const failed: string[] = [];
		for (const name of names) {
			try {
				ids.push(await this.getOrCreateTerm(taxonomy, name));
			} catch {
				failed.push(name);
			}
		}
		return { ids, failed };
	}
}
