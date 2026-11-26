import type { SessionInfo } from "@shared/store/atoms";
import { describe, expect, it } from "vitest";
import { buildSidebarSessionOrdering, orderSidebarSessions } from "./sidebar-session-order";

function session(path: string, modifiedAt: number, createdAt?: number): SessionInfo {
	return { id: path, path, cwd: "C:/workspace", firstMessage: path, modifiedAt, createdAt };
}

describe("sidebar session ordering", () => {
	it("places recently pinned sessions first and keeps unpinned sessions newest-first", () => {
		const sessions = [session("old", 1), session("new", 3), session("middle", 2)];
		const pins = new Map([
			["old", 20],
			["middle", 10],
		]);
		expect(orderSidebarSessions(sessions, pins).map(({ path }) => path)).toEqual(["old", "middle", "new"]);
	});

	it("never hides pinned sessions behind the collapsed limit", () => {
		const sessions = Array.from({ length: 8 }, (_, index) => session(String(index), 100 - index));
		const pins = new Map(sessions.slice(0, 6).map(({ path }, index) => [path, index + 1]));
		const ordering = buildSidebarSessionOrdering(sessions, pins, 5, false);

		expect(ordering.visible).toHaveLength(6);
		expect(ordering.visible.every(({ path }) => pins.has(path))).toBe(true);
		expect(ordering.hiddenCount).toBe(2);
		expect(ordering.hasMore).toBe(true);
	});

	it("returns every session when expanded", () => {
		const sessions = [session("one", 1), session("two", 2)];
		const ordering = buildSidebarSessionOrdering(sessions, new Map(), 1, true);
		expect(ordering.visible.map(({ path }) => path)).toEqual(["two", "one"]);
		expect(ordering.hiddenCount).toBe(0);
	});

	it("puts running or waiting sessions ahead of idle ones when sorting by latest reply", () => {
		const sessions = [session("recent", 30), session("running", 10), session("waiting", 20), session("pinned", 1)];
		const ordered = orderSidebarSessions(sessions, new Map([["pinned", 1]]), {
			sort: "updated",
			activePaths: new Set(["running", "waiting"]),
		});

		expect(ordered.map(({ path }) => path)).toEqual(["pinned", "waiting", "running", "recent"]);
	});

	it("orders by creation time without lifting active sessions, falling back to activity time", () => {
		const sessions = [
			session("created-first", 300, 10),
			session("created-last", 100, 50),
			session("no-header", 40),
			session("running", 500, 20),
		];
		const ordered = orderSidebarSessions(sessions, new Map(), {
			sort: "created",
			activePaths: new Set(["running"]),
		});

		expect(ordered.map(({ path }) => path)).toEqual(["created-last", "no-header", "running", "created-first"]);
	});
});
