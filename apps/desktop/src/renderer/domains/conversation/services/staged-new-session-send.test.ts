// @vitest-environment jsdom

import { createConversationAgentMessage } from "@shared/conversation";
import { type InputSegment, segmentsToText } from "@shared/lib/input-tokens";
import { getDefaultStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/lib/perf-send", () => ({ perfSendMark: vi.fn() }));

const atoms = await import("@shared/store/atoms");
const {
	cancelStagedPendingSessionSend,
	restoreStagedNewSessionSend,
	restoreStagedPendingSessionSend,
	stageNewSessionSend,
	stagePendingSessionSend,
	stagedSendRecoveriesAtom,
} = await import("./staged-new-session-send");

const capture = {
	version: 1 as const,
	id: "capture-b",
	imagePath: "C:/cache/capture-b.png",
	url: "https://example.test/",
	title: "Example",
	mode: "region" as const,
	width: 600,
	height: 400,
	viewport: { width: 600, height: 400 },
	rect: { x: 10, y: 20, width: 100, height: 80 },
	note: "newer",
};

describe("staged new-session send", () => {
	beforeEach(() => {
		const store = getDefaultStore();
		store.set(atoms.activeInputDraftKeyAtom, atoms.newSessionInputDraftKey("C:/workspace"));
		store.set(atoms.inputValueAtom, "  inspect this  ");
		store.set(atoms.inputSegmentsAtom, [{ kind: "text", text: "  inspect this  " }]);
		store.set(atoms.attachedImagesAtom, []);
		store.set(atoms.mentionedFilesAtom, [{ path: "C:/workspace/readme.md", name: "readme.md", isDirectory: false }]);
		store.set(atoms.appshotAttachmentAtom, null);
		store.set(atoms.selectedModelAtom, "openai/test-model");
		store.set(atoms.chatMessagesAtom, []);
		store.set(atoms.sessionInputDraftMapAtom, {});
		store.set(stagedSendRecoveriesAtom, new Map());
	});

	it("renders the first user bubble and clears the composer before a runtime exists", () => {
		const staged = stageNewSessionSend(undefined, "interaction-1");

		expect(staged).not.toBeNull();
		expect(staged?.rawText).toBe("inspect this");
		expect(staged?.optimisticMessage).toMatchObject({
			role: "user",
			text: "inspect this",
			model: { provider: "openai", id: "test-model" },
			attachments: [{ kind: "file", path: "C:/workspace/readme.md" }],
		});
		expect(getDefaultStore().get(atoms.chatMessagesAtom)).toEqual([staged?.optimisticMessage]);
		expect(getDefaultStore().get(atoms.inputValueAtom)).toBe("");
		expect(getDefaultStore().get(atoms.inputSegmentsAtom)).toEqual([]);
	});

	it("发送与乐观气泡保留复制粘贴后的结构化 token 类型", () => {
		const store = getDefaultStore();
		const segments: InputSegment[] = [
			{ kind: "text", text: "检查 " },
			{ kind: "file", path: "C:/workspace/screenshot.png" },
			{ kind: "text", text: "然后调整间距" },
		];
		store.set(atoms.inputValueAtom, segmentsToText(segments));
		store.set(atoms.inputSegmentsAtom, segments);
		store.set(atoms.mentionedFilesAtom, [
			{ path: "C:/workspace/screenshot.png", name: "screenshot.png", isDirectory: false },
		]);

		const staged = stageNewSessionSend(undefined, "interaction-1");

		expect(staged?.inputSegments).toEqual(segments);
		expect(staged?.optimisticMessage).toMatchObject({
			text: "检查 @C:/workspace/screenshot.png 然后调整间距",
			inputSegments: segments,
			attachments: [{ kind: "file", path: "C:/workspace/screenshot.png" }],
		});
	});

	it("restores the captured draft after session creation fails", () => {
		const staged = stageNewSessionSend(undefined, "interaction-1");
		expect(staged).not.toBeNull();
		if (!staged) return;

		restoreStagedNewSessionSend(staged);

		expect(getDefaultStore().get(atoms.chatMessagesAtom)).toEqual([]);
		expect(getDefaultStore().get(atoms.inputValueAtom)).toBe("inspect this");
		expect(getDefaultStore().get(atoms.inputSegmentsAtom)).toEqual([{ kind: "text", text: "inspect this" }]);
		expect(getDefaultStore().get(atoms.mentionedFilesAtom)).toEqual(staged.mentionedFiles);
	});

	it("保留新会话发送期间较新的编辑，并单独保存失败快照", () => {
		const store = getDefaultStore();
		const staged = stageNewSessionSend(undefined, "interaction-1");
		expect(staged).not.toBeNull();
		if (!staged) return;
		store.set(atoms.inputValueAtom, "newer edits");
		store.set(atoms.inputSegmentsAtom, [{ kind: "text", text: "newer edits" }]);

		restoreStagedNewSessionSend(staged);

		expect(store.get(atoms.inputValueAtom)).toBe("newer edits");
		expect(store.get(stagedSendRecoveriesAtom).get(staged.optimisticMessage.id)).toBe(staged);
	});

	it("appends an accepted pending-session send without replacing visible history", () => {
		const store = getDefaultStore();
		const history = createConversationAgentMessage({ id: "assistant-1", text: "ready", blocks: [] });
		store.set(atoms.chatMessagesAtom, [history]);

		const staged = stagePendingSessionSend(undefined, "interaction-1");

		expect(store.get(atoms.chatMessagesAtom)).toEqual([history, staged?.optimisticMessage]);
		expect(store.get(atoms.inputValueAtom)).toBe("");
	});

	it("does not overwrite newer composer input when a deferred send is cancelled", () => {
		const store = getDefaultStore();
		const staged = stagePendingSessionSend(undefined, "interaction-1");
		expect(staged).not.toBeNull();
		if (!staged) return;
		store.set(atoms.inputValueAtom, "newer draft");

		restoreStagedPendingSessionSend(staged);

		expect(store.get(atoms.chatMessagesAtom)).toEqual([]);
		expect(store.get(atoms.inputValueAtom)).toBe("newer draft");
		expect(store.get(stagedSendRecoveriesAtom).get(staged.optimisticMessage.id)).toBe(staged);
	});

	it("switching away preserves a newer saved capture draft and retains the failed send separately", () => {
		const store = getDefaultStore();
		const staged = stagePendingSessionSend(undefined, "interaction-1");
		expect(staged).not.toBeNull();
		if (!staged) return;
		const newerCapture = capture;
		const targetDraftKey = staged.draftKey as string;
		store.set(atoms.activeInputDraftKeyAtom, "another-session");
		atoms.persistSessionInputDraft(targetDraftKey, {
			text: "newer draft",
			segments: [{ kind: "text", text: "newer draft" }],
			appshot: null,
			captures: [newerCapture],
		});

		restoreStagedPendingSessionSend(staged);

		expect(atoms.loadSessionInputDraft(targetDraftKey)).toMatchObject({
			text: "newer draft",
			captures: [newerCapture],
		});
		expect(store.get(stagedSendRecoveriesAtom).get(staged.optimisticMessage.id)).toBe(staged);
	});

	it("lets message editing cancel a send before Runtime dispatch", () => {
		const staged = stagePendingSessionSend(undefined, "interaction-1");
		expect(staged).not.toBeNull();
		if (!staged) return;

		expect(cancelStagedPendingSessionSend(staged.optimisticMessage.id)).toBe(staged);
		expect(cancelStagedPendingSessionSend(staged.optimisticMessage.id)).toBeNull();
	});

	it("restores the exact accepted input when edit explicitly replaces a newer draft", () => {
		const store = getDefaultStore();
		const staged = stagePendingSessionSend(undefined, "interaction-1");
		expect(staged).not.toBeNull();
		if (!staged) return;
		store.set(atoms.inputValueAtom, "newer draft");

		restoreStagedPendingSessionSend(staged, { overwriteComposer: true });

		expect(store.get(atoms.inputValueAtom)).toBe("inspect this");
		expect(store.get(atoms.mentionedFilesAtom)).toEqual(staged.mentionedFiles);
	});
});
