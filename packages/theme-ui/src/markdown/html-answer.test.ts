import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import { describe, expect, it } from "vitest";
import { isClosedHtmlFence, isHtmlPreviewLanguage } from "./html-answer";

function parsedReadiness(text: string): boolean[] {
	const results: boolean[] = [];
	renderToStaticMarkup(
		createElement(
			ReactMarkdown,
			{
				components: {
					code: ({ className, children, node }) => {
						if (isHtmlPreviewLanguage(className?.replace("language-", "") ?? "")) {
							results.push(isClosedHtmlFence(text, node?.position, String(children ?? "").replace(/\n$/, "")));
						}
						return createElement("code", null, children);
					},
				},
			},
			text,
		),
	);
	return results;
}

describe("HTML answer fence closure from Markdown source positions", () => {
	it.each([
		["standard fence", "```html-preview\n<h1>Answer</h1>\n```"],
		["space before info", "``` html-preview\n<h1>Answer</h1>\n```"],
		["tab before info", "~~~\thtml-preview\n<h1>Answer</h1>\n~~~"],
		["uppercase info", "~~~ HTML-PREVIEW\n<h1>Answer</h1>\n~~~"],
		["ordinary HTML with metadata", "``` html title=answer\n<h1>Answer</h1>\n```"],
		["longer closing fence", "```html-preview\n<h1>Answer</h1>\n`````"],
		["CRLF", "```html-preview\r\n<h1>Answer</h1>\r\n```"],
		["CR", "```html-preview\r<h1>Answer</h1>\r```"],
		["trailing newline", "```html-preview\n<h1>Answer</h1>\n```\n"],
		["blank final code line", "```html-preview\n<h1>Answer</h1>\n\n```"],
		["empty body", "```html-preview\n```"],
		["blank body", "```html-preview\n\n```"],
		["blockquote", "> ```html-preview\n> <h1>Answer</h1>\n> ```"],
		["nested blockquote", "> > ```html-preview\n> > <h1>Answer</h1>\n> > ```"],
		["list", "- ```html-preview\n  <h1>Answer</h1>\n  ```"],
		["wide ordered list", "100. ```html-preview\n     <h1>Answer</h1>\n     ```"],
		["list continuation", "- Item\n\n  ```html-preview\n  <h1>Answer</h1>\n  ```"],
		["quote inside list", "- > ```html-preview\n  > <h1>Answer</h1>\n  > ```"],
		["list inside quote", "> - ```html-preview\n>   <h1>Answer</h1>\n>   ```"],
		["surrounding paragraphs", "Before\n\n> ```html-preview\n> <h1>Answer</h1>\n> ```\n\nAfter"],
		["container tabs", ">\t```html-preview\n>\t<h1>Answer</h1>\n>\t```"],
		["empty quoted body", "> ```html-preview\n> ```"],
		["literal quote closer in body", "```html-preview\n> ```\n```"],
	])("recognizes a closed %s", (_name, source) => {
		expect(parsedReadiness(source)).toEqual([true]);
	});

	it.each([
		["EOF", "```html-preview\n<h1>Answer</h1>"],
		["newline at EOF", "```html-preview\n<h1>Answer</h1>\n"],
		["short closer", "````html-preview\n<h1>Answer</h1>\n```"],
		["wrong marker", "```html-preview\n<h1>Answer</h1>\n~~~"],
		["closing metadata", "```html-preview\n<h1>Answer</h1>\n``` extra"],
		["quoted apparent closer", "```html-preview\n<h1>Answer</h1>\n> ```"],
		["indented apparent closer", "```html-preview\n<h1>Answer</h1>\n    ```"],
		["extra quote apparent closer", "> ```html-preview\n> <h1>Answer</h1>\n> > ```"],
		["quoted apparent closer before EOF newline", "```html-preview\n<h1>Answer</h1>\n> ```\n"],
		["indented list apparent closer", "- Item\n\n  ```html-preview\n  <h1>Answer</h1>\n      ```"],
		["container ends", "> ```html-preview\n> <h1>Answer</h1>\n\nOutside"],
	])("rejects an unclosed fence ending with %s", (_name, source) => {
		expect(parsedReadiness(source)).toEqual([false]);
	});

	it("keeps the two-argument API conservative and fails closed without positions", () => {
		const source = "``` html-preview\n<h1>Answer</h1>\n```";
		expect(isClosedHtmlFence(source, { start: { offset: 0 }, end: { offset: source.length } })).toBe(true);
		expect(isClosedHtmlFence(source)).toBe(false);
		const quoted = "> ```html-preview\n> <h1>Answer</h1>\n> ```";
		expect(isClosedHtmlFence(quoted, { start: { offset: 2 }, end: { offset: quoted.length } })).toBe(false);
	});
});
