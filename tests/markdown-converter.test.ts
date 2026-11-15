import { test } from "node:test";
import assert from "node:assert/strict";
import MarkdownIt from "markdown-it";
import { findImagePaths, stripComments, toBlocks, type Resolvers } from "../src/markdown-converter.ts";

const resolvers: Resolvers = {
	image: (path) => (path === "pic.png" ? { url: "https://site/pic.png", id: 7 } : undefined),
	link: (target) => (target === "Other" ? "https://site/other" : undefined),
};
const convert = (md: string) => toBlocks(md, resolvers);

test("headings, paragraphs and escaping", () => {
	assert.equal(convert("## Hi"), '<!-- wp:heading -->\n<h2 class="wp-block-heading">Hi</h2>\n<!-- /wp:heading -->');
	assert.match(convert("### Three"), /<!-- wp:heading \{"level":3\} -->/);
	assert.match(convert("a < b and `**x**`"), /<p>a &lt; b and <code>\*\*x\*\*<\/code><\/p>/);
});

test("image embeds with size become image blocks", () => {
	assert.equal(
		convert("![[pic.png|300]]"),
		'<!-- wp:image {"id":7,"width":"300px","sizeSlug":"full","linkDestination":"none"} -->\n' +
			'<figure class="wp-block-image size-full is-resized"><img src="https://site/pic.png" alt="" class="wp-image-7" style="width:300px"/></figure>\n' +
			"<!-- /wp:image -->"
	);
	assert.deepEqual(findImagePaths("![[pic.png]] ![a](b%20c.png)\n```\n![[skip.png]]\n```\n![[pic.png]]"), ["pic.png", "b c.png"]);
});

test("wikilinks resolve to published posts or plain text", () => {
	assert.match(convert("See [[Other|that]] and [[Missing]]"), /See <a href="https:\/\/site\/other">that<\/a> and Missing/);
	assert.match(convert("[x](Other.md)"), /href="https:\/\/site\/other"/);
});

test("comments are removed", () => {
	assert.equal(convert("keep %%hide%% this"), "<!-- wp:paragraph -->\n<p>keep this</p>\n<!-- /wp:paragraph -->");
	assert.equal(convert("<div>\n%%secret%%\n</div>"), "<!-- wp:html -->\n<div>\n</div>\n<!-- /wp:html -->");
	assert.doesNotMatch(convert("a <!-- %%secret%% --> b"), /secret/);
	assert.doesNotMatch(convert("<div>%%secret\n\nmore secret%%</div>\n\nshown"), /secret/);
	assert.doesNotMatch(convert("text %%secret\n\n- more secret\n%% after"), /secret/);
	assert.doesNotMatch(convert("<div>`%%secret%%`</div>"), /secret/);
	assert.doesNotMatch(convert("\\`a %%secret%% b`"), /secret/);
	assert.doesNotMatch(convert("``` `bad`\n%%secret%%\n```"), /secret/);
	assert.match(convert("```\n%%kept%%\n```"), /%%kept%%/);
	assert.doesNotMatch(convert("`%%hidden%%` ok"), /hidden/);
	assert.doesNotMatch(convert("[[Other|%%secret%%x]] ![%%secret%%](pic.png) [a](u \"%%secret%%\")"), /secret/);
	assert.doesNotMatch(convert("%% open\n```\nsecret\n```\nstill secret %%"), /secret/);
	for (const note of ["```\n%% x\n```\nsecret %%", "%%\n```\n%%\nsecret\n```", "- a\n%%b%%\n\n    %%secret%%", "%%a\n\n```%%\n%%secret%%"]) {
		const out = stripComments(note);
		const code = new Set<number>();
		for (const t of new MarkdownIt({ html: true }).parse(out, {})) {
			if ((t.type === "fence" || t.type === "code_block") && t.map) {
				for (let line = t.map[0]; line < t.map[1]; line++) code.add(line);
			}
		}
		out.split("\n").forEach((line, i) => assert.ok(!line.includes("%%") || code.has(i), note));
	}
	assert.deepEqual(findImagePaths("%%![[hidden.png]]%% ![[shown.png]]"), ["shown.png"]);
	assert.equal(convert("%%\nsecret\n%%\n\nshown"), "<!-- wp:paragraph -->\n<p>shown</p>\n<!-- /wp:paragraph -->");
});

test("nested and task lists", () => {
	const out = convert("- [ ] todo\n- [x] done\n  1. inner");
	assert.match(out, /<li>☐ todo<\/li>/);
	assert.match(out, /<li>☑ done<!-- wp:list \{"ordered":true\} -->\n<ol class="wp-block-list"><!-- wp:list-item -->\n<li>inner<\/li>/);
});

test("tables", () => {
	assert.match(
		convert("| a | b |\n|:-:|---|\n| 1 | 2 |"),
		/<figure class="wp-block-table"><table class="has-fixed-layout"><thead><tr><th class="has-text-align-center" data-align="center">a<\/th><th>b<\/th>/
	);
});

test("callouts", () => {
	const plain = convert("> [!tip] Nice\n> body");
	assert.match(plain, /^<!-- wp:quote \{"className":"callout callout-tip"\} -->\n<blockquote class="wp-block-quote callout callout-tip"><!-- wp:paragraph -->\n<p><strong>Nice<\/strong><\/p>/);
	assert.match(plain, /<p>body<\/p>/);
	const folded = convert("> [!note]-\n> hidden");
	assert.match(folded, /^<!-- wp:details \{"className":"callout callout-note"\} -->\n<details class="wp-block-details callout callout-note"><summary>Note<\/summary>/);
	const withFootnote = convert("x[^1]\n\n> [!tip]- Title\n> body\n\n[^1]: note");
	assert.equal(withFootnote.match(/footnotes-sep/g)?.length, 1);
	assert.match(convert("> [!note]\n> body[^1]\n\n[^1]: note"), /body<sup class="footnote-ref"><a href="#fn1"/);
	assert.match(convert("> plain quote"), /<blockquote class="wp-block-quote"><!-- wp:paragraph -->\n<p>plain quote<\/p>/);
});

test("highlights, footnotes and code", () => {
	assert.match(convert("==hi=="), /<mark>hi<\/mark>/);
	assert.match(convert("x[^1]\n\n[^1]: note"), /<!-- wp:html -->\n<hr class="footnotes-sep">/);
	assert.match(convert("```js\na < b\n```"), /<pre class="wp-block-code"><code>a &lt; b<\/code><\/pre>/);
});
