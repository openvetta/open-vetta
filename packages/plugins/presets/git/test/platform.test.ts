import { describe, expect, it } from "vitest";
import { detectMac } from "../src/git/platform";

const nav = (parts: Partial<{ userAgentData: { platform?: string }; platform: string; userAgent: string }>) =>
	({ platform: "", userAgent: "", ...parts }) as never;

describe("detectMac", () => {
	it("trusts userAgentData when the browser provides it", () => {
		expect(detectMac(nav({ userAgentData: { platform: "macOS" }, platform: "Win32" }))).toBe(true);
	});

	it("falls back to navigator.platform", () => {
		expect(detectMac(nav({ platform: "MacIntel", userAgent: "Mozilla/5.0" }))).toBe(true);
		expect(detectMac(nav({ platform: "Linux x86_64", userAgent: "Mozilla/5.0" }))).toBe(false);
	});

	it("falls back to the user agent string", () => {
		expect(detectMac(nav({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" }))).toBe(true);
		expect(detectMac(nav({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }))).toBe(false);
	});

	it("does not match a platform whose name merely contains 'mac'-like words", () => {
		expect(detectMac(nav({ platform: "Win32", userAgent: "Mozilla/5.0 (Windows NT 10.0)" }))).toBe(false);
	});
});
