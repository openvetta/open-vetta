// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionViewerContinueFromProgress } from "./SessionViewerContinueFromProgress";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}));
vi.mock("motion/react", () => ({
	useReducedMotion: () => true,
	motion: {
		div: ({ children, className }: { children: ReactNode; className?: string }) => (
			<div className={className}>{children}</div>
		),
	},
}));

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-09-20T12:00:00Z"));
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

describe("SessionViewerContinueFromProgress", () => {
	it("is hidden until continue-from is actually generating", () => {
		render(<SessionViewerContinueFromProgress active={false} />);
		expect(screen.queryByRole("status")).toBeNull();
	});

	it("shows reading then briefing so the wait is visible", () => {
		render(<SessionViewerContinueFromProgress active />);
		expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true");
		expect(screen.getByText("sessionViewer.continueFrom.progress.title")).toBeTruthy();
		expect(screen.getByText("sessionViewer.continueFrom.progress.reading").closest("li")?.getAttribute("aria-current")).toBe(
			"step",
		);

		act(() => {
			vi.advanceTimersByTime(800);
		});
		expect(
			screen.getByText("sessionViewer.continueFrom.progress.briefing").closest("li")?.getAttribute("aria-current"),
		).toBe("step");
	});
});
