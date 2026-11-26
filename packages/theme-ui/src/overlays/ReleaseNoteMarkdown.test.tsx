import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReleaseNoteMarkdown } from "./ReleaseNoteMarkdown";

function renderNote(note: string): string {
	return renderToStaticMarkup(<ReleaseNoteMarkdown>{note}</ReleaseNoteMarkdown>);
}

describe("ReleaseNoteMarkdown", () => {
	it("opens web links in a new window so the host hands them to the system browser", () => {
		const html = renderNote("See [the issue](https://github.com/openvetta/open-vetta/issues/8).");

		expect(html).toContain('href="https://github.com/openvetta/open-vetta/issues/8"');
		expect(html).toContain('target="_blank"');
		expect(html).toContain('rel="noopener noreferrer"');
	});

	it("renders non-web links as plain text so clicking cannot navigate the app window", () => {
		const html = renderNote("Read [the docs](./docs/guide.md).");

		expect(html).not.toContain("<a");
		expect(html).toContain("the docs");
	});
});
