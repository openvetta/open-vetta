// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { getDefaultStore } from "jotai";
import { afterEach, expect, it, vi } from "vitest";
import {
	activeInputDraftKeyAtom,
	browserCapturesAtom,
	clearCurrentSessionInputDraft,
	inputValueAtom,
} from "@shared/store/atoms";
import { restoreStagedNewSessionSend, stageNewSessionSend } from "../../services/staged-new-session-send";
import { StagedSendRecovery } from "./StagedSendRecovery";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(cleanup);

it("retrieves annotations beside a newer message and later restores the entire unsent draft in its claimed session", () => {
	const store = getDefaultStore();
	store.set(activeInputDraftKeyAtom, "new:workspace");
	store.set(inputValueAtom, "Original text");
	store.set(browserCapturesAtom, [
		{
			version: 1,
			id: "shot",
			imagePath: "capture.png",
			title: "Home",
			url: "https://example.test",
			mode: "region",
			width: 60,
			height: 40,
			viewport: { width: 60, height: 40 },
			rect: { x: 0, y: 0, width: 60, height: 40 },
			note: "Align the title",
		},
	]);
	const staged = stageNewSessionSend(undefined, "interaction");
	if (!staged) throw new Error("Expected a staged send");
	store.set(activeInputDraftKeyAtom, "claimed-session");
	store.set(inputValueAtom, "New message");
	restoreStagedNewSessionSend(staged, "claimed-session");
	store.set(activeInputDraftKeyAtom, "other-session");
	render(<StagedSendRecovery />);
	expect(screen.queryByText(/Original text/)).toBeNull();
	act(() => store.set(activeInputDraftKeyAtom, "claimed-session"));
	fireEvent.click(screen.getByText(/browserCapture.unsentDraft/));
	expect(screen.getByText(/Align the title/)).toBeTruthy();
	expect((screen.getByRole("button", { name: "browserCapture.restoreDraft" }) as HTMLButtonElement).disabled).toBe(
		true,
	);
	fireEvent.click(screen.getByRole("button", { name: "browserCapture.restoreScreenshots" }));
	expect(store.get(inputValueAtom)).toBe("New message");
	expect(store.get(browserCapturesAtom)).toEqual(staged.browserCaptures);
	act(() => clearCurrentSessionInputDraft());
	fireEvent.click(screen.getByRole("button", { name: "browserCapture.restoreDraft" }));
	expect(store.get(inputValueAtom)).toBe("Original text");
	expect(store.get(browserCapturesAtom)).toEqual(staged.browserCaptures);
	expect(screen.queryByText(/browserCapture.unsentDraft/)).toBeNull();
});
