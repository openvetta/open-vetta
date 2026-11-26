import { describe, expect, it } from "vitest";
import { isAppSelfNavigation } from "./main-window-navigation";

describe("isAppSelfNavigation", () => {
	it("allows reloads of the packaged renderer page", () => {
		const page = "file:///Applications/Vetta.app/Contents/Resources/renderer/index.html";
		expect(isAppSelfNavigation(`${page}#/settings`, page)).toBe(true);
	});

	it("allows navigation within the dev server origin", () => {
		expect(isAppSelfNavigation("http://localhost:5173/?x=1", "http://localhost:5173/")).toBe(true);
	});

	it("rejects web pages so they cannot replace the app window", () => {
		expect(isAppSelfNavigation("https://github.com/openvetta/open-vetta", "http://localhost:5173/")).toBe(false);
		expect(
			isAppSelfNavigation(
				"https://github.com/openvetta/open-vetta",
				"file:///Applications/Vetta.app/Contents/Resources/renderer/index.html",
			),
		).toBe(false);
	});

	it("rejects other local files", () => {
		expect(
			isAppSelfNavigation(
				"file:///Users/me/notes.md",
				"file:///Applications/Vetta.app/Contents/Resources/renderer/index.html",
			),
		).toBe(false);
	});
});
