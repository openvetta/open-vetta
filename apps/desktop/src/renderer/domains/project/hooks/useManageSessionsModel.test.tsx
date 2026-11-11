// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import {
	automationSessionLinksAtom,
	confirmDialogAtom,
	conversationTagsAtom,
	manageSessionsProjectAtom,
	pinnedSessionPathsAtom,
	runningSessionPathsAtom,
} from "@shared/store/atoms";
import { createStore, Provider } from "jotai";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectsPanelModel } from "../components/sidebar/projects/panel/types";
import type { SidebarConversationInfo } from "../services/sidebar-conversation-projection";
import { useManageSessionsModel } from "./useManageSessionsModel";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

const forgetConversations = vi.fn();
const assign = vi.fn();
vi.stubGlobal(
	"window",
	Object.assign(globalThis.window, {
		vetta: { conversationTags: { forgetConversations, assign }, shell: { showInFolder: vi.fn() } },
	}),
);

function session(name: string, modifiedAt: number): SidebarConversationInfo {
	return {
		kind: "conversation",
		path: `/s/${name}.jsonl`,
		cwd: "/work/app",
		name,
		firstMessage: name,
		modifiedAt,
	} as unknown as SidebarConversationInfo;
}

const alpha = session("alpha", 3);
const beta = session("beta", 2);
const gamma = session("gamma", 1);
const project = { cwd: "/work/app", name: "app" } as never;
const defaultProject = { cwd: "/work/chat", name: "chat", isDefault: true } as never;

function setup(options: { project?: unknown; filter?: string } = {}) {
	const store = createStore();
	const actions = {
		deleteSession: vi.fn(),
		selectSession: vi.fn(),
		defaultSelectSession: vi.fn(),
		renameSession: vi.fn(),
		clearConversation: vi.fn(),
		clearClaw: vi.fn(),
	};
	const panel = {
		defaultConversationFilter: options.filter ?? "conversation",
		defaultSessions: [alpha, beta, gamma],
		defaultSessionsCwd: "/work/chat",
		projectSessions: () => [alpha, beta, gamma],
		actions,
	} as unknown as ProjectsPanelModel;
	store.set(manageSessionsProjectAtom, (options.project ?? project) as never);
	const wrapper = ({ children }: PropsWithChildren): JSX.Element => <Provider store={store}>{children}</Provider>;
	const hook = renderHook(() => useManageSessionsModel(panel), { wrapper });
	return { store, actions, ...hook };
}

function press(key: string, init: KeyboardEventInit = {}): void {
	act(() => {
		window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
	});
}

beforeEach(() => {
	forgetConversations.mockReset();
	assign.mockReset();
});

describe("useManageSessionsModel", () => {
	it("lists sessions with pinned ones first and filters by title", () => {
		const { result, store } = setup();
		expect(result.current.rows.map((row) => row.title)).toEqual(["alpha", "beta", "gamma"]);

		act(() => store.set(pinnedSessionPathsAtom, new Map([[gamma.path, 10]])));
		expect(result.current.rows.map((row) => row.title)).toEqual(["gamma", "alpha", "beta"]);

		act(() => result.current.onQueryChange("BET"));
		expect(result.current.rows.map((row) => row.title)).toEqual(["beta"]);
		expect(result.current.selectedId).toBe(result.current.rows[0]?.id);
	});

	it("deletes the selected session on Ctrl+X without a confirm dialog and moves to the next row", () => {
		const { result, actions, store } = setup();
		press("ArrowDown");
		expect(result.current.selectedId).toBe(result.current.rows[1]?.id);

		press("x", { ctrlKey: true });

		expect(actions.deleteSession).toHaveBeenCalledWith(beta);
		expect(forgetConversations).toHaveBeenCalledWith([beta.path]);
		expect(store.get(confirmDialogAtom)).toBeNull();
		expect(result.current.selectedId).toBe(result.current.rows[2]?.id);
	});

	it("still asks before deleting a session an automation is bound to", () => {
		const { result, actions, store } = setup();
		act(() =>
			store.set(
				automationSessionLinksAtom,
				new Map([[alpha.path, { mode: "same-session", taskName: "daily" }]]) as never,
			),
		);

		press("x", { ctrlKey: true });

		expect(actions.deleteSession).not.toHaveBeenCalled();
		expect(store.get(confirmDialogAtom)).toMatchObject({ variant: "danger" });
		act(() => store.get(confirmDialogAtom)?.onConfirm(false));
		expect(actions.deleteSession).toHaveBeenCalledWith(alpha);
		expect(result.current.open).toBe(true);
	});

	it("opens the more-actions step with Ctrl+K and returns with Esc", () => {
		const { result } = setup({ project: defaultProject });
		press("k", { ctrlKey: true });
		expect(result.current.step).toBe("menu");
		expect(result.current.menuItems.map((item) => item.id)).toEqual([
			"pin",
			"rename",
			"tags",
			"open-in-folder",
			"delete",
		]);

		press("Escape");
		expect(result.current.step).toBe("list");
		expect(result.current.open).toBe(true);
	});

	it("only offers move-to-tag for the default conversation list", () => {
		const { result } = setup();
		press("k", { ctrlKey: true });
		expect(result.current.menuItems.map((item) => item.id)).not.toContain("tags");
	});

	it("keeps claw sessions read-only: no rename, delete, tag or Ctrl+X", () => {
		const { result, actions } = setup({ project: defaultProject, filter: "claw" });
		press("x", { ctrlKey: true });
		expect(actions.deleteSession).not.toHaveBeenCalled();

		press("k", { ctrlKey: true });
		expect(result.current.menuItems.map((item) => item.id)).toEqual(["pin", "open-in-folder"]);
	});

	it("renames through the menu and submits on Enter", () => {
		const { result, actions } = setup();
		press("k", { ctrlKey: true });
		press("ArrowDown");
		press("Enter");
		expect(result.current.step).toBe("rename");
		expect(result.current.renameValue).toBe("alpha");

		act(() => result.current.onRenameChange("  renamed "));
		act(() => result.current.onRenameSubmit());

		expect(actions.renameSession).toHaveBeenCalledWith("/work/app", alpha.path, "renamed");
		expect(result.current.step).toBe("list");
	});

	it("clears a regular project only after confirmation", () => {
		const { result, actions, store } = setup();
		act(() => result.current.onClearAll());
		expect(result.current.open).toBe(false);
		expect(actions.deleteSession).not.toHaveBeenCalled();

		act(() => store.get(confirmDialogAtom)?.onConfirm(false));
		expect(actions.deleteSession.mock.calls.map(([deleted]) => deleted)).toEqual([alpha, beta, gamma]);
	});

	it("delegates clearing the default conversation list to the existing action", () => {
		const { result, actions } = setup({ project: defaultProject });
		act(() => result.current.onClearAll());
		expect(actions.clearConversation).toHaveBeenCalledWith("/work/chat");
	});

	it("blocks clear-all while a session in scope is running", () => {
		const { result, actions, store } = setup();
		act(() => store.set(runningSessionPathsAtom, new Set([beta.path])));
		expect(result.current.clearAllDisabled).toBe(true);

		act(() => result.current.onClearAll());
		expect(result.current.open).toBe(true);
		expect(store.get(confirmDialogAtom)).toBeNull();
		expect(actions.deleteSession).not.toHaveBeenCalled();
	});

	it("cycles tag tabs with Tab and narrows the list, only for the default conversation list", () => {
		const { result, store } = setup({ project: defaultProject });
		expect(result.current.tabs).toEqual([]);

		act(() =>
			store.set(conversationTagsAtom, {
				tags: [{ id: "t1", name: "Work", color: "#f00" }],
				assignments: { [beta.path]: ["t1"] },
			} as never),
		);
		expect(result.current.tabs.map((tab) => tab.id)).toEqual(["all", "t1"]);

		expect(result.current.rows.find((row) => row.title === "beta")?.tagColors).toEqual(["#f00"]);
		press("Tab");
		expect(result.current.activeTabId).toBe("t1");
		expect(result.current.rows.map((row) => row.title)).toEqual(["beta"]);

		press("Tab");
		expect(result.current.activeTabId).toBe("all");
		press("Tab", { shiftKey: true });
		expect(result.current.activeTabId).toBe("t1");
	});

	it("shows no tag tabs for a regular project", () => {
		const { result, store } = setup();
		act(() =>
			store.set(conversationTagsAtom, { tags: [{ id: "t1", name: "Work", color: "#f00" }], assignments: {} } as never),
		);
		expect(result.current.tabs).toEqual([]);
	});
});
