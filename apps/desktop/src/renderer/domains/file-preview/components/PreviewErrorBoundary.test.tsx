// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import i18next from "i18next";
import { I18nextProvider } from "react-i18next";
import { afterEach, expect, it, vi } from "vitest";
import en from "../../../../shared/i18n/locales/en/chat.json";
import zh from "../../../../shared/i18n/locales/zh/chat.json";
import { PreviewErrorBoundary } from "./PreviewErrorBoundary";

function BrokenPreview(): never {
	throw new Error("Broken document renderer");
}
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

it("announces preview failures in the active language and recovers for the next file", async () => {
	vi.spyOn(console, "error").mockImplementation(() => {});
	const language = i18next.createInstance();
	await language.init({ lng: "en", fallbackLng: "zh", resources: { en: { chat: en }, zh: { chat: zh } } });
	const view = render(
		<I18nextProvider i18n={language}>
			<PreviewErrorBoundary resetKey="broken">
				<BrokenPreview />
			</PreviewErrorBoundary>
		</I18nextProvider>,
	);
	expect(screen.getByRole("alert").textContent).toBe(en.filePreview.failed);
	await act(async () => {
		await language.changeLanguage("zh");
	});
	expect(screen.getByRole("alert").textContent).toBe(zh.filePreview.failed);
	view.rerender(
		<I18nextProvider i18n={language}>
			<PreviewErrorBoundary resetKey="readable">
				<p>Readable document</p>
			</PreviewErrorBoundary>
		</I18nextProvider>,
	);
	expect(screen.getByText("Readable document")).toBeTruthy();
	expect(screen.queryByRole("alert")).toBeNull();
});
