import { describe, expect, it } from "vitest";
import { PROGRESSIVE_MARKDOWN_THRESHOLD, splitMarkdownForProgressiveRender } from "./progressive-chunks";

function sections(count: number, body = "text ".repeat(600)): string {
	return Array.from({ length: count }, (_, index) => `## Section ${index}\n\n${body}\n`).join("\n");
}

describe("splitMarkdownForProgressiveRender", () => {
	it("keeps small documents whole", () => {
		const small = "# Title\n\nshort";
		expect(splitMarkdownForProgressiveRender(small)).toEqual([small]);
	});

	it("cuts large documents before headings and loses no text", () => {
		const markdown = sections(40);
		expect(markdown.length).toBeGreaterThan(PROGRESSIVE_MARKDOWN_THRESHOLD);
		const chunks = splitMarkdownForProgressiveRender(markdown);
		expect(chunks.length).toBeGreaterThan(1);
		expect(chunks.join("\n")).toBe(markdown);
		for (const chunk of chunks.slice(1)) expect(chunk.startsWith("## Section")).toBe(true);
	});

	it("never cuts inside fenced code, even before a heading-like line", () => {
		const fenced = `\`\`\`md\n${Array.from({ length: 400 }, (_, i) => `\n# not a heading ${i}`).join("\n")}\n\`\`\`\n`;
		const markdown = `${sections(10)}\n${fenced}\n${sections(10)}`;
		const chunks = splitMarkdownForProgressiveRender(markdown);
		for (const chunk of chunks) {
			expect((chunk.match(/^```/gm) ?? []).length % 2).toBe(0);
		}
	});

	it("repeats link reference definitions in every chunk", () => {
		const markdown = `${sections(40, `${"text ".repeat(600)} see [docs][ref]`)}\n[ref]: https://example.com\n`;
		const chunks = splitMarkdownForProgressiveRender(markdown);
		expect(chunks.length).toBeGreaterThan(1);
		for (const chunk of chunks) expect(chunk).toContain("[ref]: https://example.com");
	});

	it("does not split documents with footnotes", () => {
		const markdown = `${sections(40)}\nNote[^1]\n\n[^1]: footnote\n`;
		expect(splitMarkdownForProgressiveRender(markdown)).toEqual([markdown]);
	});
});
