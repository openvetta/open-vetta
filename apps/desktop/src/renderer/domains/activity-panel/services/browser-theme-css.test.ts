import { describe, expect, it } from "vitest";
import { browserThemeCss } from "./browser-theme-css";

describe("browserThemeCss", () => {
	it("declares only the color scheme so site colors stay untouched", () => {
		expect(browserThemeCss("dark")).toBe(":root { color-scheme: dark; }");
		expect(browserThemeCss("light")).toBe(":root { color-scheme: light; }");
	});
});
