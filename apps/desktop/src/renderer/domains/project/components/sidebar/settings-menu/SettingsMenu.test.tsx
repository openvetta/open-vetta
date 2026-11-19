// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createInstance } from "i18next";
import { Provider } from "jotai";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import settings from "@/shared/i18n/locales/en/settings.json";
import project from "@/shared/i18n/locales/en/project.json";
import { SettingsMenu } from "./SettingsMenu";

const i18n = createInstance();
await i18n.init({ lng: "en", fallbackLng: "en", resources: { en: { settings, project } } });

const currentPath = vi.hoisted(() => ({ value: "/project/foo" }));
const routedPath = vi.hoisted(() => ({ value: "" }));
vi.mock("@tanstack/react-router", () => ({
	useLocation: (options?: { select?: (location: { pathname: string }) => unknown }) => {
		const location = { pathname: currentPath.value };
		return options?.select ? options.select(location) : location;
	},
	useNavigate: () => (route: { to: string; params?: Record<string, string> }) => {
		routedPath.value = Object.entries(route.params ?? {}).reduce(
			(path, [key, value]) => path.replace(`$${key}`, value),
			route.to,
		);
	},
}));
vi.mock("@vetta-org/theme-sdk", () => ({
	useThemeComponent: (_key: string, fallback: unknown) => fallback,
}));

beforeEach(() => {
	routedPath.value = "";
	vi.stubGlobal("vetta", {
		im: {
			subscribeStatus: async () => () => {},
			getStatus: async () => ({ transport: "offline" }),
		},
	});
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

function renderMenu(): void {
	render(
		<Provider>
			<I18nextProvider i18n={i18n}>
				<SettingsMenu />
			</I18nextProvider>
		</Provider>,
	);
}

describe("SettingsMenu", () => {
	it("goes straight to the settings page instead of opening a dropdown", () => {
		renderMenu();
		const button = screen.getByRole("button", { name: "Settings" });
		expect(button.getAttribute("aria-haspopup")).toBeNull();
		fireEvent.click(button);
		expect(button.getAttribute("aria-pressed")).not.toBe("true");
		expect(routedPath.value).toBe("/settings/general");
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("shows the pressed state only while a settings page is open", () => {
		currentPath.value = "/settings/spaces";
		renderMenu();
		expect(screen.getByRole("button", { name: "Settings" }).getAttribute("aria-pressed")).toBe("true");
		cleanup();
		currentPath.value = "/project/foo";
		renderMenu();
		expect(screen.getByRole("button", { name: "Settings" }).getAttribute("aria-pressed")).not.toBe("true");
	});
});
