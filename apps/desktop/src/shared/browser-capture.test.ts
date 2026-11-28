import { describe, expect, it } from "vitest";
import { browserCaptureSchema, buildBrowserCaptureContext, parseBrowserCaptureContext } from "./browser-capture";

const capture = {
	version: 1,
	id: "capture-1",
	imagePath: process.platform === "win32" ? "C:/work/page.png" : "/work/page.png",
	url: "http://localhost:3000/",
	title: "Preview",
	mode: "element",
	width: 1200,
	height: 800,
	viewport: { width: 600, height: 400 },
	rect: { x: 20, y: 30, width: 100, height: 40 },
	element: { tag: "button", text: "Save", locator: "#save" },
	note: "Move this button",
};

describe("browser screenshot context", () => {
	it("preserves each image's note and selection across a prompt context round trip", () => {
		const first = browserCaptureSchema.parse(capture);
		const second = browserCaptureSchema.parse({ ...capture, id: "capture-2", note: "", mode: "region" });
		const context = buildBrowserCaptureContext([first, second], "user-1");
		expect(parseBrowserCaptureContext(context.metadata)).toEqual({ messageId: "user-1", captures: [first, second] });
		expect(context.content).toContain("Move this button");
		expect(context.content).toContain("Screenshot 2");
	});
	it("rejects selections outside the captured viewport and invalid dimensions", () => {
		expect(
			browserCaptureSchema.safeParse({ ...capture, rect: { x: 590, y: 0, width: 100, height: 40 } }).success,
		).toBe(false);
		expect(browserCaptureSchema.safeParse({ ...capture, width: 0 }).success).toBe(false);
		expect(parseBrowserCaptureContext({ version: 99, captures: [capture] })).toBeNull();
	});
});
