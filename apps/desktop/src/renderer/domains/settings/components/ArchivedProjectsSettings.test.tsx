// @vitest-environment jsdom
import { confirmDialogAtom } from "@shared/store/atoms";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createInstance } from "i18next";
import { createStore, Provider } from "jotai";
import { I18nextProvider } from "react-i18next";
import { afterEach, expect, it, vi } from "vitest";
import settings from "@/shared/i18n/locales/en/settings.json";
import { ArchivedProjectsSettings } from "./ArchivedProjectsSettings";

const i18n = createInstance();
await i18n.init({ lng: "en", resources: { en: { settings } } });

function renderSettings(paths: readonly string[], fail: ReadonlySet<string> = new Set()) {
	const store = createStore();
	const archived = new Set(paths);
	const unarchive = vi.fn(async (path: string) => {
		if (fail.has(path)) throw new Error("busy");
		archived.delete(path);
	});
	const remove = vi.fn(async (path: string) => {
		if (fail.has(path)) throw new Error("busy");
		archived.delete(path);
	});
	vi.stubGlobal("vetta", {
		config: {
			get: async () => ({ projects: [], archivedProjects: [...archived].map((path) => ({ path })) }),
			onProjectsChanged: () => () => {},
		},
		project: { unarchive, remove, readMeta: async () => null },
		session: { onSessionsChanged: () => () => {} },
		im: { onSessionChanged: () => () => {} },
		appMonitor: { recordEvent: () => {} },
	});
	render(
		<I18nextProvider i18n={i18n}>
			<Provider store={store}>
				<ArchivedProjectsSettings />
			</Provider>
		</I18nextProvider>,
	);
	return { store, archived, unarchive, remove };
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

it("unarchives only the checked projects in one go", async () => {
	const { unarchive } = renderSettings(["/a", "/b", "/c"]);
	fireEvent.click(await screen.findByRole("checkbox", { name: "Select a" }));
	fireEvent.click(screen.getByRole("checkbox", { name: "Select c" }));
	expect(screen.getByText("2 selected")).toBeTruthy();
	fireEvent.click(screen.getByRole("button", { name: "Unarchive selected" }));
	await waitFor(() => expect(screen.queryByText("/a")).toBeNull());
	expect(unarchive.mock.calls.map(([path]) => path)).toEqual(["/a", "/c"]);
	expect(screen.queryByText("/c")).toBeNull();
	expect(screen.getByText("/b")).toBeTruthy();
	expect(screen.queryByRole("button", { name: "Unarchive selected" })).toBeNull();
});

it("select all deletes every project after a single confirmation", async () => {
	const { store, archived, remove } = renderSettings(["/a", "/b"]);
	fireEvent.click(await screen.findByRole("checkbox", { name: "Select all" }));
	expect(screen.getByRole("checkbox", { name: "Select a" }).getAttribute("aria-checked")).toBe("true");
	fireEvent.click(screen.getByRole("button", { name: "Delete selected" }));
	// 确认之前什么都没删：归档列表原样保留。
	expect([...archived]).toEqual(["/a", "/b"]);
	const dialog = store.get(confirmDialogAtom);
	expect(dialog?.message).toContain("2 selected projects");
	act(() => dialog?.onConfirm(false));
	await screen.findByText("No archived projects");
	expect(remove.mock.calls.map(([path]) => path)).toEqual(["/a", "/b"]);
});

it("keeps failed projects selected and says how many failed", async () => {
	renderSettings(["/a", "/b"], new Set(["/b"]));
	fireEvent.click(await screen.findByRole("checkbox", { name: "Select all" }));
	fireEvent.click(screen.getByRole("button", { name: "Unarchive selected" }));
	expect((await screen.findByRole("alert")).textContent).toBe("1 could not be processed. You can try again.");
	expect(screen.queryByText("/a")).toBeNull();
	expect(screen.getByRole("checkbox", { name: "Select b" }).getAttribute("aria-checked")).toBe("true");
	expect(screen.getByText("1 selected")).toBeTruthy();
});
