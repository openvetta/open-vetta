import { describe, expect, it } from "vitest";
import { DockAttentionTracker, type DockBadgeHost, formatDockBadgeLabel } from "./dock-attention-badge.js";

/** 模拟 Dock：只保留用户能看到的东西——角标文字与跳动次数。 */
function createTracker() {
	const dock = { label: "", bounces: 0 };
	const host: DockBadgeHost = {
		setBadge: (label) => {
			dock.label = label;
		},
		bounce: () => {
			dock.bounces += 1;
		},
	};
	return { dock, tracker: new DockAttentionTracker(host) };
}

describe("formatDockBadgeLabel", () => {
	it("hides the badge at zero and caps large counts at 99+", () => {
		expect(formatDockBadgeLabel(0)).toBe("");
		expect(formatDockBadgeLabel(1)).toBe("1");
		expect(formatDockBadgeLabel(99)).toBe("99");
		expect(formatDockBadgeLabel(100)).toBe("99+");
	});
});

describe("DockAttentionTracker", () => {
	it("counts each session at most once however many events it raises", () => {
		const { dock, tracker } = createTracker();
		tracker.record("a.jsonl", "unread-result", false);
		tracker.record("a.jsonl", "unread-result", false);
		tracker.record("b.jsonl", "unread-result", false);

		expect(tracker.count).toBe(2);
		expect(dock).toEqual({ label: "2", bounces: 0 });
	});

	it("shows 99+ once more than 99 sessions need attention", () => {
		const { dock, tracker } = createTracker();
		for (let index = 0; index < 100; index++) tracker.record(`${index}.jsonl`, "unread-result", false);
		expect(dock.label).toBe("99+");
	});

	it("bounces once for every pending action, even on an already counted session", () => {
		const { dock, tracker } = createTracker();
		tracker.record("a.jsonl", "unread-result", false);
		tracker.record("a.jsonl", "action-required", false);

		expect(dock).toEqual({ label: "1", bounces: 1 });
	});

	it("ignores events the user is already looking at", () => {
		const { dock, tracker } = createTracker();
		tracker.record("a.jsonl", "action-required", true);

		expect(tracker.count).toBe(0);
		expect(dock).toEqual({ label: "", bounces: 0 });
	});

	it("clears a session when it is opened and leaves unknown sessions alone", () => {
		const { dock, tracker } = createTracker();
		tracker.record("a.jsonl", "action-required", false);
		tracker.record("b.jsonl", "unread-result", false);

		tracker.markSeen(null);
		tracker.markSeen("other.jsonl");
		expect(dock.label).toBe("2");

		tracker.markSeen("a.jsonl");
		expect(dock.label).toBe("1");
		tracker.markSeen("b.jsonl");
		expect(dock.label).toBe("");
	});

	it("drops deleted sessions so the badge cannot get stuck", () => {
		const { dock, tracker } = createTracker();
		tracker.record("project/a.jsonl", "unread-result", false);
		tracker.record("project/b.jsonl", "unread-result", false);
		tracker.record("other/c.jsonl", "unread-result", false);

		tracker.forget((path) => path.startsWith("project/"));
		expect(tracker.count).toBe(1);
		expect(dock.label).toBe("1");
	});

	it("publishes the attention set only when its members change", () => {
		const published: (readonly string[])[] = [];
		const tracker = new DockAttentionTracker({ setBadge: () => {}, bounce: () => {} }, (paths) => {
			published.push(paths);
		});
		tracker.record("a.jsonl", "unread-result", false);
		tracker.record("a.jsonl", "unread-result", false);
		tracker.record("b.jsonl", "unread-result", true);
		tracker.markSeen("a.jsonl");
		tracker.markSeen("a.jsonl");

		expect(published).toEqual([["a.jsonl"], []]);
		expect(tracker.sessionPaths).toEqual([]);
	});
});
