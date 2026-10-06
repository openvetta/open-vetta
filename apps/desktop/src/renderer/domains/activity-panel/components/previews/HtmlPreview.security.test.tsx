// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { HtmlPreviewView } from "@vetta-org/theme-ui/activity/html-preview";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

function preview(content: string): { frame: HTMLIFrameElement; document: Document } {
	render(<HtmlPreviewView content={content} title="HTML preview" />);
	const frame = screen.getByTitle<HTMLIFrameElement>("HTML preview");
	return { frame, document: new DOMParser().parseFromString(frame.srcdoc, "text/html") };
}

function expectStaticDocument(document: Document): void {
	expect(document.querySelector("script, iframe, frame, object, embed, base, link, form, math, foreignObject, template")).toBeNull();
	for (const element of document.querySelectorAll("*")) {
		for (const attribute of Array.from(element.attributes)) {
			expect(attribute.name).not.toMatch(/^on/i);
			expect(["href", "xlink:href", "srcset", "action", "formaction", "srcdoc", "is", "ping", "target"])
				.not.toContain(attribute.name);
			if (attribute.name === "src") expect(attribute.value).toMatch(/^data:image\/(png|jpeg|gif|webp|avif|bmp|x-icon);base64,/i);
		}
	}
	expect(document.querySelectorAll("meta")).toHaveLength(2);
	expect(document.head.firstElementChild?.getAttribute("http-equiv")).toBe("Content-Security-Policy");
}

describe("HTML preview security boundary", () => {
	it("uses an opaque, scriptless sandbox and installs the offline policy before source content", () => {
		const { frame, document } = preview(`<html><head><style>body { color: purple }</style>
			<meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline'">
			<meta http-equiv="refresh" content="0;url=https://attack.invalid/"></head><body><h1>Report</h1></body></html>`);
		expect(frame.getAttribute("sandbox")).toBe("");
		expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
		expectStaticDocument(document);
		const policy = document.head.firstElementChild?.getAttribute("content") ?? "";
		for (const directive of ["default", "script", "connect", "font", "media", "object", "frame", "child", "worker", "manifest"]) {
			expect(policy).toContain(`${directive}-src 'none'`);
		}
		expect(policy).toContain("base-uri 'none'");
		expect(policy).toContain("form-action 'none'");
		expect(policy).toContain("style-src 'unsafe-inline'");
		expect(policy).toContain("img-src data:");
		expect(document.querySelector("h1")?.textContent).toBe("Report");
		expect(document.querySelector("style")?.textContent).toContain("color: purple");
	});

	it.each([
		["full document", "<!doctype html><html><head><title>Report</title></head><body><article><h1>Answer</h1><p>Useful content</p></article></body></html>"],
		["fragment", "<article><h1>Answer</h1><p>Useful content</p></article>"],
		["uppercase markup", "<HTML><HEAD></HEAD><BODY><ARTICLE><H1>Answer</H1><P>Useful content</P></ARTICLE></BODY></HTML>"],
		["incomplete markup", "<article><h1>Answer</h1><p>Useful content"],
	])("preserves semantic content in a %s", (_name, source) => {
		const { document } = preview(source);
		expect(document.querySelector("article h1")?.textContent).toBe("Answer");
		expect(document.querySelector("article p")?.textContent).toBe("Useful content");
		expectStaticDocument(document);
	});

	it("preserves styles, body classes, table semantics and safe SVG geometry", () => {
		const { document } = preview(`<html><head><style>.amount { font-weight: bold }</style></head>
			<body class="report" style="background: white"><table><caption>Totals</caption><thead><tr><th scope="col">Value</th></tr></thead>
			<tbody><tr><td class="amount" data-value="42">42</td></tr></tbody></table>
			<svg viewBox="0 0 200 80" role="img" aria-label="Chart"><defs><linearGradient id="gradient"><stop offset="0" stop-color="red" /></linearGradient></defs>
			<path d="M0 80 L100 0 L200 80" fill="url(#gradient)" /><circle cx="100" cy="40" r="5" /><text x="5" y="15">42</text></svg></body></html>`);
		expect(document.body.className).toBe("report");
		expect(document.body.style.background).toBe("white");
		expect(document.querySelector("th")?.getAttribute("scope")).toBe("col");
		expect(document.querySelector("td")?.getAttribute("data-value")).toBe("42");
		expect(document.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 200 80");
		expect(document.querySelector("linearGradient stop")?.getAttribute("stop-color")).toBe("red");
		expect(document.querySelector("path")?.getAttribute("d")).toBe("M0 80 L100 0 L200 80");
		expect(document.querySelector("svg text")?.textContent).toBe("42");
		expectStaticDocument(document);
	});

	it("retains native details, labels and CSS radio/checkbox controls while flattening forms", () => {
		const { document } = preview(`<style>#second:checked ~ .panel { display: block }</style>
			<form action="https://attack.invalid/" method="post"><fieldset><legend>Choose a tab</legend>
			<input type="radio" name="tabs" id="first" checked><label for="first">First</label>
			<input type="radio" name="tabs" id="second"><label for="second">Second</label>
			<input type="checkbox" id="toggle"><label for="toggle">Show more</label><div class="panel">Second panel</div>
			<button type="submit" formaction="https://attack.invalid/">Go</button></fieldset></form>
			<details><summary>More detail</summary><p>Explanation</p></details>`);
		const first = document.querySelector<HTMLInputElement>("#first");
		const second = document.querySelector<HTMLInputElement>("#second");
		const toggle = document.querySelector<HTMLInputElement>("#toggle");
		expect(first?.checked).toBe(true);
		second?.click();
		expect(second?.checked).toBe(true);
		expect(first?.checked).toBe(false);
		toggle?.click();
		expect(toggle?.checked).toBe(true);
		expect(document.querySelector('label[for="second"]')?.textContent).toBe("Second");
		expect(document.querySelector("style")?.textContent).toContain("#second:checked ~ .panel");
		document.querySelector("summary")?.click();
		expect(document.querySelector("details")?.open).toBe(true);
		expect(document.querySelector("button")?.type).toBe("button");
		expectStaticDocument(document);
	});

	it("removes scripts, event handlers, form associations and every navigation link, including fragments", () => {
		const { document } = preview(`<script>parent.vetta.fs.readFile('/private'); require('electron'); location='https://attack.invalid/'</script>
			<div onclick="window.open('https://attack.invalid/')" onpointerenter="alert(1)">Safe text</div>
			<a href="https://attack.invalid/" target="_top" ping="https://attack.invalid/ping">External</a>
			<a href="#section">Fragment</a><a href="javascript:alert(1)">Script</a><a href="file:///private">File</a>
			<svg><a href="https://attack.invalid/"><text>SVG link</text></a><use href="#shape" /></svg>
			<input type="text" form="outer" formaction="https://attack.invalid/" autofocus autocomplete="on">
			<button popovertarget="host" commandfor="host" is="host-button">Static button</button>`);
		expectStaticDocument(document);
		expect(document.querySelector("div")?.textContent).toBe("Safe text");
		expect(document.querySelectorAll("a")).toHaveLength(4);
		expect(document.querySelector("input")?.getAttribute("form")).toBeNull();
		expect(document.querySelector("input")?.hasAttribute("autofocus")).toBe(false);
		expect(document.querySelector("input")?.autocomplete).toBe("off");
		expect(document.querySelector("button")?.getAttribute("popovertarget")).toBeNull();
	});

	it("drops embedded documents, foreign execution contexts and credential/file inputs", () => {
		const { document } = preview(`<iframe srcdoc="<script>alert(1)</script>" src="https://attack.invalid/"></iframe>
			<object data="file:///private"><p>Object fallback</p></object><embed src="https://attack.invalid/">
			<math><mtext><img src="https://attack.invalid/"></mtext></math>
			<svg><foreignObject><div>Foreign content</div></foreignObject><script>alert(1)</script><animate attributeName="href" values="https://attack.invalid/"></animate></svg>
			<template><img src="https://attack.invalid/"></template><input type="file"><input type="password"><input type="image" src="https://attack.invalid/">
			<input type="unknown"><input type="range" min="0" max="10" value="4">`);
		expectStaticDocument(document);
		expect(document.body.textContent).not.toContain("Foreign content");
		expect(document.body.textContent).not.toContain("Object fallback");
		expect(document.querySelectorAll("input")).toHaveLength(1);
		expect(document.querySelector("input")?.type).toBe("range");
	});

	it("allows only embedded base64 raster image sources", () => {
		const { document } = preview(`<img alt="raster" src="data:image/png;base64,iVBORw0KGgo=" width="200" height="100">
			<img src="https://attack.invalid/pixel" srcset="https://attack.invalid/2x 2x">
			<img src="//attack.invalid/pixel"><img src="file:///private"><img src="blob:https://app.invalid/id">
			<img src="data:image/svg+xml;base64,PHN2Zz4="><img src="data:text/html;base64,PHNjcmlwdD4=">
			<img src="data:image/png;name=x;base64,YQ=="><img src="data:image/png;base64,not base64">`);
		expect(document.querySelectorAll("img[src]")).toHaveLength(1);
		expect(document.querySelector("img[src]")?.getAttribute("alt")).toBe("raster");
		expectStaticDocument(document);
	});

	it.each([
		'<svg><style><a id="</style><img src=https://attack.invalid/ onerror=alert(1)>"></a></style></svg><p>After</p>',
		'<math><mtext><table><mglyph><style><!--</style><img title="--><img src=https://attack.invalid/ onerror=alert(1)>">',
		'<noscript><p title="</noscript><img src=https://attack.invalid/ onerror=alert(1)>">x</p>',
		'<STYLE>p::before { content: "<img src=x onerror=alert(1)>" }</STYLE><p>After</p>',
		'<textarea>&lt;/textarea&gt;&lt;script&gt;alert(1)&lt;/script&gt;</textarea>',
		'<svg><desc><style><img src=https://attack.invalid/ onerror=alert(1)></style></desc></svg>',
	])("remains safe after serializing and reparsing malformed or mutation payloads: %s", (source) => {
		const { document } = preview(source);
		expectStaticDocument(document);
		for (const style of document.querySelectorAll("style")) expect(style.textContent).not.toContain("<");
		const reparsed = new DOMParser().parseFromString(document.documentElement.outerHTML, "text/html");
		expectStaticDocument(reparsed);
	});

	it("never upgrades host custom elements during parsing or reconstruction", () => {
		const upgrade = vi.fn();
		customElements.define("preview-security-probe", class extends HTMLElement {
			constructor() { super(); upgrade(); }
		});
		const { document } = preview('<preview-security-probe><p>Preserved child</p></preview-security-probe><div is="preview-security-probe">Static</div>');
		expect(upgrade).not.toHaveBeenCalled();
		expect(document.querySelector("preview-security-probe")).toBeNull();
		expect(document.querySelector("p")?.textContent).toBe("Preserved child");
		expect(document.querySelector("[is]")).toBeNull();
	});

	it("bounds deeply nested untrusted trees without a recursive stack overflow", () => {
		const { document } = preview(`${"<div>".repeat(600)}too deep${"</div>".repeat(600)}<p>Visible sibling</p>`);
		expect(document.querySelectorAll("div").length).toBeLessThanOrEqual(128);
		expect(document.querySelector("p")?.textContent).toBe("Visible sibling");
		expectStaticDocument(document);
	});

	it("keeps document chrome light and wide content scrollable", () => {
		const { frame, document } = preview('<div style="width: 2000px">Wide report</div>');
		expect(frame.style.colorScheme).toBe("light");
		const chrome = document.querySelector("style[data-preview-chrome]")?.textContent ?? "";
		expect(chrome).toContain("overflow-x: auto !important");
		expect(chrome).toContain("max-width: 100%");
		expect(chrome).toContain("box-sizing: border-box");
	});

	it("fails closed to escaped source when server-rendered without a DOM parser", () => {
		const source = '<h1>Answer & evidence</h1><script>alert(1)</script><img src="https://attack.invalid/">';
		let markup: string;
		vi.stubGlobal("document", undefined);
		try {
			markup = renderToStaticMarkup(<HtmlPreviewView content={source} title="Server preview" />);
		} finally {
			vi.unstubAllGlobals();
		}
		const host = new DOMParser().parseFromString(markup, "text/html");
		const frame = host.querySelector("iframe");
		expect(frame?.getAttribute("sandbox")).toBe("");
		const result = new DOMParser().parseFromString(frame?.srcdoc ?? "", "text/html");
		expect(result.querySelector("pre")?.textContent).toBe(source);
		expect(result.querySelector("h1, img, script")).toBeNull();
		expectStaticDocument(result);
	});

	it("renders a new answer, resets loading and keeps the restrictive frame contract after updates", () => {
		const view = render(<HtmlPreviewView content="<h1>First</h1>" title="HTML preview" theme="dark" />);
		const frame = screen.getByTitle<HTMLIFrameElement>("HTML preview");
		expect(frame.parentElement?.getAttribute("aria-busy")).toBe("true");
		fireEvent.load(frame);
		expect(frame.parentElement?.getAttribute("aria-busy")).toBe("false");
		view.rerender(<HtmlPreviewView content='<h1>Updated</h1><script>alert(1)</script>' title="Updated preview" theme="light" />);
		expect(screen.getByTitle("Updated preview")).toBe(frame);
		expect(frame.parentElement?.getAttribute("aria-busy")).toBe("true");
		expect(frame.srcdoc).toContain("Updated");
		expect(frame.srcdoc).not.toContain("<script");
		expect(frame.getAttribute("sandbox")).toBe("");
		fireEvent.load(frame);
		expect(frame.parentElement?.getAttribute("aria-busy")).toBe("false");
	});
});
