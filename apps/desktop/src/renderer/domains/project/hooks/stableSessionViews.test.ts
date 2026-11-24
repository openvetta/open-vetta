import { describe, expect, it } from "vitest";
import { reuseUnchangedSessionViews } from "./stableSessionViews";

interface Row {
	key: string;
	path: string;
	label: string;
	active: boolean;
	renaming: boolean;
	running: boolean;
	waiting: boolean;
	scheduled: boolean;
	pinned: boolean;
	session: unknown;
}

const SESSION = {};

function row(overrides: Partial<Row> = {}): Row {
	return {
		key: `conversation:${overrides.path ?? "/p/a.jsonl"}`,
		path: "/p/a.jsonl",
		label: "a",
		active: false,
		renaming: false,
		running: true,
		waiting: false,
		scheduled: false,
		pinned: false,
		session: SESSION,
		...overrides,
	};
}

describe("reuseUnchangedSessionViews", () => {
	it("reuses the previous view object when nothing changed", () => {
		const cache = new Map<string, Row>();
		const first = reuseUnchangedSessionViews(cache, [row()]);
		const second = reuseUnchangedSessionViews(cache, [row()]);

		expect(second[0]).toBe(first[0]);
	});

	// 回归：agent 提问时 running 仍为 true、只有 waiting 翻转；漏比该字段会让列表行
	// 一直停在旋转图标，直到切换会话把缓存冲掉。
	it("returns a new view when only waiting flips", () => {
		const cache = new Map<string, Row>();
		const running = reuseUnchangedSessionViews(cache, [row({ running: true, waiting: false })]);
		const asked = reuseUnchangedSessionViews(cache, [row({ running: true, waiting: true })]);

		expect(asked[0]).not.toBe(running[0]);
		expect(asked[0].waiting).toBe(true);
	});

	it("returns a new view when waiting clears after the answer", () => {
		const cache = new Map<string, Row>();
		const asked = reuseUnchangedSessionViews(cache, [row({ running: true, waiting: true })]);
		const answered = reuseUnchangedSessionViews(cache, [row({ running: true, waiting: false })]);

		expect(answered[0]).not.toBe(asked[0]);
		expect(answered[0].waiting).toBe(false);
	});
});
