// @vitest-environment jsdom

import { confirmDialogAtom, openSessionFnRef } from "@shared/store/atoms";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSessionViewerContinueFrom } from "./useSessionViewerContinueFrom.js";

const captured = vi.hoisted(() => ({
	continueFromExternal: vi.fn(),
	selectFolder: vi.fn(),
	openSession: vi.fn(),
}));

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, options?: { path?: string }) => (options?.path ? `${key}:${options.path}` : key),
	}),
}));

const SESSION_PATH = "/tmp/grok/sessions/demo/a/summary.json";

afterEach(() => {
	vi.clearAllMocks();
	captured.continueFromExternal.mockReset();
	captured.selectFolder.mockReset();
	captured.openSession.mockReset();
	openSessionFnRef.current = null;
});

describe("useSessionViewerContinueFrom", () => {
	it("asks for a quota confirmation before calling the model and creating a session", async () => {
		const { store, result } = renderContinueFrom();
		captured.continueFromExternal.mockResolvedValue({
			kind: "created",
			sessionId: "continued-1",
			sessionPath: "/tmp/vetta/continued.conversation.jsonl",
			cwd: "/workspace",
			usedCache: false,
			importedFrom: { tool: "grok", path: SESSION_PATH, importedAt: 1 },
		});
		openSessionFnRef.current = captured.openSession;

		act(() => result.current.onContinue());

		const confirmation = store.get(confirmDialogAtom);
		expect(captured.continueFromExternal).not.toHaveBeenCalled();
		expect(confirmation).toMatchObject({
			title: "sessionViewer.continueFrom.quotaTitle",
			message: "sessionViewer.continueFrom.quotaMessage",
			confirmLabel: "sessionViewer.continueFrom.quotaConfirm",
		});

		act(() => confirmation?.onConfirm(false));
		await waitFor(() => expect(captured.continueFromExternal).toHaveBeenCalledWith({ sessionPath: SESSION_PATH }));
		await waitFor(() =>
			expect(captured.openSession).toHaveBeenCalledWith("/workspace", "/tmp/vetta/continued.conversation.jsonl"),
		);
	});

	it("does not start continue-from when the quota warning is cancelled", () => {
		const { store, result } = renderContinueFrom();

		act(() => result.current.onContinue());
		store.get(confirmDialogAtom)?.onCancel?.();

		expect(captured.continueFromExternal).not.toHaveBeenCalled();
		expect(captured.openSession).not.toHaveBeenCalled();
	});

	it("asks the user to pick a folder when the trusted cwd is missing, then retries", async () => {
		const { store, result } = renderContinueFrom();
		captured.continueFromExternal
			.mockResolvedValueOnce({ kind: "cwd_missing", suggestedCwd: "/missing/trusted" })
			.mockResolvedValueOnce({
				kind: "created",
				sessionId: "continued-2",
				sessionPath: "/tmp/vetta/continued.conversation.jsonl",
				cwd: "/reselected",
				usedCache: false,
				importedFrom: { tool: "grok", path: SESSION_PATH, importedAt: 1 },
			});
		captured.selectFolder.mockResolvedValue("/reselected");
		openSessionFnRef.current = captured.openSession;

		act(() => result.current.onContinue());
		act(() => store.get(confirmDialogAtom)?.onConfirm(false));
		await waitFor(() => expect(store.get(confirmDialogAtom)?.title).toBe("sessionViewer.continueFrom.cwdMissingTitle"));
		expect(captured.continueFromExternal).toHaveBeenCalledTimes(1);

		act(() => store.get(confirmDialogAtom)?.onConfirm(false));
		await waitFor(() => expect(captured.selectFolder).toHaveBeenCalledOnce());
		await waitFor(() =>
			expect(captured.continueFromExternal).toHaveBeenCalledWith({
				sessionPath: SESSION_PATH,
				cwdOverride: "/reselected",
			}),
		);
		await waitFor(() =>
			expect(captured.openSession).toHaveBeenCalledWith("/reselected", "/tmp/vetta/continued.conversation.jsonl"),
		);
	});

	it("surfaces a missing default model instead of opening a session", async () => {
		const { store, result } = renderContinueFrom();
		captured.continueFromExternal.mockRejectedValue(new Error("EXTERNAL_SESSION_CONTINUE_NO_DEFAULT_MODEL"));

		act(() => result.current.onContinue());
		act(() => store.get(confirmDialogAtom)?.onConfirm(false));

		await waitFor(() => expect(result.current.error).toBe("sessionViewer.continueFrom.error.noDefaultModel"));
		expect(captured.openSession).not.toHaveBeenCalled();
	});
});

function renderContinueFrom(enabled = true) {
	const store = createStore();
	Object.defineProperty(window, "vetta", {
		configurable: true,
		value: {
			session: { continueFromExternal: captured.continueFromExternal },
			dialog: { selectFolder: captured.selectFolder },
		},
	});
	const { result } = renderHook(() => useSessionViewerContinueFrom({ sessionPath: SESSION_PATH, enabled }), {
		wrapper: ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>,
	});
	return { store, result };
}
