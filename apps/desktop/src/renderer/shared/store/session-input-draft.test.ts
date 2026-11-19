// @vitest-environment jsdom
import { getDefaultStore } from "jotai";
import { describe, expect, it } from "vitest";
import { appshotAttachmentAtom, inputValueAtom } from "./chat-atoms";
import { clearCurrentSessionInputDraft, switchSessionInputDraftScope } from "./session-input-draft";
import {
	appendInputHistoryEntry,
	INPUT_HISTORY_MAX,
	isSessionInputDraftEmpty,
	newSessionInputDraftKey,
} from "./session-input-draft-logic";

describe("appendInputHistoryEntry", () => {
	it("skips empty / whitespace", () => {
		expect(appendInputHistoryEntry([], "")).toEqual([]);
		expect(appendInputHistoryEntry([], "  \n")).toEqual([]);
		expect(appendInputHistoryEntry(["a"], "   ")).toEqual(["a"]);
	});

	it("appends trimmed text", () => {
		expect(appendInputHistoryEntry([], "  hello  ")).toEqual(["hello"]);
		expect(appendInputHistoryEntry(["a"], "b")).toEqual(["a", "b"]);
	});

	it("dedupes consecutive duplicates", () => {
		expect(appendInputHistoryEntry(["a", "b"], "b")).toEqual(["a", "b"]);
		expect(appendInputHistoryEntry(["a", "b"], "B")).toEqual(["a", "b", "B"]);
	});

	it("caps length from the front", () => {
		const filled = Array.from({ length: INPUT_HISTORY_MAX }, (_, i) => `m${i}`);
		const next = appendInputHistoryEntry(filled, "newest");
		expect(next).toHaveLength(INPUT_HISTORY_MAX);
		expect(next[0]).toBe("m1");
		expect(next[next.length - 1]).toBe("newest");
	});
});

describe("isSessionInputDraftEmpty", () => {
	it("treats whitespace-only text without skill/appshot as empty", () => {
		expect(isSessionInputDraftEmpty({ text: "  ", appshot: null })).toBe(true);
		expect(isSessionInputDraftEmpty({ text: "@scene:x", appshot: null })).toBe(false);
	});
});

describe("newSessionInputDraftKey", () => {
	it("prefixes cwd", () => {
		expect(newSessionInputDraftKey("C:\\proj")).toBe("new:C:\\proj");
	});
});

it("restores text and the pending appshot independently across workspaces with the same cwd", () => {
	const store = getDefaultStore();
	const cwd = "/shared/chat";
	const main = newSessionInputDraftKey(cwd);
	const work = newSessionInputDraftKey(cwd, "work");
	const attachment = {
		id: "capture",
		appName: "Vetta",
		windowTitle: "Work",
		documentPath: null,
		imagePath: "/tmp/capture.png",
		iconPath: null,
		textPath: null,
		capturedAt: 1,
	};
	try {
		switchSessionInputDraftScope(main);
		store.set(inputValueAtom, "Main draft");
		switchSessionInputDraftScope(work);
		expect(store.get(inputValueAtom)).toBe("");
		store.set(inputValueAtom, "Work draft");
		store.set(appshotAttachmentAtom, attachment);
		switchSessionInputDraftScope(main);
		expect(store.get(inputValueAtom)).toBe("Main draft");
		expect(store.get(appshotAttachmentAtom)).toBeNull();
		switchSessionInputDraftScope(work);
		expect(store.get(inputValueAtom)).toBe("Work draft");
		expect(store.get(appshotAttachmentAtom)).toEqual(attachment);
	} finally {
		clearCurrentSessionInputDraft();
		switchSessionInputDraftScope(main);
		clearCurrentSessionInputDraft();
		switchSessionInputDraftScope(null);
	}
});
