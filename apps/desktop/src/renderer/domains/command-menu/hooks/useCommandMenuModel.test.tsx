// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { getDefaultStore } from "jotai";
import { beforeEach, expect, it, vi } from "vitest";
import type { DesktopSessionSearchResult } from "@/shared/session-search";

const navigate = vi.hoisted(() => vi.fn());
const sessionSearchState = vi.hoisted(() => ({
	results: [] as DesktopSessionSearchResult[],
	loading: false,
	error: false,
	limited: false,
	skipped: 0,
	sources: [],
}));
const scopeBindings = vi.hoisted(() => ({ current: [] as { key: string; run: () => void }[] }));
const projectSessions = vi.hoisted(() => ({ current: [] as unknown[] }));
const prefetchCommandMenuAction = vi.hoisted(() => vi.fn());
const sessionSearchCalls = vi.hoisted(() => [] as { open: boolean; request: { query: string; activePaths?: readonly string[] } }[]);

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
vi.mock("../../../root-layout/nav-route-prefetch", () => ({ prefetchCommandMenuAction }));
vi.mock("../../project/hooks/useSessionSearch", () => ({
	useSessionSearch: (open: boolean, request: { query: string; activePaths?: readonly string[] }) => {
		sessionSearchCalls.push({ open, request });
		return sessionSearchState;
	},
}));
vi.mock("../../plugins/runtime/plugin-i18n", () => ({
	usePluginTextResolver: () => (_pluginId: string, raw: string) => raw,
}));
vi.mock("@shared/shortcuts", () => ({
	useShortcutScope: ({ active, bindings }: { active: boolean; bindings: { key: string; run: () => void }[] }) => {
		if (active) scopeBindings.current = bindings;
	},
}));
vi.mock("react-i18next", () => ({
	// 文案直接回显 key，断言看的是行为不是译文。
	useTranslation: () => ({ t: (key: string) => key }),
}));

import { commandMenuOpenAtom, defaultConversationCwdAtom, projectsAtom, sessionsMapAtom } from "@shared/store/atoms";
import { attentionSessionPathsAtom } from "@shared/store/attention-sessions-atoms";
import { pendingInteractionPathsAtom } from "@shared/store/pending-interactions-atoms";
import { recentSessionVisitsAtom } from "@shared/store/recent-sessions-atoms";
import { runningSessionPathsAtom } from "@shared/store/running-sessions-atoms";
import { INITIAL_SPACES, spacesAtom } from "@shared/store/spaces";
import { useCommandMenuModel } from "./useCommandMenuModel";

function sessionResult(path: string, title: string): DesktopSessionSearchResult {
	return {
		session: {
			id: path,
			path,
			cwd: "/w",
			name: title,
			firstMessage: "",
			modifiedAt: 1,
			access: { readHistory: true, resume: true, rename: true, delete: true },
		},
		sourceCwd: "/w/proj",
		sourceKind: "project",
		sourceName: "Proj",
		match: { field: "title", snippet: title },
	};
}

const store = getDefaultStore();

function press(key: string): void {
	const binding = scopeBindings.current.find((entry) => entry.key === key);
	if (!binding) throw new Error(`no binding for ${key}`);
	act(() => binding.run());
}

function render() {
	return renderHook(() => useCommandMenuModel({ onOpenSession: vi.fn(async () => undefined) }));
}

beforeEach(() => {
	navigate.mockReset();
	prefetchCommandMenuAction.mockReset();
	scopeBindings.current = [];
	sessionSearchState.results = [];
	sessionSearchState.loading = false;
	sessionSearchCalls.length = 0;
	store.set(runningSessionPathsAtom, new Set<string>());
	store.set(pendingInteractionPathsAtom, new Map<string, number>());
	store.set(attentionSessionPathsAtom, new Set<string>());
	store.set(recentSessionVisitsAtom, []);
	store.set(sessionsMapAtom, new Map());
	projectSessions.current = [];
	Object.defineProperty(window, "vetta", {
		configurable: true,
		value: {
			skills: { list: async () => [] },
			plugins: { listAll: async () => [] },
			session: { listSessions: async () => projectSessions.current },
			// 面板打开后会去读生效的开关键；默认绑定即 mod+t。
			config: { get: async () => ({}), onShortcutsChanged: () => () => undefined },
		},
	});
	store.set(commandMenuOpenAtom, true);
	store.set(spacesAtom, INITIAL_SPACES);
	store.set(projectsAtom, [
		{ cwd: "/w/alpha", name: "alpha", sessionCount: 0, type: "normal" },
		{ cwd: "/w/alpine", name: "alpine", sessionCount: 0, type: "normal" },
	]);
});

it("prepares the selected settings command without activating it", () => {
	const { result } = render();
	const settings = result.current.groups.find((group) => group.key === "settings")?.items[0];
	expect(settings).toBeDefined();
	act(() => result.current.onHoverItem(settings?.id ?? ""));
	expect(prefetchCommandMenuAction).toHaveBeenCalledWith(expect.objectContaining({ kind: "openSettingsSection" }));
	expect(navigate).not.toHaveBeenCalled();
});

it("keeps the selection anchored to the id when async session results arrive", async () => {
	const { result, rerender } = render();
	act(() => result.current.onQueryChange("alp"));
	await waitFor(() => expect(result.current.groups.length).toBeGreaterThan(0));

	press("arrowdown");
	const anchored = result.current.selectedId;
	expect(anchored).toBe("project:/w/alpine");

	// 会话结果晚到并被插进列表：选中项必须还是同一条，而不是被顶走。
	sessionSearchState.results = [sessionResult("/w/a.jsonl", "alp session")];
	rerender();
	await waitFor(() => expect(result.current.groups.some((group) => group.key === "sessions")).toBe(true));
	expect(result.current.selectedId).toBe(anchored);
});

it("falls back to the first row only when the anchored id disappears", async () => {
	const { result } = render();
	act(() => result.current.onQueryChange("alp"));
	press("arrowdown");
	expect(result.current.selectedId).toBe("project:/w/alpine");

	act(() => result.current.onQueryChange("alpha"));
	await waitFor(() => expect(result.current.selectedId).toBe("project:/w/alpha"));
});

it("suppresses the marker animation on typing but not on arrow navigation", async () => {
	const { result } = render();
	act(() => result.current.onQueryChange("alp"));
	expect(result.current.suppressSelectionAnimation).toBe(true);

	press("arrowdown");
	expect(result.current.suppressSelectionAnimation).toBe(false);

	act(() => result.current.onQueryChange("alph"));
	expect(result.current.suppressSelectionAnimation).toBe(true);
});

it("wraps around at both ends of the flattened row order", () => {
	const { result } = render();
	act(() => result.current.onQueryChange("alp"));

	press("arrowup");
	const last = result.current.selectedId;
	press("arrowdown");
	expect(result.current.selectedId).not.toBe(last);
});

it("opens a project on its latest session rather than the project overview", async () => {
	const onOpenSession = vi.fn(async () => undefined);
	projectSessions.current = [
		{
			id: "old",
			path: "/w/alpha/old.jsonl",
			cwd: "/w/alpha",
			firstMessage: "",
			modifiedAt: 1,
			access: { readHistory: true, resume: true, rename: true, delete: true },
		},
		{
			id: "latest",
			path: "/w/alpha/latest.jsonl",
			cwd: "/w/alpha",
			firstMessage: "",
			modifiedAt: 9,
			access: { readHistory: true, resume: true, rename: true, delete: true },
		},
	];
	const { result } = renderHook(() => useCommandMenuModel({ onOpenSession }));
	act(() => result.current.onQueryChange("alpha"));
	await waitFor(() => expect(result.current.selectedId).toBe("project:/w/alpha"));

	press("enter");
	// 面板立即关闭，不等异步的 listSessions 回来。
	expect(store.get(commandMenuOpenAtom)).toBe(false);
	await waitFor(() => expect(onOpenSession).toHaveBeenCalledWith("/w/alpha", "/w/alpha/latest.jsonl"));
	expect(navigate).not.toHaveBeenCalled();
});

it("falls back to the project page when it has no openable session", async () => {
	const onOpenSession = vi.fn(async () => undefined);
	projectSessions.current = [];
	const { result } = renderHook(() => useCommandMenuModel({ onOpenSession }));
	act(() => result.current.onQueryChange("alpha"));
	await waitFor(() => expect(result.current.selectedId).toBe("project:/w/alpha"));

	press("enter");
	await waitFor(() =>
		expect(navigate).toHaveBeenCalledWith({
			to: "/project/$cwd",
			params: { cwd: encodeURIComponent("/w/alpha") },
		}),
	);
	expect(onOpenSession).not.toHaveBeenCalled();
});

it("closes on escape and on a second mod+t without navigating", () => {
	const { result } = render();
	act(() => result.current.onQueryChange("alpha"));

	press("mod+t");
	expect(store.get(commandMenuOpenAtom)).toBe(false);
	expect(navigate).not.toHaveBeenCalled();

	store.set(commandMenuOpenAtom, true);
	press("escape");
	expect(store.get(commandMenuOpenAtom)).toBe(false);
});

it("clears the query when closed so the next open starts empty", async () => {
	const { result } = render();
	act(() => result.current.onQueryChange("alpha"));
	expect(result.current.query).toBe("alpha");

	act(() => result.current.onClose());
	expect(result.current.query).toBe("");
});

it("shows no groups and issues no session search while the query is empty", () => {
	const { result } = render();
	// 空查询态：不发 IPC，只有本地目录，且逃生行不出现。
	expect(result.current.groups.some((group) => group.key === "sessions")).toBe(false);
	expect(
		result.current.groups
			.flatMap((group) => group.items)
			.some((item) => item.id === "ability:marketplace-search"),
	).toBe(false);
});

it("keeps an unavailable session out of keyboard navigation", async () => {
	sessionSearchState.results = [
		{
			...sessionResult("/w/locked.jsonl", "alp locked"),
			session: {
				...sessionResult("/w/locked.jsonl", "alp locked").session,
				access: { readHistory: false, resume: false, rename: false, delete: false },
			},
		},
	];
	const { result } = render();
	act(() => result.current.onQueryChange("alp locked"));

	await waitFor(() => expect(result.current.groups.some((group) => group.key === "sessions")).toBe(true));
	const sessions = result.current.groups.find((group) => group.key === "sessions");
	expect(sessions?.items[0].disabled).toBe(true);
	// 禁用行不参与导航，回车不应打开它。
	act(() => result.current.onActivateItem("session:/w/locked.jsonl"));
	expect(navigate).not.toHaveBeenCalled();
});

it("labels a search result with its workspace and switches to that workspace when opened", async () => {
	store.set(spacesAtom, { ...INITIAL_SPACES,
		spaces: [{ id: "studio", name: "Studio", icon: { kind: "solar", value: "code" } }],
		projects: { "/w/alpha": "studio" },
	});
	const { result } = render();
	act(() => result.current.onQueryChange("alpha"));
	await waitFor(() => expect(result.current.groups.find((group) => group.key === "projects")?.items[0]?.badge).toBe("Studio"));
	act(() => result.current.onActivateItem("project:/w/alpha"));
	expect(store.get(spacesAtom).selected).toBe("studio");
	expect(store.get(commandMenuOpenAtom)).toBe(false);
});

it("lists running and waiting sessions on top before anything is typed", () => {
	store.set(runningSessionPathsAtom, new Set(["/w/run.jsonl", "/w/both.jsonl"]));
	store.set(pendingInteractionPathsAtom, new Map([["/w/both.jsonl", 1]]));
	sessionSearchState.results = [sessionResult("/w/run.jsonl", "Run"), sessionResult("/w/both.jsonl", "Both")];
	const { result } = render();

	const lastCall = sessionSearchCalls.at(-1);
	expect(lastCall?.open).toBe(true);
	expect(lastCall?.request).toMatchObject({ query: "", activePaths: ["/w/both.jsonl", "/w/run.jsonl"] });
	expect(result.current.groups[0].key).toBe("activeSessions");
	expect(result.current.groups[0].items.map((item) => [item.title, item.status, item.badge])).toEqual([
		["Both", "waiting", "Proj"],
		["Run", "running", "Proj"],
	]);
});

it("does not start a session search for an empty query when nothing is in progress", () => {
	render();
	expect(sessionSearchCalls.at(-1)?.open).toBe(false);
});

it("keeps a session that just finished on top until it is opened", () => {
	store.set(attentionSessionPathsAtom, new Set(["/w/done.jsonl"]));
	sessionSearchState.results = [sessionResult("/w/done.jsonl", "Done")];
	const { result } = render();

	expect(sessionSearchCalls.at(-1)?.request).toMatchObject({ query: "", activePaths: ["/w/done.jsonl"] });
	expect(result.current.groups[0].items.map((item) => [item.title, item.status])).toEqual([["Done", "unread"]]);
});

it("starts a new conversation from the panel and closes it", () => {
	store.set(defaultConversationCwdAtom, "/w/chat");
	const { result } = render();

	act(() => result.current.onNewSession());
	expect(store.get(commandMenuOpenAtom)).toBe(false);
	expect(navigate).toHaveBeenLastCalledWith({ to: "/new-session/$cwd", params: { cwd: encodeURIComponent("/w/chat") } });
});

it("starts a new conversation when the new-session shortcut is pressed inside the panel", () => {
	store.set(defaultConversationCwdAtom, "/w/chat");
	render();

	// 面板独占键盘；新建会话键必须由面板自己接住，否则按了没反应。默认绑定即 mod+n。
	press("mod+n");
	expect(store.get(commandMenuOpenAtom)).toBe(false);
	expect(navigate).toHaveBeenLastCalledWith({ to: "/new-session/$cwd", params: { cwd: encodeURIComponent("/w/chat") } });
});

it("slides the selection only for arrow keys, not when the pointer hovers a row", () => {
	store.set(projectsAtom, [
		{ cwd: "/w/a", name: "A", sessionCount: 0, type: "normal" },
		{ cwd: "/w/b", name: "B", sessionCount: 0, type: "normal" },
	]);
	const { result } = render();

	press("arrowdown");
	expect(result.current.suppressSelectionAnimation).toBe(false);
	act(() => result.current.onHoverItem("project:/w/a"));
	expect(result.current.selectedId).toBe("project:/w/a");
	expect(result.current.suppressSelectionAnimation).toBe(true);
});

it("lists recently opened sessions and does not search again when one starts running", () => {
	store.set(recentSessionVisitsAtom, [{ path: "/w/done.jsonl", openedAt: 2 }]);
	sessionSearchState.results = [sessionResult("/w/done.jsonl", "Done")];
	const { result, rerender } = render();
	expect(result.current.groups[0]).toMatchObject({ key: "recentSessions" });
	expect(result.current.groups[0].items.map((item) => item.title)).toEqual(["Done"]);

	// 元数据已缓存：状态变化只换分组与状态，不再为它发起检索（因此不会闪骨架）。
	const requestBefore = sessionSearchCalls.at(-1)?.request.activePaths;
	sessionSearchState.results = [];
	act(() => store.set(runningSessionPathsAtom, new Set(["/w/done.jsonl"])));
	rerender();
	// 请求参数保持同一个引用即没有重开检索。
	expect(sessionSearchCalls.at(-1)?.request.activePaths).toBe(requestBefore);

	// 关掉再打开：缓存已有它，不再为它发起检索。
	act(() => store.set(commandMenuOpenAtom, false));
	act(() => store.set(commandMenuOpenAtom, true));
	rerender();
	expect(sessionSearchCalls.at(-1)?.open).toBe(false);
	expect(result.current.groups[0].key).toBe("activeSessions");
	expect(result.current.groups[0].items.map((item) => [item.title, item.status])).toEqual([["Done", "running"]]);
});

it("shows watched sessions straight from the sidebar without searching", () => {
	store.set(defaultConversationCwdAtom, "/chat");
	store.set(sessionsMapAtom, new Map([["/chat", [{ id: "a", path: "/s/a.jsonl", cwd: "/chat/a", name: "Story", firstMessage: "", modifiedAt: 1 }]]]));
	store.set(recentSessionVisitsAtom, [{ path: "/s/a.jsonl", openedAt: 1 }]);
	const { result } = render();

	expect(sessionSearchCalls.at(-1)?.open).toBe(false);
	expect(result.current.groups[0]).toMatchObject({ key: "recentSessions" });
	expect(result.current.groups[0].items.map((item) => item.title)).toEqual(["Story"]);
});

it("does not search again for a session that a finished search could not find", () => {
	store.set(recentSessionVisitsAtom, [{ path: "/s/gone.jsonl", openedAt: 1 }]);
	sessionSearchState.loading = true;
	const { rerender } = render();
	expect(sessionSearchCalls.at(-1)).toMatchObject({ open: true, request: { activePaths: ["/s/gone.jsonl"] } });

	sessionSearchState.loading = false;
	rerender();
	act(() => store.set(commandMenuOpenAtom, false));
	act(() => store.set(commandMenuOpenAtom, true));
	rerender();
	expect(sessionSearchCalls.at(-1)?.open).toBe(false);
});

it("does no catalog work while closed but keeps the last results for the closing fade", () => {
	store.set(projectsAtom, [{ cwd: "/w/a", name: "A", sessionCount: 0, type: "normal" }]);
	const { result } = render();
	expect(result.current.groups.map((group) => group.key)).toEqual(["projects", "settings"]);

	act(() => store.set(commandMenuOpenAtom, false));
	expect(result.current.groups.map((group) => group.key)).toEqual(["projects", "settings"]);
	// 关着时状态变化不触发会话取数。
	act(() => store.set(runningSessionPathsAtom, new Set(["/w/run.jsonl"])));
	expect(sessionSearchCalls.at(-1)?.open).toBe(false);
});
