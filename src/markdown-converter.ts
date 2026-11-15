/**
 * Converts Obsidian-flavored markdown to WordPress block markup.
 * Kept free of Obsidian imports so it can be tested in Node.
 */

import MarkdownIt from "markdown-it";
import type { Env as MarkdownItEnv, StateInline, Token } from "markdown-it";
import footnote from "markdown-it-footnote";
import mark from "markdown-it-mark";

export interface ResolvedImage {
	url: string;
	id?: number;
}

export interface Resolvers {
	/** Maps an image path as written in the note to its WordPress URL. */
	image(path: string): ResolvedImage | undefined;
	/** Maps a link target (note name or path) to a published post URL. */
	link(target: string): string | undefined;
}

type Env = MarkdownItEnv & { resolvers: Resolvers };

interface WikilinkMeta {
	target: string;
	alias?: string;
	embed: boolean;
}

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i;
const SIZE = /^(\d+)(?:x(\d+))?$/;
const CALLOUT = /^\[!([\w-]+)\]([+-]?)[ \t]*(.*)$/;

const NO_RESOLVERS: Resolvers = { image: () => undefined, link: () => undefined };

const md = new MarkdownIt({ html: true, linkify: true, breaks: true })
	.use(footnote)
	.use(mark);
const escape = md.utils.escapeHtml;

function wikilinkRule(state: StateInline, silent: boolean): boolean {
	const start = state.pos;
	const embed = state.src.charCodeAt(start) === 0x21; /* ! */
	const open = embed ? start + 1 : start;
	if (!state.src.startsWith("[[", open)) {
		return false;
	}
	const close = state.src.indexOf("]]", open + 2);
	if (close < 0 || state.src.slice(open + 2, close).includes("\n")) {
		return false;
	}
	if (!silent) {
		const [target, ...rest] = state.src.slice(open + 2, close).split("|");
		const token = state.push("wikilink", "", 0);
		token.meta = {
			target: target.trim(),
			alias: rest.length ? rest.join("|").trim() : undefined,
			embed,
		} satisfies WikilinkMeta;
	}
	state.pos = close + 2;
	return true;
}

md.inline.ruler.before("link", "wikilink", wikilinkRule);

/** Splits Obsidian's `alt|300` or `alt|300x200` into alt text and size. */
function parseSize(text: string | undefined): {
	alt?: string;
	width?: number;
	height?: number;
} {
	if (!text) {
		return {};
	}
	const parts = text.split("|");
	const size = SIZE.exec(parts[parts.length - 1].trim());
	if (!size) {
		return { alt: text };
	}
	parts.pop();
	return {
		alt: parts.join("|") || undefined,
		width: Number(size[1]),
		height: size[2] ? Number(size[2]) : undefined,
	};
}

function wikilinkMeta(token: Token): WikilinkMeta {
	return token.meta as unknown as WikilinkMeta;
}

function linkTarget(target: string): string {
	return target.split("#")[0];
}

function displayName(meta: WikilinkMeta): string {
	return (
		meta.alias || meta.target.replace(/#\^?/g, " > ").replace(/^ > /, "")
	);
}

function isImageEmbed(token: Token): boolean {
	return (
		token.type === "wikilink" &&
		wikilinkMeta(token).embed &&
		IMAGE_EXTENSIONS.test(linkTarget(wikilinkMeta(token).target))
	);
}

interface ImageSpec {
	path: string;
	alt: string;
	width?: number;
	height?: number;
}

function imageSpec(token: Token): ImageSpec {
	if (token.type === "wikilink") {
		const meta = wikilinkMeta(token);
		const { alt, width, height } = parseSize(meta.alias);
		return { path: linkTarget(meta.target), alt: alt ?? "", width, height };
	}
	const { alt, width, height } = parseSize(token.content);
	return {
		path: safeDecode(String(token.attrGet("src") ?? "")),
		alt: alt ?? "",
		width,
		height,
	};
}

function safeDecode(value: string): string {
	try {
		return decodeURI(value);
	} catch {
		return value;
	}
}

function resolveImage(spec: ImageSpec, env: Env): ResolvedImage {
	return env.resolvers.image(spec.path) ?? { url: spec.path };
}

function imgTag(
	spec: ImageSpec,
	image: ResolvedImage,
	extraClass?: string,
): string {
	const attrs = [`src="${escape(image.url)}"`, `alt="${escape(spec.alt)}"`];
	if (extraClass) {
		attrs.push(`class="${extraClass}"`);
	}
	const style = [
		spec.width && `width:${spec.width}px`,
		spec.height && `height:${spec.height}px`,
	]
		.filter(Boolean)
		.join(";");
	if (style) {
		attrs.push(`style="${style}"`);
	}
	return `<img ${attrs.join(" ")}/>`;
}

md.renderer.rules.wikilink = (tokens, idx, _options, mdEnv) => {
	const env = mdEnv as Env;
	const meta = wikilinkMeta(tokens[idx]);
	if (isImageEmbed(tokens[idx])) {
		const spec = imageSpec(tokens[idx]);
		return imgTag(spec, resolveImage(spec, env));
	}
	const url = env.resolvers.link(linkTarget(meta.target));
	const text = escape(displayName(meta));
	return url ? `<a href="${escape(url)}">${text}</a>` : text;
};

/**
 * Removes Obsidian `%%comments%%` from the whole note before conversion, so a comment
 * can span blocks, HTML, links and alt text. Only lines that markdown-it itself parses
 * as code blocks keep `%%`, and only when they are not already inside a comment.
 */
export function stripComments(markdown: string): string {
	// Stripping can change how the rest parses, so repeat until the text that will be
	// converted has `%%` only inside its own code blocks. Each pass removes text, so it ends.
	let text = markdown;
	for (;;) {
		const next = stripCommentsOnce(text);
		if (next === text) {
			return text;
		}
		text = next;
	}
}

function stripCommentsOnce(markdown: string): string {
	if (!markdown.includes("%%")) {
		return markdown;
	}
	const codeLines = new Set<number>();
	for (const token of md.parse(markdown, { resolvers: NO_RESOLVERS })) {
		if ((token.type === "fence" || token.type === "code_block") && token.map) {
			for (let line = token.map[0]; line < token.map[1]; line++) {
				codeLines.add(line);
			}
		}
	}

	// ponytail: inline code is not protected, so `%%` inside backticks is hidden too; errs toward hiding
	let inComment = false;
	const out: string[] = [];
	markdown.split("\n").forEach((line, index) => {
		if (codeLines.has(index) && !inComment) {
			out.push(line);
			return;
		}
		const touched = inComment || line.includes("%%");
		let kept = "";
		line.split("%%").forEach((part, i) => {
			if (i > 0) {
				inComment = !inComment;
				if (inComment) {
					kept = kept.replace(/[ \t]+$/, "");
				}
			}
			if (!inComment) {
				kept += part;
			}
		});
		if (!touched || kept.trim()) {
			out.push(touched ? kept.trimEnd() : line);
		}
	});
	return out.join("\n");
}

md.renderer.rules.softbreak = () => "<br>";


md.renderer.rules.image = (tokens, idx, _options, mdEnv) => {
	const env = mdEnv as Env;
	const spec = imageSpec(tokens[idx]);
	return imgTag(spec, resolveImage(spec, env));
};

const defaultLinkOpen =
	md.renderer.rules.link_open ??
	((tokens, idx, options, _env, self) =>
		self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, mdEnv, self) => {
	const env = mdEnv as Env;
	const href = String(tokens[idx].attrGet("href") ?? "");
	if (href && !/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(href)) {
		const url = env.resolvers.link(
			linkTarget(safeDecode(href)).replace(/\.md$/i, ""),
		);
		if (url) {
			tokens[idx].attrSet("href", url);
		}
	}
	return defaultLinkOpen(tokens, idx, options, env, self);
};

function block(
	name: string,
	html: string,
	attrs?: Record<string, unknown>,
): string {
	const json =
		attrs && Object.keys(attrs).length ? ` ${JSON.stringify(attrs)}` : "";
	return `<!-- wp:${name}${json} -->\n${html}\n<!-- /wp:${name} -->`;
}

function findClose(tokens: Token[], open: number): number {
	let depth = 0;
	for (let i = open; i < tokens.length; i++) {
		depth += tokens[i].nesting;
		if (depth === 0) {
			return i;
		}
	}
	return tokens.length - 1;
}

function renderInline(token: Token, env: Env): string {
	return md.renderer.renderInline(token.children ?? [], md.options, env);
}

function renderInlineSource(src: string, env: Env): string {
	// A fresh parse re-runs the footnote tail rule, which would repeat the note's footnote list here.
	return md.renderInline(src, { resolvers: env.resolvers });
}

function paragraph(html: string): string {
	return block("paragraph", `<p>${html}</p>`);
}

function imageBlock(token: Token, env: Env): string {
	const spec = imageSpec(token);
	const image = resolveImage(spec, env);
	const attrs: Record<string, unknown> = {};
	const figureClass = ["wp-block-image"];
	if (image.id) {
		attrs.id = image.id;
	}
	if (spec.width) {
		attrs.width = `${spec.width}px`;
	}
	if (spec.height) {
		attrs.height = `${spec.height}px`;
	}
	if (image.id) {
		attrs.sizeSlug = "full";
		attrs.linkDestination = "none";
		figureClass.push("size-full");
	}
	if (spec.width || spec.height) {
		figureClass.push("is-resized");
	}
	const img = imgTag(
		spec,
		image,
		image.id ? `wp-image-${image.id}` : undefined,
	);
	return block(
		"image",
		`<figure class="${figureClass.join(" ")}">${img}</figure>`,
		attrs,
	);
}

/** A paragraph made only of images becomes one image block per image. */
function imageOnlyParagraph(inline: Token, env: Env): string[] | undefined {
	const children = inline.children ?? [];
	const images = children.filter(
		(t) => t.type === "image" || isImageEmbed(t),
	);
	const onlyImages =
		images.length > 0 &&
		children.every(
			(t) =>
				t.type === "image" ||
				isImageEmbed(t) ||
				t.type === "softbreak" ||
				(t.type === "text" && !t.content.trim()),
		);
	return onlyImages ? images.map((t) => imageBlock(t, env)) : undefined;
}

function taskMarker(html: string): string {
	return html.replace(/^\[ \] /, "☐ ").replace(/^\[[xX]\] /, "☑ ");
}

function listBlock(
	tokens: Token[],
	open: number,
	close: number,
	env: Env,
): string {
	const ordered = tokens[open].type === "ordered_list_open";
	const start = Number(tokens[open].attrGet("start") ?? 1);
	const items: string[] = [];

	for (let i = open + 1; i < close; i++) {
		if (tokens[i].type !== "list_item_open") {
			continue;
		}
		const itemClose = findClose(tokens, i);
		const text: string[] = [];
		const nested: string[] = [];
		for (let j = i + 1; j < itemClose; j++) {
			const token = tokens[j];
			if (token.type === "inline") {
				text.push(renderInline(token, env));
			} else if (
				token.type === "bullet_list_open" ||
				token.type === "ordered_list_open"
			) {
				const end = findClose(tokens, j);
				nested.push(listBlock(tokens, j, end, env));
				j = end;
			} else if (token.type === "fence" || token.type === "code_block") {
				// ponytail: list items only hold rich text and nested lists, so code is kept inline
				text.push(
					`<code>${escape(token.content.replace(/\n$/, ""))}</code>`,
				);
			}
		}
		items.push(
			block(
				"list-item",
				`<li>${taskMarker(text.join("<br>"))}${nested.join("\n\n")}</li>`,
			),
		);
		i = itemClose;
	}

	const tag = ordered ? "ol" : "ul";
	const attrs: Record<string, unknown> = {};
	if (ordered) {
		attrs.ordered = true;
	}
	if (ordered && start !== 1) {
		attrs.start = start;
	}
	const startAttr = ordered && start !== 1 ? ` start="${start}"` : "";
	return block(
		"list",
		`<${tag}${startAttr} class="wp-block-list">${items.join("\n\n")}</${tag}>`,
		attrs,
	);
}

function cellAttrs(token: Token): string {
	const align = /text-align:(\w+)/.exec(String(token.attrGet("style") ?? ""))?.[1];
	return align
		? ` class="has-text-align-${align}" data-align="${align}"`
		: "";
}

function tableBlock(
	tokens: Token[],
	open: number,
	close: number,
	env: Env,
): string {
	let html = "";
	for (let i = open + 1; i < close; i++) {
		const token = tokens[i];
		switch (token.type) {
			case "thead_open":
				html += "<thead>";
				break;
			case "thead_close":
				html += "</thead>";
				break;
			case "tbody_open":
				html += "<tbody>";
				break;
			case "tbody_close":
				html += "</tbody>";
				break;
			case "tr_open":
				html += "<tr>";
				break;
			case "tr_close":
				html += "</tr>";
				break;
			case "th_open":
			case "td_open":
				html += `<${token.tag}${cellAttrs(token)}>`;
				break;
			case "th_close":
			case "td_close":
				html += `</${token.tag}>`;
				break;
			case "inline":
				html += renderInline(token, env);
				break;
		}
	}
	return block(
		"table",
		`<figure class="wp-block-table"><table class="has-fixed-layout">${html}</table></figure>`,
	);
}

function calloutBlock(
	tokens: Token[],
	open: number,
	close: number,
	env: Env,
): string | undefined {
	const first = tokens[open + 1];
	const inline = tokens[open + 2];
	if (first?.type !== "paragraph_open" || inline?.type !== "inline") {
		return undefined;
	}
	const [firstLine] = inline.content.split("\n");
	const match = CALLOUT.exec(firstLine);
	if (!match) {
		return undefined;
	}
	const [, type, fold, rawTitle] = match;
	const title = rawTitle
		? renderInlineSource(rawTitle, env)
		: escape(type.charAt(0).toUpperCase() + type.slice(1).toLowerCase());
	const children = inline.children ?? [];
	const lineBreak = children.findIndex((t) => t.type === "softbreak" || t.type === "hardbreak");
	const rest = lineBreak === -1 ? [] : children.slice(lineBreak + 1);
	const body = [
		...(rest.length ? [paragraph(md.renderer.renderInline(rest, md.options, env))] : []),
		...renderBlocks(tokens, findClose(tokens, open + 1) + 1, close, env),
	].join("\n\n");
	const className = `callout callout-${type.toLowerCase()}`;

	if (fold) {
		const attrs: Record<string, unknown> = { className };
		if (fold === "+") {
			attrs.showContent = true;
		}
		const openAttr = fold === "+" ? " open" : "";
		return block(
			"details",
			`<details class="wp-block-details ${className}"${openAttr}><summary>${title}</summary>${body}</details>`,
			attrs,
		);
	}
	const heading = paragraph(`<strong>${title}</strong>`);
	return block(
		"quote",
		`<blockquote class="wp-block-quote ${className}">${[heading, body].filter(Boolean).join("\n\n")}</blockquote>`,
		{ className },
	);
}

function renderBlocks(
	tokens: Token[],
	start: number,
	end: number,
	env: Env,
): string[] {
	const out: string[] = [];
	for (let i = start; i < end; i++) {
		const token = tokens[i];
		const close = token.nesting === 1 ? findClose(tokens, i) : i;

		switch (token.type) {
			case "paragraph_open": {
				const inline = tokens[i + 1];
				out.push(
					...(imageOnlyParagraph(inline, env) ?? [
						paragraph(renderInline(inline, env)),
					]),
				);
				break;
			}
			case "heading_open": {
				const level = Number(token.tag.slice(1));
				const html = `<${token.tag} class="wp-block-heading">${renderInline(tokens[i + 1], env)}</${token.tag}>`;
				out.push(
					block("heading", html, level === 2 ? undefined : { level }),
				);
				break;
			}
			case "bullet_list_open":
			case "ordered_list_open":
				out.push(listBlock(tokens, i, close, env));
				break;
			case "blockquote_open":
				out.push(
					calloutBlock(tokens, i, close, env) ??
						block(
							"quote",
							`<blockquote class="wp-block-quote">${renderBlocks(tokens, i + 1, close, env).join("\n\n")}</blockquote>`,
						),
				);
				break;
			case "table_open":
				out.push(tableBlock(tokens, i, close, env));
				break;
			case "fence":
			case "code_block":
				out.push(
					block(
						"code",
						`<pre class="wp-block-code"><code>${escape(token.content.replace(/\n$/, ""))}</code></pre>`,
					),
				);
				break;
			case "hr":
				out.push(
					block(
						"separator",
						`<hr class="wp-block-separator has-alpha-channel-opacity"/>`,
					),
				);
				break;
			case "html_block":
				{
					const html = token.content.trim();
					if (html) {
						out.push(block("html", html));
					}
				}
				break;
			case "footnote_block_open":
				out.push(
					block(
						"html",
						md.renderer
							.render(tokens.slice(i, close + 1), md.options, env)
							.trim(),
					),
				);
				break;
		}
		i = close;
	}
	return out;
}

/** Converts a note body (without frontmatter) to block markup. */
export function toBlocks(markdown: string, resolvers: Resolvers): string {
	const env: Env = { resolvers };
	const tokens = md.parse(stripComments(markdown), env);
	return renderBlocks(tokens, 0, tokens.length, env).join("\n\n");
}

/** Lists the image paths a note references, as written, in order and without duplicates. */
export function findImagePaths(markdown: string): string[] {
	const paths = new Set<string>();
	const visit = (tokens: Token[]) => {
		for (const token of tokens) {
			if (token.type === "image" || isImageEmbed(token)) {
				paths.add(imageSpec(token).path);
			}
			if (token.children) {
				visit(token.children);
			}
		}
	};
	visit(
		md.parse(stripComments(markdown), {
			resolvers: { image: () => undefined, link: () => undefined },
		}),
	);
	return [...paths];
}
