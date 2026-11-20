import { describe, expect, it } from "vitest";
import { describeKbdKeys, resolveKbdKey, resolveKbdKeys, splitKbdKeys } from "./kbd-keys";

describe("splitKbdKeys", () => {
	it("splits a shortcut string and keeps object entries as-is", () => {
		expect(splitKbdKeys("mod+shift+k")).toEqual(["mod", "shift", "k"]);
		expect(splitKbdKeys("  ")).toEqual([]);
		expect(splitKbdKeys(["mod", { mac: "⌃" }])).toEqual(["mod", { mac: "⌃" }]);
	});
});

describe("resolveKbdKeys", () => {
	it("maps mod to the primary modifier of each platform", () => {
		expect(resolveKbdKeys("mod+k", "mac")).toEqual(["⌘", "K"]);
		expect(resolveKbdKeys("mod+k", "windows")).toEqual(["Ctrl", "K"]);
		expect(resolveKbdKeys("mod+k", "linux")).toEqual(["Ctrl", "K"]);
	});

	it("keeps ctrl on the physical Control key instead of folding it into mod", () => {
		expect(resolveKbdKeys("ctrl+1", "mac")).toEqual(["⌃", "1"]);
		expect(resolveKbdKeys("ctrl+1", "windows")).toEqual(["Ctrl", "1"]);
	});

	it("uses mac symbols for modifiers and special keys", () => {
		expect(resolveKbdKeys("mod+alt+shift+enter", "mac")).toEqual(["⌘", "⌥", "⇧", "⏎"]);
		expect(resolveKbdKeys("mod+alt+shift+enter", "windows")).toEqual(["Ctrl", "Alt", "Shift", "Enter"]);
	});

	it("renders letters upper-case and function keys as F1..F12", () => {
		expect(resolveKbdKeys("f5", "mac")).toEqual(["F5"]);
		expect(resolveKbdKeys("mod+k", "mac")).toEqual(["⌘", "K"]);
	});

	it("accepts multi-word and camel-case tokens", () => {
		expect(resolveKbdKeys("CmdOrCtrl+Page Up", "mac")).toEqual(["⌘", "⇞"]);
		expect(resolveKbdKeys("commandorcontrol+Page Up", "windows")).toEqual(["Ctrl", "PgUp"]);
	});

	it("supports per-platform overrides and falls back to windows", () => {
		const keys = ["ctrl", { mac: "⌘", windows: "Win" }, "space"];
		expect(resolveKbdKeys(keys, "mac")).toEqual(["⌃", "⌘", "Space"]);
		expect(resolveKbdKeys(keys, "windows")).toEqual(["Ctrl", "Win", "Space"]);
		expect(resolveKbdKeys(keys, "linux")).toEqual(["Ctrl", "Win", "Space"]);
	});

	it("returns an empty list for an empty shortcut", () => {
		expect(resolveKbdKeys("", "mac")).toEqual([]);
	});

	it("keeps unknown tokens readable instead of dropping them", () => {
		expect(resolveKbdKey("volumeup", "mac")).toBe("volumeup");
	});
});

describe("describeKbdKeys", () => {
	it("reads modifier glyphs out as key names", () => {
		expect(describeKbdKeys("mod+shift+k", "mac")).toBe("Command Shift K");
		expect(describeKbdKeys("mod+shift+k", "windows")).toBe("Control Shift K");
		expect(describeKbdKeys("ctrl+enter", "mac")).toBe("Control Return");
	});
});
