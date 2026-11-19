// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

function setPlatform(platform: string): void {
	Object.defineProperty(navigator, "platform", { value: platform, configurable: true });
	vi.resetModules();
}

afterEach(() => {
	Object.defineProperty(navigator, "platform", { value: "", configurable: true });
});

describe("formatShortcut", () => {
	it("uses the macOS control glyph for ctrl on macOS", async () => {
		setPlatform("MacIntel");
		const { formatShortcut, shortcutParts } = await import("./platform");
		expect(formatShortcut("ctrl+1")).toBe("⌃ 1");
		expect(shortcutParts("ctrl+1")).toEqual(["⌃", "1"]);
	});

	it("keeps the Ctrl word on Windows and Linux", async () => {
		setPlatform("Win32");
		const { formatShortcut } = await import("./platform");
		expect(formatShortcut("ctrl+9")).toBe("Ctrl 9");
	});
});
