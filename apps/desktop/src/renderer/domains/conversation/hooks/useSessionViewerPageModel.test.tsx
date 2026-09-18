// @vitest-environment jsdom

import { renderHook, waitFor } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import {
	EXTERNAL_ORIGIN_MARKER_TYPE,
	EXTERNAL_SESSION_HISTORY_UNAVAILABLE,
	GROK_TOOL_ID,
	OMITTED_REASONING_MARKER_TYPE,
} from "../external-history-display";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({
	path: "/tmp/grok/sessions/demo/a/summary.json",
	openViewer: vi.fn(),
	subscribeViewer: vi.fn(async () => () => {}),
}));

vi.mock("@tanstack/react-router", () => ({
	useParams: () => ({ path: encodeURIComponent(captured.path) }),
}));
vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

const { useSessionViewerPageModel } = await import("./useSessionViewerPageModel.js");

afterEach(() => {
	vi.clearAllMocks();
	captured.path = "/tmp/grok/sessions/demo/a/summary.json";
	captured.openViewer.mockReset();
	captured.subscribeViewer.mockReset().mockResolvedValue(() => {});
});

describe("useSessionViewerPageModel external Grok viewer", () => {
	it("loads a Grok transcript into the read-only viewer with a source banner", async () => {
		captured.openViewer.mockResolvedValue({
			history: [
				{
					type: "custom_marker",
					customType: EXTERNAL_ORIGIN_MARKER_TYPE,
					details: { tool: GROK_TOOL_ID },
					timestamp: "",
				},
				{
					type: "message",
					message: { role: "user", content: "Fix the login redirect.", timestamp: 1 },
				},
				{
					type: "custom_marker",
					customType: OMITTED_REASONING_MARKER_TYPE,
					details: { count: 2 },
					timestamp: "",
				},
				{
					type: "message",
					message: {
						role: "assistant",
						content: [{ type: "text", text: "Looking at the auth router." }],
						timestamp: 2,
					},
				},
			],
		});
		Object.defineProperty(window, "vetta", {
			configurable: true,
			value: {
				session: {
					openViewer: captured.openViewer,
					subscribeViewer: captured.subscribeViewer,
				},
			},
		});

		const store = createStore();
		const { result } = renderHook(() => useSessionViewerPageModel(), {
			wrapper: ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>,
		});

		await waitFor(() => expect(result.current.sourceBannerLabel).toBe("sessionViewer.sourceBanner.grok"));
		expect(result.current.canContinueFrom).toBe(true);
		expect(captured.openViewer).toHaveBeenCalledWith(captured.path);
		expect(result.current.messages.map((message) => message.kind)).toEqual(["user", "event", "agent"]);
		expect(result.current.messages[1]).toMatchObject({
			kind: "event",
			event: { kind: "omitted_reasoning", count: 2 },
		});
		expect(result.current.error).toBeNull();
	});

	it("surfaces a damaged Grok header as a localized unavailable error", async () => {
		captured.openViewer.mockRejectedValue(new Error(EXTERNAL_SESSION_HISTORY_UNAVAILABLE.corrupted_header));
		Object.defineProperty(window, "vetta", {
			configurable: true,
			value: {
				session: {
					openViewer: captured.openViewer,
					subscribeViewer: captured.subscribeViewer,
				},
			},
		});

		const store = createStore();
		const { result } = renderHook(() => useSessionViewerPageModel(), {
			wrapper: ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>,
		});

		await waitFor(() => expect(result.current.error).toBe("sessionViewer.error.corruptedHeader"));
		expect(result.current.sourceBannerLabel).toBeNull();
		expect(result.current.canContinueFrom).toBe(false);
		expect(result.current.messages).toEqual([]);
	});
});
