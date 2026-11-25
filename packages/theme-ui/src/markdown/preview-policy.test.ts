import { describe, expect, it } from "vitest";
import { withBackground, withIntrinsicSize } from "./preview-policy";

describe("withIntrinsicSize", () => {
	it("sizes a Mermaid diagram from its viewBox so an image is not shrunk to the default box", () => {
		const svg =
			'<svg id="diagram" width="100%" xmlns="http://www.w3.org/2000/svg" style="max-width: 812.5px; background-color: white;" viewBox="0 0 812.5 1460"><path stroke-width="2"/></svg>';
		expect(withIntrinsicSize(svg)).toBe(
			'<svg id="diagram" xmlns="http://www.w3.org/2000/svg" style="background-color: white;" viewBox="0 0 812.5 1460" width="812.5" height="1460"><path stroke-width="2"/></svg>',
		);
	});
	it("leaves SVGs with an absolute width or no usable viewBox unchanged", () => {
		for (const svg of [
			'<svg width="320" height="200" viewBox="0 0 640 400"></svg>',
			'<svg width="100%"></svg>',
			'<svg width="100%" viewBox="0 0 0 10"></svg>',
		])
			expect(withIntrinsicSize(svg)).toBe(svg);
	});
});

describe("withBackground", () => {
	it("replaces Mermaid's own background so a dark-mode diagram keeps a light canvas", () => {
		expect(
			withBackground('<svg id="d" style="max-width: 10px; background-color: white;"><g/></svg>', "#e8e8ea"),
		).toBe('<svg id="d" style="max-width: 10px; background-color: #e8e8ea;"><g/></svg>');
		expect(withBackground('<svg viewBox="0 0 1 1"></svg>', "#e8e8ea")).toBe(
			'<svg viewBox="0 0 1 1" style="background-color: #e8e8ea;"></svg>',
		);
	});
});
