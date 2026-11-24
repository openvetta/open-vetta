// @vitest-environment jsdom
import { defaultConversationCwdAtom } from "@shared/store/atoms";
import { INITIAL_SPACES, MAIN_SPACE, spaceEditorAtom, spacesAtom } from "@shared/store/spaces";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createInstance } from "i18next";
import { createStore, Provider } from "jotai";
import { I18nextProvider } from "react-i18next";
import { afterEach, expect, it, vi } from "vitest";
import project from "@/shared/i18n/locales/en/project.json";
import { SpacesSettings } from "./SpacesSettings";

const i18n = createInstance();
await i18n.init({ lng: "en", resources: { en: { project } } });
const sessionPath = "/test/chat/session.jsonl";

function renderSettings() {
	const store = createStore();
	store.set(defaultConversationCwdAtom, "/test/chat");
	store.set(spacesAtom, {
		...INITIAL_SPACES,
		spaces: [{ id: "work", name: "Work", icon: { kind: "solar", value: "folder" } }],
		selected: "work",
		projects: { "/project": "work", "/archive": "work" },
		conversations: { [sessionPath]: "work" },
	});
	const storedConversations = new Set([sessionPath, "/test/chat/other.jsonl"]);
	const registeredProjects = new Set(["/project", "/unrelated", "/archive"]);
	const deleteSession = async (path: string) => {
		storedConversations.delete(path);
	};
	const removeProject = async (path: string) => { registeredProjects.delete(path); };
	const listRunning = vi.fn(async () => [sessionPath]);
	vi.stubGlobal("vetta", {
		config: { get: async () => ({ projects: [{ path: "/project" }, { path: "/unrelated" }], archivedProjects: [{ path: "/archive" }] }) },
		agentTeams: { listSidebarConversations: async () => [] },
		session: {
			listRunning,
			listSessions: async () => [{ path: sessionPath, name: "Running chat" }, { path: "/test/chat/other.jsonl" }],
			delete: deleteSession,
		},
		project: { remove: removeProject },
	});
	render(<I18nextProvider i18n={i18n}><Provider store={store}><SpacesSettings /></Provider></I18nextProvider>);
	fireEvent.click(screen.getByRole("button", { name: /^Remove Work$/ }));
	return { store, storedConversations, registeredProjects, listRunning };
}

afterEach(() => {
	cleanup();
	localStorage.removeItem("vetta.desktop-spaces.v1");
	vi.unstubAllGlobals();
});

it("moves everything to the main workspace when removing only the workspace", async () => {
	const { store, storedConversations, registeredProjects } = renderSettings();
	fireEvent.click(screen.getByRole("button", { name: /^Remove workspace$/ }));
	await waitFor(() => expect(store.get(spacesAtom).spaces).toEqual([]));
	expect(store.get(spacesAtom)).toMatchObject({ selected: MAIN_SPACE, projects: {}, conversations: {} });
	expect([...storedConversations]).toEqual([sessionPath, "/test/chat/other.jsonl"]);
	expect([...registeredProjects]).toEqual(["/project", "/unrelated", "/archive"]);
});

it("requires the exact name and blocks running conversations before removing only the indicated items", async () => {
	const { store, storedConversations, registeredProjects, listRunning } = renderSettings();
	const label = "Remove workspace and projects";
	fireEvent.click(screen.getByRole("radio", { name: label }));
	const remove = screen.getByRole<HTMLButtonElement>("button", { name: label });
	const confirm = screen.getByRole("textbox", { name: "Type Work to confirm" });
	fireEvent.change(confirm, { target: { value: "work" } });
	expect(remove.disabled).toBe(true);
	fireEvent.change(confirm, { target: { value: "Work" } });
	await waitFor(() => expect(remove.disabled).toBe(false));
	fireEvent.click(remove);
	await screen.findByText("Running chat");
	expect([...storedConversations]).toEqual([sessionPath, "/test/chat/other.jsonl"]);
	expect([...registeredProjects]).toEqual(["/project", "/unrelated", "/archive"]);
	listRunning.mockResolvedValueOnce([]);
	fireEvent.click(remove);
	await waitFor(() => expect(store.get(spacesAtom).spaces).toEqual([]));
	expect([...storedConversations]).toEqual(["/test/chat/other.jsonl"]);
	expect([...registeredProjects]).toEqual(["/unrelated", "/archive"]);
});

it("reorders rows by dragging and edits a workspace from the row actions", () => {
	const store = createStore();
	store.set(defaultConversationCwdAtom, "/test/chat");
	store.set(spacesAtom, {
		...INITIAL_SPACES,
		spaces: [
			{ id: "work", name: "Work", icon: { kind: "solar", value: "folder" } },
			{ id: "personal", name: "Personal", icon: { kind: "solar", value: "home" } },
		],
	});
	render(<I18nextProvider i18n={i18n}><Provider store={store}><SpacesSettings /></Provider></I18nextProvider>);
	const work = screen.getByText("Work").closest<HTMLElement>("[draggable]");
	const personal = screen.getByText("Personal").closest<HTMLElement>("[draggable]");
	expect(work?.querySelector('[class*="grip-vertical"]')).not.toBeNull();
	expect(work?.querySelector(".bg-primary.rounded-full")).not.toBeNull();
	expect(screen.queryByRole("button", { name: /Move Work (up|down)/ })).toBeNull();

	const data = new Map<string, string>();
	const dataTransfer = {
		setData: (key: string, value: string) => data.set(key, value),
		getData: (key: string) => data.get(key) ?? "",
	} as unknown as DataTransfer;
	if (work) fireEvent.dragStart(work, { dataTransfer });
	if (personal) fireEvent.drop(personal, { dataTransfer });
	expect(store.get(spacesAtom).spaces.map(({ name }) => name)).toEqual(["Personal", "Work"]);

	fireEvent.click(screen.getByRole("button", { name: "Edit Personal" }));
	expect(store.get(spaceEditorAtom)).toMatchObject({ space: { id: "personal", name: "Personal" } });
});

it("explains what workspaces are above the list and still creates one from the list header", () => {
	const store = createStore();
	store.set(defaultConversationCwdAtom, "/test/chat");
	render(<I18nextProvider i18n={i18n}><Provider store={store}><SpacesSettings /></Provider></I18nextProvider>);
	expect(screen.getByText(project.spaces.intro.subtitle)).toBeTruthy();
	for (const key of ["group", "switch", "resume", "safe"] as const) {
		expect(screen.getByText(project.spaces.intro[key].title)).toBeTruthy();
		expect(screen.getByText(project.spaces.intro[key].description)).toBeTruthy();
	}
	const list = screen.getByText("Your workspaces");
	expect(list.compareDocumentPosition(screen.getByText(project.spaces.intro.safe.title)) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
	fireEvent.click(screen.getByRole("button", { name: "New workspace" }));
	expect(store.get(spaceEditorAtom)).toEqual({});
});
