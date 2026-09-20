// @vitest-environment jsdom

import { confirmDialogAtom, openSessionFnRef, selectedModelAtom } from "@shared/store/atoms";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSessionViewerContinueFrom } from "./useSessionViewerContinueFrom.js";

const captured = vi.hoisted(() => ({
	continueFromExternal: vi.fn(),
	findExternalImports: vi.fn(),
	selectFolder: vi.fn(),
	openSession: vi.fn(),
}));

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, options?: { path?: string; name?: string }) =>
			options?.name ? `${key}:${options.name}` : options?.path ? `${key}:${options.path}` : key,
	}),
}));

const SESSION_PATH = "/tmp/grok/sessions/demo/a/summary.json";

afterEach(() => {
	vi.clearAllMocks();
	captured.continueFromExternal.mockReset();
	captured.findExternalImports.mockReset().mockResolvedValue(undefined);
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
		await waitFor(() => expect(store.get(confirmDialogAtom)?.title).toBe("sessionViewer.continueFrom.quotaTitle"));

		const confirmation = store.get(confirmDialogAtom);
		expect(captured.continueFromExternal).not.toHaveBeenCalled();
		expect(confirmation).toMatchObject({
			title: "sessionViewer.continueFrom.quotaTitle",
			message: "sessionViewer.continueFrom.quotaMessage",
			confirmLabel: "sessionViewer.continueFrom.quotaConfirm",
		});

		expect(result.current.continuing).toBe(false);
		act(() => confirmation?.onConfirm(false));
		await waitFor(() =>
			expect(captured.continueFromExternal).toHaveBeenCalledWith({
				sessionPath: SESSION_PATH,
				modelKey: "grok/grok-4.6",
			}),
		);
		await waitFor(() =>
			expect(captured.openSession).toHaveBeenCalledWith("/workspace", "/tmp/vetta/continued.conversation.jsonl"),
		);
	});

	it("keeps continuing true while the briefing is generated", async () => {
		const { store, result } = renderContinueFrom();
		let finish: (value: unknown) => void = () => undefined;
		openSessionFnRef.current = captured.openSession;
		captured.continueFromExternal.mockImplementation(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		);

		act(() => result.current.onContinue());
		await waitFor(() => expect(store.get(confirmDialogAtom)?.title).toBe("sessionViewer.continueFrom.quotaTitle"));
		act(() => store.get(confirmDialogAtom)?.onConfirm(false));
		await waitFor(() => expect(result.current.continuing).toBe(true));
		await waitFor(() => expect(captured.continueFromExternal).toHaveBeenCalled());

		await act(async () => {
			finish({
				kind: "created",
				sessionId: "continued-1",
				sessionPath: "/tmp/vetta/continued.conversation.jsonl",
				cwd: "/workspace",
				usedCache: false,
				importedFrom: { tool: "grok", path: SESSION_PATH, importedAt: 1 },
			});
		});
		await waitFor(() => expect(result.current.continuing).toBe(false));
	});

	it("omits modelKey when the viewer has no selected model", async () => {
		const { store, result } = renderContinueFrom(true, null);
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
		await waitFor(() => expect(store.get(confirmDialogAtom)?.title).toBe("sessionViewer.continueFrom.quotaTitle"));
		act(() => store.get(confirmDialogAtom)?.onConfirm(false));
		await waitFor(() => expect(captured.continueFromExternal).toHaveBeenCalledWith({ sessionPath: SESSION_PATH }));
	});

	it("does not start continue-from when the quota warning is cancelled", async () => {
		const { store, result } = renderContinueFrom();

		act(() => result.current.onContinue());
		await waitFor(() => expect(store.get(confirmDialogAtom)?.title).toBe("sessionViewer.continueFrom.quotaTitle"));
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
		await waitFor(() => expect(store.get(confirmDialogAtom)?.title).toBe("sessionViewer.continueFrom.quotaTitle"));
		act(() => store.get(confirmDialogAtom)?.onConfirm(false));
		await waitFor(() => expect(store.get(confirmDialogAtom)?.title).toBe("sessionViewer.continueFrom.cwdMissingTitle"));
		expect(captured.continueFromExternal).toHaveBeenCalledTimes(1);

		act(() => store.get(confirmDialogAtom)?.onConfirm(false));
		await waitFor(() => expect(captured.selectFolder).toHaveBeenCalledOnce());
		await waitFor(() =>
			expect(captured.continueFromExternal).toHaveBeenCalledWith({
				sessionPath: SESSION_PATH,
				cwdOverride: "/reselected",
				modelKey: "grok/grok-4.6",
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
		await waitFor(() => expect(store.get(confirmDialogAtom)?.title).toBe("sessionViewer.continueFrom.quotaTitle"));
		act(() => store.get(confirmDialogAtom)?.onConfirm(false));

		await waitFor(() => expect(result.current.error).toBe("sessionViewer.continueFrom.error.noDefaultModel"));
		expect(captured.openSession).not.toHaveBeenCalled();
	});

	it("asks whether to open the existing import or create another session", async () => {
		const { store, result } = renderContinueFrom();
		captured.findExternalImports.mockResolvedValue({
			sessionId: "already-1",
			sessionPath: "/tmp/vetta/already.conversation.jsonl",
			cwd: "/workspace",
			importedAt: 1,
			name: "Fix the login bug",
		});
		openSessionFnRef.current = captured.openSession;

		act(() => result.current.onContinue());
		await waitFor(() => expect(store.get(confirmDialogAtom)?.title).toBe("sessionViewer.continueFrom.duplicateTitle"));
		expect(captured.continueFromExternal).not.toHaveBeenCalled();

		const confirmation = store.get(confirmDialogAtom);
		expect(confirmation).toMatchObject({
			message: "sessionViewer.continueFrom.duplicateMessageNamed:Fix the login bug",
			confirmLabel: "sessionViewer.continueFrom.duplicateOpenExisting",
			secondaryLabel: "sessionViewer.continueFrom.duplicateCreateNew",
			cancelLabel: "sessionViewer.continueFrom.duplicateCancel",
		});

		act(() => confirmation?.onConfirm(false));
		await waitFor(() =>
			expect(captured.openSession).toHaveBeenCalledWith("/workspace", "/tmp/vetta/already.conversation.jsonl"),
		);
		expect(captured.continueFromExternal).not.toHaveBeenCalled();
	});

	it("creates another session after the user chooses to continue anyway", async () => {
		const { store, result } = renderContinueFrom();
		captured.findExternalImports.mockResolvedValue({
			sessionId: "already-1",
			sessionPath: "/tmp/vetta/already.conversation.jsonl",
			cwd: "/workspace",
			importedAt: 1,
		});
		captured.continueFromExternal.mockResolvedValue({
			kind: "created",
			sessionId: "continued-2",
			sessionPath: "/tmp/vetta/continued.conversation.jsonl",
			cwd: "/workspace",
			usedCache: true,
			importedFrom: { tool: "grok", path: SESSION_PATH, importedAt: 2 },
		});
		openSessionFnRef.current = captured.openSession;

		act(() => result.current.onContinue());
		await waitFor(() => expect(store.get(confirmDialogAtom)?.onSecondary).toBeTypeOf("function"));
		act(() => store.get(confirmDialogAtom)?.onSecondary?.());
		await waitFor(() => expect(store.get(confirmDialogAtom)?.title).toBe("sessionViewer.continueFrom.quotaTitle"));
		act(() => store.get(confirmDialogAtom)?.onConfirm(false));

		await waitFor(() =>
			expect(captured.continueFromExternal).toHaveBeenCalledWith({
				sessionPath: SESSION_PATH,
				forceCreate: true,
				modelKey: "grok/grok-4.6",
			}),
		);
		await waitFor(() =>
			expect(captured.openSession).toHaveBeenCalledWith("/workspace", "/tmp/vetta/continued.conversation.jsonl"),
		);
	});
});

function renderContinueFrom(enabled = true, modelKey: string | null = "grok/grok-4.6") {
	const store = createStore();
	store.set(selectedModelAtom, modelKey);
	Object.defineProperty(window, "vetta", {
		configurable: true,
		value: {
			session: {
				continueFromExternal: captured.continueFromExternal,
				findExternalImports: captured.findExternalImports,
			},
			dialog: { selectFolder: captured.selectFolder },
		},
	});
	const { result } = renderHook(() => useSessionViewerContinueFrom({ sessionPath: SESSION_PATH, enabled }), {
		wrapper: ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>,
	});
	return { store, result };
}
