// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type * as Jotai from "jotai";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionViewerPage } from "./SessionViewerPage";

const captured = vi.hoisted(() => ({
	setHeader: vi.fn(),
	feed: vi.fn(),
}));

vi.mock("jotai", async (importOriginal) => ({
	...(await importOriginal<typeof Jotai>()),
	useSetAtom: () => captured.setHeader,
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@vetta-org/theme-sdk/appearance", () => ({ useThemeSurface: () => undefined }));
vi.mock("@domains/activity-panel/components/ActivityPanel", () => ({ ActivityPanel: () => <aside /> }));
vi.mock("../hooks/useSessionViewerPageModel", () => ({
	useSessionViewerPageModel: () => ({
		path: "/tmp/grok/sessions/demo/a/summary.json",
		error: null,
		messages: [{ id: "message-1" }],
		exporting: false,
		exportTitle: "Fix the login bug",
		isKnowledge: false,
		isIm: false,
		imCwd: "",
		kbCwd: "",
		panelOpen: false,
		emptyPathLabel: "empty",
		errorPrefix: "error",
		sourceBannerLabel: "sessionViewer.sourceBanner.grok",
		onStartExport: vi.fn(),
		onTogglePanel: vi.fn(),
		onExportFinished: vi.fn(),
	}),
}));
vi.mock("./ChatExportHost", () => ({ ChatExportHost: () => null }));
vi.mock("./MessageList", () => ({
	MessageList: (props: unknown) => {
		captured.feed(props);
		return <section />;
	},
}));

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("SessionViewerPage external source banner", () => {
	it("shows a page-level Grok source banner instead of opening an interactive chat", () => {
		render(<SessionViewerPage />);
		expect(screen.getByRole("status").textContent).toContain("sessionViewer.sourceBanner.grok");
		const header = captured.setHeader.mock.calls.find(([value]) => value !== null)?.[0];
		expect(header).toBeTruthy();
		render(header);
		expect(screen.getByText("sessionViewer.badge.readOnly")).toBeTruthy();
		expect(captured.feed).toHaveBeenCalledWith(
			expect.objectContaining({
				sessionId: "/tmp/grok/sessions/demo/a/summary.json",
				isStreaming: false,
			}),
		);
	});
});
