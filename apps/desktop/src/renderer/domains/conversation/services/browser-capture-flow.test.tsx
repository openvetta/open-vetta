// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getDefaultStore } from "jotai";
import { afterEach, expect, it, vi } from "vitest";
import type { HistoryEntry } from "@vetta/runtime-core";
import {
	browserCaptureSchema,
	buildBrowserCaptureContext,
	BROWSER_CAPTURE_CONTEXT,
} from "../../../../shared/browser-capture";
import {
	activeSessionAtom,
	browserCapturesAtom,
	clearCurrentSessionInputDraft,
	inputValueAtom,
	mentionedFilesAtom,
	pendingMessageEditAtom,
	switchSessionInputDraftScope,
} from "@shared/store/atoms";
import { fullHistoryToChat } from "./chat-service";
import { stageNewSessionSend, restoreStagedNewSessionSend } from "./staged-new-session-send";
import { useUserMessageEditAction } from "../hooks/useUserMessageActions";
import type { ConversationUserMessageViewModel } from "@shared/conversation";

const translation = vi.hoisted(() => ({ t: (key: string) => key }));
vi.mock("react-i18next", () => ({ useTranslation: () => translation }));
const store = getDefaultStore();
const capture = browserCaptureSchema.parse({
	version: 1,
	id: "screen-a",
	imagePath: "C:/screen-a.png",
	url: "http://localhost:3000",
	title: "Demo",
	mode: "region",
	width: 1200,
	height: 800,
	viewport: { width: 600, height: 400 },
	rect: { x: 10, y: 20, width: 100, height: 40 },
	note: "Move this region",
});

afterEach(() => {
	cleanup();
	clearCurrentSessionInputDraft();
	switchSessionInputDraftScope(null);
	store.set(activeSessionAtom, null);
});

function Edit({ message }: { message: ConversationUserMessageViewModel }) {
	const action = useUserMessageEditAction({ message, isLastUserMessage: true, enabled: true });
	return <button onClick={action.onEdit}>Edit message</button>;
}

it("keeps screenshots in their draft, snapshots the first send, restores history and reopens annotations for editing", async () => {
	switchSessionInputDraftScope("conversation-a");
	store.set(inputValueAtom, "Inspect the page");
	store.set(browserCapturesAtom, [capture]);
	switchSessionInputDraftScope("conversation-b");
	expect(store.get(browserCapturesAtom)).toEqual([]);
	switchSessionInputDraftScope("conversation-a");
	expect(store.get(browserCapturesAtom)).toEqual([capture]);
	store.set(mentionedFilesAtom, []);
	const staged = stageNewSessionSend(undefined, "capture-flow");
	expect(staged?.optimisticMessage.browserCaptures).toEqual([capture]);
	expect(staged?.optimisticMessage.attachments).toEqual([{ kind: "image", path: capture.imagePath }]);
	expect(store.get(browserCapturesAtom)).toEqual([]);
	if (!staged) throw new Error("First screenshot send was rejected");
	restoreStagedNewSessionSend(staged);
	expect(store.get(browserCapturesAtom)).toEqual([capture]);
	const record = buildBrowserCaptureContext([capture], "user-a");
	const history: HistoryEntry[] = [
		{
			type: "custom_marker",
			customType: BROWSER_CAPTURE_CONTEXT,
			details: record.metadata,
			timestamp: "2026-11-27T00:00:00Z",
		},
		{
			type: "prompt_attachments_marker",
			attachments: [{ kind: "image", path: capture.imagePath }],
			timestamp: "2026-11-27T00:00:00Z",
		},
		{
			type: "message",
			entryId: "entry-a",
			messageId: "user-a",
			message: { role: "user", content: [{ type: "text", text: "Inspect the page" }], timestamp: 1 },
		},
	];
	const message = fullHistoryToChat(history).find((item) => item.kind === "user");
	if (!message || message.kind !== "user") throw new Error("User message missing");
	expect(message.browserCaptures).toEqual([capture]);
	clearCurrentSessionInputDraft();
	store.set(activeSessionAtom, { cwd: "C:/work", sessionPath: "conversation-a", runtimeId: "runtime-a" });
	render(<Edit message={message} />);
	await act(async () => fireEvent.click(screen.getByText("Edit message")));
	await waitFor(() => expect(store.get(browserCapturesAtom)).toEqual([capture]));
	expect(store.get(inputValueAtom)).toBe("Inspect the page");
	expect(store.get(pendingMessageEditAtom)).toEqual({ entryId: "entry-a", mode: "replace" });
});
