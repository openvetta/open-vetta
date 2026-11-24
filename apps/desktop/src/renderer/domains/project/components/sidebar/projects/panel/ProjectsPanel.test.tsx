// @vitest-environment jsdom
import { INITIAL_SPACES, spacesAtom } from "@shared/store/spaces";
import { SpaceSwitcher } from "../../SpaceSwitcher";
import {
	batchProjectsAtom,
	defaultConversationCwdAtom,
	projectsAtom,
	projectsInitializedAtom,
	sessionsMapAtom,
} from "@shared/store/atoms";
import { pendingInteractionPathsAtom } from "@shared/store/pending-interactions-atoms";
import { runningSessionPathsAtom } from "@shared/store/running-sessions-atoms";
import project from "@/shared/i18n/locales/en/project.json";
import { shortcutParts } from "@shared/lib/platform";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createInstance } from "i18next";
import { createStore, Provider } from "jotai";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectsPanel } from "./ProjectsPanel";

const STORAGE_KEY = "vetta-sidebar-projects-open";
const DEFAULT_CWD = "/test/conversations";
const i18n = createInstance();
await i18n.init({ lng: "en", fallbackLng: "en", resources: { en: { project } } });
const routedPath = vi.hoisted(() => ({ value: "/settings/spaces" }));
const navigate = vi.hoisted(() => vi.fn((route?: { to: string }) => { if (route) routedPath.value = route.to; }));
const listSessions = vi.fn(async (cwd: string) => [{
	id: "project-session",
	path: `${cwd}/session.jsonl`,
	cwd,
	firstMessage: "Loaded project session",
	modifiedAt: 1,
}]);
vi.mock("@tanstack/react-router", () => ({
	useLocation: () => routedPath.value,
	useMatches: () => [{ pathname: "/", params: {} }],
	useNavigate: () => navigate,
}));

let availableSidebarWidth: number | undefined;

function renderPanel(withSpaces = false, extraSpaces = false, extraSpaceCount = 0) {
	const store = createStore();
	store.set(projectsAtom, [
		{ cwd: DEFAULT_CWD, type: "normal", isDefault: true, sessionCount: 1 },
		{ cwd: "/test/normal-project", type: "normal", sessionCount: 1 },
		{ cwd: "/test/second-project", type: "normal", sessionCount: 1 },
	]);
	if (withSpaces) store.set(spacesAtom, {
		...INITIAL_SPACES,
		spaces: [
			{ id: "work", name: "Work", icon: { kind: "solar", value: "code" } },
			...(extraSpaces ? [{ id: "personal", name: "Personal", icon: { kind: "emoji" as const, value: "🏠" } }] : []),
			...Array.from({ length: extraSpaceCount }, (_, index) => ({
				id: `extra-${index}`,
				name: `Extra ${index + 1}`,
				icon: { kind: "solar" as const, value: "star" as const },
			})),
		],
		projects: { "/test/normal-project": "work" },
		conversations: { [`${DEFAULT_CWD}/chat.jsonl`]: "work" },
		locations: { work: { kind: "project", cwd: "/test/normal-project" } },
	});
	store.set(projectsInitializedAtom, true);
	store.set(defaultConversationCwdAtom, DEFAULT_CWD);
	store.set(sessionsMapAtom, new Map([[DEFAULT_CWD, [{
		id: "chat",
		path: `${DEFAULT_CWD}/chat.jsonl`,
		cwd: DEFAULT_CWD,
		firstMessage: "Existing conversation",
		modifiedAt: 1,
	}]]]));
	store.set(batchProjectsAtom, [{
		id: "batch-1",
		name: "My batch project",
		prompt: "",
		concurrency: 1,
		createdAt: 1,
		updatedAt: 1,
		tasks: [{
			id: "task-1",
			name: "Task",
			cwd: "/test/task",
			sourcePath: "/test/task/input",
			status: "completed",
			sessionPath: "/test/task/session.jsonl",
			createdAt: 1,
			updatedAt: 1,
		}],
	}]);
	return {
		...render(
			<I18nextProvider i18n={i18n}>
				<Provider store={store}>{withSpaces && <SpaceSwitcher />}<ProjectsPanel onOpenSession={vi.fn()} /></Provider>
			</I18nextProvider>,
		),
		store,
	};
}

beforeEach(() => {
	navigate.mockClear();
	routedPath.value = "/settings/spaces";
	listSessions.mockClear();
	localStorage.removeItem(STORAGE_KEY);
	localStorage.removeItem("vetta.desktop-spaces.v1");
	availableSidebarWidth = undefined;
	vi.stubGlobal("ResizeObserver", class {
		constructor(private readonly callback: (entries: { contentRect: { width: number } }[]) => void) {}
		observe() {
			if (availableSidebarWidth !== undefined) this.callback([{ contentRect: { width: availableSidebarWidth } }]);
		}
		unobserve() {}
		disconnect() {}
	});
	const subscribe = () => () => {};
	vi.stubGlobal("vetta", {
		agentTeams: { listSidebarConversations: async () => [] },
		batchTasks: { onTaskEvent: subscribe },
		config: {
			onProjectsChanged: subscribe,
			onShortcutsChanged: subscribe,
			get: async () => ({ projects: [{ path: "/test/normal-project" }] }),
		},
		conversationTags: { list: async () => ({ tags: [], assignments: {} }), onChanged: subscribe },
		im: { onSessionChanged: subscribe },
		session: { onSessionsChanged: subscribe, listSessions },
	});
});

afterEach(() => {
	cleanup();
	localStorage.removeItem(STORAGE_KEY);
	localStorage.removeItem("vetta.desktop-spaces.v1");
	vi.unstubAllGlobals();
});

describe("ProjectsPanel project disclosure", () => {
	it("reflects the first project expansion before reading history and navigates when clicking the label", async () => {
		renderPanel();
		await screen.findByRole("button", { name: "Existing conversation" });
		const nextFrames: FrameRequestCallback[] = [];
		vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => nextFrames.push(callback));
		const advanceFrame = () => {
			for (const callback of nextFrames.splice(0)) callback(performance.now());
		};
		const toggle = (expanded: boolean) => screen.getByRole("button", { name: "normal-project", expanded });

		fireEvent.click(toggle(false));
		expect(toggle(true).getAttribute("aria-busy")).toBe("true");
		expect(listSessions).not.toHaveBeenCalled();
		expect(navigate).not.toHaveBeenCalled();
		await act(async () => {
			advanceFrame();
			advanceFrame();
		});
		expect(await screen.findByRole("button", { name: "Loaded project session" })).toBeDefined();

		expect(toggle(true).getAttribute("aria-busy")).toBe("false");
		fireEvent.click(toggle(true));
		expect(screen.queryByRole("button", { name: "Loaded project session" })).toBeNull();
		fireEvent.click(screen.getByText("second-project", { selector: "button" }));
		expect(screen.getByRole("button", { name: "second-project", expanded: true })).toBeDefined();
		expect(navigate).toHaveBeenCalledWith({ to: "/project/$cwd", params: { cwd: "%2Ftest%2Fsecond-project" } });
		expect(listSessions).not.toHaveBeenCalledWith("/test/second-project");
		await act(async () => {
			advanceFrame();
			advanceFrame();
		});
		expect(listSessions).toHaveBeenCalledWith("/test/second-project");
		expect(await screen.findByRole("button", { name: "Loaded project session" })).toBeDefined();
	});
	it("defaults to expanded when the stored value is not a boolean", async () => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify("false"));
		renderPanel();
		await screen.findByRole("button", { name: "Existing conversation" });
		expect(screen.getByRole("button", { name: "Projects" }).getAttribute("aria-expanded")).toBe("true");
	});

	it("keeps the conversation filter usable when the projects are collapsed", async () => {
		localStorage.setItem(STORAGE_KEY, "false");
		renderPanel();
		await screen.findByRole("button", { name: "Existing conversation" });
		const filter = screen.getByRole("button", { name: "Chat", expanded: false });
		expect(filter.querySelector('[aria-hidden="true"]')?.classList).toContain("icon-[solar--alt-arrow-right-linear]");
		fireEvent.click(filter);
		expect(screen.getByRole("dialog")).toBeDefined();
		expect(filter.getAttribute("aria-expanded")).toBe("true");
		expect(filter.querySelector('[aria-hidden="true"]')?.classList).toContain("icon-[solar--alt-arrow-down-linear]");
		expect(screen.getByRole("button", { name: "Projects", expanded: false })).toBeDefined();
		fireEvent.click(screen.getByRole("button", { name: "Claw" }));
		expect(screen.queryByRole("dialog")).toBeNull();
		expect(screen.getByRole("button", { name: "Claw", expanded: false })).toBe(filter);
		expect(screen.getByRole("button", { name: "Projects" }).getAttribute("aria-expanded")).toBe("false");
	});

	it("shows both project types by default, keeps conversations accessible, and restores both saved states", async () => {
		const first = renderPanel();
		const trigger = () => screen.getByRole("button", { name: "Projects" });
		const normal = () => screen.queryByRole("button", { name: "normal-project", expanded: false });
		const batch = () => screen.queryByRole("button", { name: "My batch project", expanded: false });
		const arrow = () => trigger().querySelector('[aria-hidden="true"]');
		await screen.findByRole("button", { name: "Existing conversation" });
		expect(arrow()?.classList.contains("icon-[solar--alt-arrow-down-linear]")).toBe(true);
		expect(trigger().getAttribute("aria-expanded")).toBe("true");
		expect(normal()).not.toBeNull();
		expect(batch()).not.toBeNull();

		const contentId = trigger().getAttribute("aria-controls");
		const content = document.getElementById(contentId ?? "");
		expect(content?.parentElement?.classList.contains("grid-cols-1")).toBe(true);
		normal()?.focus();
		fireEvent.click(trigger());
		expect(document.activeElement).toBe(trigger());
		expect(trigger().getAttribute("aria-expanded")).toBe("false");
		expect(arrow()?.classList.contains("icon-[solar--alt-arrow-right-linear]")).toBe(true);
		expect(content?.hasAttribute("inert")).toBe(true);
		expect(content?.parentElement?.classList.contains("grid-cols-1")).toBe(true);
		expect(normal()).toBeNull();
		expect(batch()).toBeNull();
		const conversation = screen.getByRole("button", { name: "Existing conversation" });
		conversation.focus();
		expect(document.activeElement).toBe(conversation);

		first.unmount();
		const second = renderPanel();
		await screen.findByRole("button", { name: "Existing conversation" });
		expect(trigger().getAttribute("aria-expanded")).toBe("false");
		expect(normal()).toBeNull();
		fireEvent.click(trigger());
		expect(normal()).not.toBeNull();
		expect(batch()).not.toBeNull();
		second.unmount();

		renderPanel();
		await screen.findByRole("button", { name: "Existing conversation" });
		expect(trigger().getAttribute("aria-expanded")).toBe("true");
		expect(normal()).not.toBeNull();
	});
});


it("switches project and chat membership together, preserving the global page", async () => {
	renderPanel(true);
	await screen.findByRole("button", { name: "My batch project", expanded: false });
	expect(screen.queryByRole("button", { name: "normal-project", expanded: false })).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: "Work" }));
	await screen.findByRole("button", { name: "Existing conversation" });
	expect(screen.getByRole("button", { name: "normal-project", expanded: false })).toBeDefined();
	expect(screen.queryByRole("button", { name: "My batch project", expanded: false })).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: "Main workspace" }));
	await screen.findByRole("button", { name: "My batch project", expanded: false });
	expect(screen.queryByRole("button", { name: "Existing conversation" })).toBeNull();
	expect(routedPath.value).toBe("/settings/spaces");
});

it("opens an overflow workspace and highlights the grouped trigger in a narrow sidebar", async () => {
	availableSidebarWidth = 68;
	renderPanel(true, true);
	const more = screen.getByRole("button", { name: "More workspaces" });
	expect(screen.queryByRole("button", { name: "Work" })).toBeNull();
	fireEvent.click(more);
	expect(more.getAttribute("aria-expanded")).toBe("true");
	fireEvent.click(await screen.findByRole("button", { name: "Work" }));
	await screen.findByRole("button", { name: "Existing conversation" });
	expect(more.getAttribute("aria-expanded")).toBe("false");
	expect(more.getAttribute("aria-pressed")).toBe("true");
});

it("lists every workspace in the switcher menu with its shortcut and ends with the workspace settings entry", async () => {
	availableSidebarWidth = 68;
	renderPanel(true, false, 9);
	fireEvent.click(screen.getByRole("button", { name: "More workspaces" }));
	const dialog = await screen.findByRole("dialog");
	const rows: Array<[string, number]> = [
		["Main workspace", 1],
		["Work", 2],
		...Array.from({ length: 9 }, (_, index): [string, number] => [`Extra ${index + 1}`, index + 3]),
	];
	for (const [name, position] of rows) {
		const row = within(dialog).getByRole("button", { name });
		const hints = [...row.querySelectorAll("kbd")].map((hint) => hint.textContent);
		if (position <= 9) {
			expect(hints).toEqual(shortcutParts(`ctrl+${position}`));
		} else {
			expect(hints).toEqual([]);
		}
	}

	fireEvent.click(within(dialog).getByRole("button", { name: "Workspace settings" }));
	expect(navigate).toHaveBeenLastCalledWith({ to: "/settings/$tab", params: { tab: "spaces" } });
});

it("restores the last project in the destination workspace and opens a new chat when it has no saved page", async () => {
	routedPath.value = "/new-session/default";
	renderPanel(true);
	fireEvent.click(screen.getByRole("button", { name: "Work" }));
	await waitFor(() => expect(routedPath.value).toBe("/project/$cwd"));
	fireEvent.click(screen.getByRole("button", { name: "Main workspace" }));
	await waitFor(() => expect(routedPath.value).toBe("/new-session/$cwd"));
});

// 回归：agent 提问期间 running 仍为 true，只有 waiting 翻转。列表行曾经因为视图对象
// 被按 path 复用（比较时漏了 waiting）而继续显示旋转图标，必须切换会话才会刷新。
it("flips a session row between running and waiting without reselecting it", async () => {
	const { store } = renderPanel();
	const sessionPath = `${DEFAULT_CWD}/chat.jsonl`;
	const leading = () =>
		screen.getByRole("button", { name: "Existing conversation" }).querySelector(
			"[data-session-leading-icon]",
		);
	await screen.findByRole("button", { name: "Existing conversation" });
	expect(leading()).toBeNull();

	act(() => store.set(runningSessionPathsAtom, new Set([sessionPath])));
	await waitFor(() => expect(leading()?.classList.contains("project-running-icon")).toBe(true));

	act(() => store.set(pendingInteractionPathsAtom, new Map([[sessionPath, 1]])));
	await waitFor(() => expect(leading()?.getAttribute("data-session-waiting")).toBe("true"));

	act(() => store.set(pendingInteractionPathsAtom, new Map()));
	await waitFor(() => expect(leading()?.getAttribute("data-session-waiting")).toBeNull());
	expect(leading()?.classList.contains("project-running-icon")).toBe(true);
});
