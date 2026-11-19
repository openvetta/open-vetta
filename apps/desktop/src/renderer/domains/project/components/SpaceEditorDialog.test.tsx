// @vitest-environment jsdom
import { INITIAL_SPACES, spaceEditorAtom, spacesAtom } from "@shared/store/spaces";
import project from "@/shared/i18n/locales/en/project.json";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createInstance } from "i18next";
import { createStore, Provider } from "jotai";
import { I18nextProvider } from "react-i18next";
import { afterEach, expect, it, vi } from "vitest";
import { SpaceEditorDialog } from "./SpaceEditorDialog";

const i18n = createInstance();
await i18n.init({ lng: "en", fallbackLng: "en", resources: { en: { project } } });
const navigate = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@tanstack/react-router", () => ({
	useLocation: () => "/settings/spaces",
	useNavigate: () => navigate,
}));

function renderDialog(initial: typeof INITIAL_SPACES = INITIAL_SPACES, editor = {}) {
	const store = createStore();
	store.set(spacesAtom, initial);
	store.set(spaceEditorAtom, editor);
	render(
		<I18nextProvider i18n={i18n}>
			<Provider store={store}>
				<SpaceEditorDialog />
			</Provider>
		</I18nextProvider>,
	);
	return store;
}

afterEach(() => {
	cleanup();
	localStorage.clear();
});

it("shows the full icon set with a selected state and saves the chosen icon", () => {
	const store = renderDialog();
	const icons = screen.getByRole("group", { name: "Workspace icon" }).querySelectorAll("button");
	expect(icons).toHaveLength(60);
	expect(screen.queryByRole("textbox", { name: "Emoji" })).toBeNull();
	expect(screen.queryByRole("button", { name: "Home" })).toBeNull();
	expect(screen.getByRole("button", { name: "Folder" }).getAttribute("aria-pressed")).toBe("true");
	expect(screen.getByRole("button", { name: "Rocket" }).getAttribute("aria-pressed")).toBe("false");

	fireEvent.click(screen.getByRole("button", { name: "Rocket" }));
	expect(screen.getByRole("button", { name: "Rocket" }).getAttribute("aria-pressed")).toBe("true");
	expect(screen.getByRole("button", { name: "Folder" }).getAttribute("aria-pressed")).toBe("false");

	fireEvent.change(screen.getByRole("textbox", { name: "Workspace name" }), { target: { value: "Launch" } });
	fireEvent.click(screen.getByRole("button", { name: "Save" }));

	const [space] = store.get(spacesAtom).spaces;
	expect(space).toMatchObject({ name: "Launch", icon: { kind: "solar", value: "rocket" } });
	expect(store.get(spaceEditorAtom)).toBeNull();
});

it("keeps the icon of an existing workspace selected while editing its name", () => {
	const existing = { id: "work", name: "Work", icon: { kind: "solar" as const, value: "code" as const } };
	const store = renderDialog({ ...INITIAL_SPACES, spaces: [existing] }, { space: existing });
	expect(screen.getByRole("button", { name: "Code" }).getAttribute("aria-pressed")).toBe("true");

	fireEvent.change(screen.getByRole("textbox", { name: "Workspace name" }), { target: { value: "Studio" } });
	fireEvent.click(screen.getByRole("button", { name: "Save" }));
	expect(store.get(spacesAtom).spaces).toEqual([{ ...existing, name: "Studio" }]);
});
