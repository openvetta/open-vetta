import { describe, expect, it } from "vitest";
import { filterManageSessions, moveSelection, selectionAfterRemoval } from "./manage-sessions";

const items = [{ label: "修复登录" }, { label: "Write README" }, { label: "登录页重构" }];

describe("filterManageSessions", () => {
	it("returns everything in order without highlights for an empty query", () => {
		const result = filterManageSessions(items, "  ");
		expect(result.map((entry) => entry.item.label)).toEqual(["修复登录", "Write README", "登录页重构"]);
		expect(result.every((entry) => entry.ranges.length === 0)).toBe(true);
	});

	it("matches case-insensitively and reports the hit range", () => {
		const [hit] = filterManageSessions(items, "readme");
		expect(hit?.item.label).toBe("Write README");
		expect(hit?.ranges).toEqual([{ start: 6, end: 12 }]);
	});

	it("keeps the original order of matches", () => {
		expect(filterManageSessions(items, "登录").map((entry) => entry.item.label)).toEqual(["修复登录", "登录页重构"]);
	});

	it("returns nothing when no title matches", () => {
		expect(filterManageSessions(items, "zzz")).toEqual([]);
	});
});

describe("selectionAfterRemoval", () => {
	it("prefers the next row, then the previous one", () => {
		expect(selectionAfterRemoval(["a", "b", "c"], "b")).toBe("c");
		expect(selectionAfterRemoval(["a", "b", "c"], "c")).toBe("b");
	});

	it("returns null when the last row is removed", () => {
		expect(selectionAfterRemoval(["a"], "a")).toBeNull();
	});

	it("falls back to the first row for an unknown id", () => {
		expect(selectionAfterRemoval(["a", "b"], "x")).toBe("a");
	});
});

describe("moveSelection", () => {
	it("wraps around in both directions", () => {
		expect(moveSelection(["a", "b", "c"], "c", 1)).toBe("a");
		expect(moveSelection(["a", "b", "c"], "a", -1)).toBe("c");
	});

	it("starts from the matching end when nothing is selected", () => {
		expect(moveSelection(["a", "b"], null, 1)).toBe("a");
		expect(moveSelection(["a", "b"], null, -1)).toBe("b");
	});

	it("returns null for an empty list", () => {
		expect(moveSelection([], "a", 1)).toBeNull();
	});
});
