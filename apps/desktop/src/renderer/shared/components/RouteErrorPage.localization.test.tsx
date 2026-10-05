// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouteErrorPageView } from "@vetta-org/theme-ui/overlays";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "@/shared/i18n/locales/en/common.json";
import zh from "@/shared/i18n/locales/zh/common.json";
import { useRouteErrorPageModel } from "../hooks/useRouteErrorPageModel";

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

const error = new Error("Fixture load failure");
function Failure({ reset }: { reset: () => void }) {
	const model = useRouteErrorPageModel({ error, reset });
	return <RouteErrorPageView {...model} homeAction={<a href="#/">{model.labels.home}</a>} />;
}

describe("route error page", () => {
	it.each(["en", "zh"] as const)(
		"shows recovery actions in %s and retries without losing the error context",
		async (lang) => {
			vi.spyOn(console, "error").mockImplementation(() => {});
			const i18n = createInstance();
			await i18n.init({ lng: lang, fallbackLng: "zh", resources: { en: { common: en }, zh: { common: zh } } });
			const reset = vi.fn();
			const user = userEvent.setup();
			render(
				<I18nextProvider i18n={i18n}>
					<Failure reset={reset} />
				</I18nextProvider>,
			);
			const labels = lang === "en" ? en.routeError : zh.routeError;
			expect(screen.getByRole("heading", { name: labels.pageTitle })).toBeTruthy();
			expect(screen.getByRole("link", { name: labels.home }).getAttribute("href")).toBe("#/");
			await user.click(screen.getByRole("button", { name: labels.retryPage }));
			expect(reset).toHaveBeenCalledOnce();
			expect(screen.getByText("Fixture load failure")).toBeTruthy();
		},
	);
});
