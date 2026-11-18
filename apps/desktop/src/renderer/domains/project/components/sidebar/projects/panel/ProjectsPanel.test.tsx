// @vitest-environment jsdom
import {
	batchProjectsAtom,
	defaultConversationCwdAtom,
	projectsAtom,
	projectsInitializedAtom,
	sessionsMapAtom,
} from "@shared/store/atoms";
import project from "@/shared/i18n/locales/en/project.json";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createInstance } from "i18next";
import { createStore, Provider } from "jotai";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectsPanel } from "./ProjectsPanel";

const STORAGE_KEY = "vetta-sidebar-projects-open";
const DEFAULT_CWD = "/test/conversations";
const i18n = createInstance();
await i18n.init({ lng: "en", fallbackLng: "en", resources: { en: { project } } });
const navigate = vi.hoisted(() => vi.fn());
const listSessions = vi.fn(async (cwd: string) => [{
	id: "project-session",
	path: `${cwd}/session.jsonl`,
	cwd,
	firstMessage: "Loaded project session",
	modifiedAt: 1,
}]);
vi.mock("@tanstack/react-router", () => ({
	useMatches: () => [{ pathname: "/", params: {} }],
	useNavigate: () => navigate,
}));

function renderPanel() {
	const store = createStore();
	store.set(projectsAtom, [
		{ cwd: DEFAULT_CWD, type: "normal", isDefault: true, sessionCount: 1 },
		{ cwd: "/test/normal-project", type: "normal", sessionCount: 1 },
		{ cwd: "/test/second-project", type: "normal", sessionCount: 1 },
	]);
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
	return render(
		<I18nextProvider i18n={i18n}>
			<Provider store={store}><ProjectsPanel onOpenSession={vi.fn()} /></Provider>
		</I18nextProvider>,
	);
}

beforeEach(() => {
	navigate.mockClear();
	listSessions.mockClear();
	localStorage.removeItem(STORAGE_KEY);
	vi.stubGlobal("ResizeObserver", class {
		observe() {}
		unobserve() {}
		disconnect() {}
	});
	const subscribe = () => () => {};
	vi.stubGlobal("vetta", {
		agentTeams: { listSidebarConversations: async () => [] },
		batchTasks: { onTaskEvent: subscribe },
		config: { onProjectsChanged: subscribe },
		conversationTags: { list: async () => ({ tags: [], assignments: {} }), onChanged: subscribe },
		im: { onSessionChanged: subscribe },
		session: { onSessionsChanged: subscribe, listSessions },
	});
});

afterEach(() => {
	cleanup();
	localStorage.removeItem(STORAGE_KEY);
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
