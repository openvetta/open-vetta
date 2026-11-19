// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	activityPanelOpenAtom,
	attachedPluginTabsAtom,
	floatingActivityTabsByProjectAtom,
	pluginActivityTabsAtom,
	type RegisteredActivityTab,
} from "@shared/store/atoms";
import { createActivityWorkspace } from "@shared/workspace/activity-workspace";
import { DOCKED_CONTENT_FALLBACK_MS } from "../hooks/useDockedContentReady";
import { ActivityPanel } from "./ActivityPanel";

vi.mock("motion/react", () => {
	const motion = new Proxy(
		{},
		{
			get:
				() =>
				({ children }: { children: ReactNode }) => <div>{children}</div>,
		},
	);
	return {
		AnimatePresence: ({ children }: { children: ReactNode }) => children,
		LayoutGroup: ({ children }: { children: ReactNode }) => children,
		motion,
		useReducedMotion: () => true,
	};
});

// The file tab owns a live fs watcher; this suite only cares about tab resolution.
vi.mock("./file-tab/FileTabContent", () => ({
	FileTabContent: () => <div>file body</div>,
}));

class NoopResizeObserver {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
}

beforeEach(() => {
	vi.stubGlobal("ResizeObserver", NoopResizeObserver);
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

function endTransition(element: Element | null | undefined, propertyName: string): void {
	if (!element) throw new Error("Missing transition target");
	const event = new Event("transitionend", { bubbles: true });
	Object.defineProperty(event, "propertyName", { value: propertyName });
	act(() => element.dispatchEvent(event));
}

function pluginTab(): RegisteredActivityTab {
	return {
		pluginId: "demo",
		pluginName: "Demo",
		tabId: "panel",
		label: "Demo panel",
		component: () => <div>demo body</div>,
		scope_use: ["conversation"],
	};
}

const workspace = createActivityWorkspace("agent-team:workspace", "/tmp/team-cwd", ["member-runtime"]);

function renderPanel(scenario: "conversation" | undefined, open = true) {
	const store = createStore();
	store.set(activityPanelOpenAtom, open);
	store.set(pluginActivityTabsAtom, [pluginTab()]);
	render(
		<Provider store={store}>
			<ActivityPanel
				workspace={workspace}
				{...(scenario ? { pluginScenario: scenario } : {})}
			/>
		</Provider>,
	);
	return store;
}

describe("activity panel plugin tabs outside the ordinary conversation host", () => {
	// A Team session never drives the global scenario atom, so the host must hand the
	// panel its own scenario; without it plugin contributions fail closed and the bar
	// collapses to the builtin tabs only.
	it("puts a registered plugin tab on the bar when the host supplies its scenario", () => {
		renderPanel("conversation");
		expect(screen.queryByText("Demo panel")).not.toBeNull();
	});

	it("keeps plugin tabs off the bar when the host supplies no scenario", () => {
		renderPanel(undefined);
		expect(screen.queryByText("Demo panel")).toBeNull();
	});

	it("does not mount the docked tab bar or docked content while closed", () => {
		vi.useFakeTimers();
		const store = renderPanel("conversation", false);

		expect(screen.queryByText("Demo panel")).toBeNull();
		expect(screen.queryByText("file body")).toBeNull();

		// The shell and tab bar are available immediately. Let expensive tab content
		// mount once the entrance is finished.
		act(() => store.set(activityPanelOpenAtom, true));
		expect(screen.queryByText("Demo panel")).not.toBeNull();
		expect(screen.queryByText("file body")).toBeNull();

		act(() => vi.advanceTimersByTime(DOCKED_CONTENT_FALLBACK_MS));
		expect(screen.queryByText("file body")).not.toBeNull();
	});

	it("commits the dock width immediately and mounts content on the surface's slide end", () => {
		vi.useFakeTimers();
		const store = renderPanel("conversation", false);
		const aside = document.querySelector("aside");
		const surface = aside?.querySelector<HTMLDivElement>(":scope > div");
		expect(aside?.style.width).toBe("0px");
		expect(aside?.getAttribute("data-activity-panel-dock")).toBe("closed");
		expect(surface?.style.transform).toBe("translateX(100%)");
		expect(surface?.hasAttribute("inert")).toBe(true);

		act(() => store.set(activityPanelOpenAtom, true));
		expect(Number.parseFloat(aside?.style.width ?? "")).toBeGreaterThan(0);
		expect(aside?.getAttribute("data-activity-panel-dock")).toBe("open");
		expect(aside?.style.transition).toBe("");
		expect(surface?.style.transform).toBe("none");
		expect(surface?.hasAttribute("inert")).toBe(false);
		expect(screen.queryByText("Demo panel")).not.toBeNull();
		expect(screen.queryByText("file body")).toBeNull();

		endTransition(aside, "width");
		endTransition(surface, "opacity");
		endTransition(surface?.firstElementChild, "transform");
		expect(screen.queryByText("file body")).toBeNull();

		endTransition(surface, "transform");
		expect(screen.queryByText("file body")).not.toBeNull();

		act(() => store.set(activityPanelOpenAtom, false));
		expect(aside?.style.width).toBe("0px");
		expect(aside?.getAttribute("data-activity-panel-dock")).toBe("closed");
		expect(surface?.hasAttribute("inert")).toBe(true);
		expect(screen.queryByText("file body")).toBeNull();
	});

	it("waits for the new entrance after a quick close and reopen", () => {
		vi.useFakeTimers();
		const store = renderPanel("conversation", false);
		act(() => store.set(activityPanelOpenAtom, true));
		const halfDelay = DOCKED_CONTENT_FALLBACK_MS / 2;
		act(() => vi.advanceTimersByTime(halfDelay));
		act(() => store.set(activityPanelOpenAtom, false));
		act(() => store.set(activityPanelOpenAtom, true));

		act(() => vi.advanceTimersByTime(halfDelay));
		expect(screen.queryByText("file body")).toBeNull();
		endTransition(document.querySelector("aside")?.firstElementChild, "transform");
		expect(screen.queryByText("file body")).not.toBeNull();
	});

	it("mounts content on open when reduced motion skips the desktop slide", () => {
		vi.stubGlobal("matchMedia", (query: string) => ({
			matches: query === "(prefers-reduced-motion: reduce)",
		}));
		const store = renderPanel("conversation", false);
		act(() => store.set(activityPanelOpenAtom, true));
		expect(screen.queryByText("file body")).not.toBeNull();
	});

	it("mounts docked content immediately when the panel is already open on first render", () => {
		renderPanel("conversation", true);
		expect(screen.queryByText("file body")).not.toBeNull();
	});

	// 「+」可添加池里的 tab 靠上栏记录决定去留；贡献方按工作空间声明 pinned 后，
	// 记录（包括用户早先按过的减号）不再参与，标签卡必须回栏。
	it("pins a workspace-scoped plugin tab on the bar even after it was detached", () => {
		const store = createStore();
		store.set(activityPanelOpenAtom, true);
		store.set(attachedPluginTabsAtom, new Map([[workspace.id, ["-demo:panel"]]]));
		store.set(pluginActivityTabsAtom, [
			{
				...pluginTab(),
				initiallyVisible: false,
				useMeta: ({ cwd }) => (cwd === workspace.cwd ? { pinned: true } : null),
			},
		]);

		render(
			<Provider store={store}>
				<ActivityPanel workspace={workspace} pluginScenario="conversation" />
			</Provider>,
		);

		expect(screen.queryByText("Demo panel")).not.toBeNull();
	});

	it("hides the tab when the contribution reports the workspace is not a repository", () => {
		const store = createStore();
		store.set(activityPanelOpenAtom, true);
		store.set(pluginActivityTabsAtom, [{ ...pluginTab(), initiallyVisible: false, useMeta: () => null }]);

		render(
			<Provider store={store}>
				<ActivityPanel workspace={workspace} pluginScenario="conversation" />
			</Provider>,
		);

		expect(screen.queryByText("Demo panel")).toBeNull();
	});

	// 新会话页与项目详情页显式下发「即将建出 / 所属项目」的场景：项目作用域的插件 tab
	// （Git 就是这样声明的）在这些页面上必须与建会话后一致地出现。
	it("puts a project-scoped plugin tab on the bar when the host supplies the project scenario", () => {
		const store = createStore();
		store.set(activityPanelOpenAtom, true);
		store.set(pluginActivityTabsAtom, [{ ...pluginTab(), scope_use: ["project"] }]);

		render(
			<Provider store={store}>
				<ActivityPanel workspace={workspace} pluginScenario="project" />
			</Provider>,
		);

		expect(screen.queryByText("Demo panel")).not.toBeNull();
	});

	it("keeps floating tab content mounted while the docked panel is closed", () => {

		const store = createStore();
		store.set(activityPanelOpenAtom, false);
		store.set(floatingActivityTabsByProjectAtom, new Map([
			[
				workspace.id,
				[{ key: "file", x: 20, y: 20, width: 480, height: 360, zIndex: 1 }],
			],
		]));

		render(
			<Provider store={store}>
				<ActivityPanel workspace={workspace} pluginScenario="conversation" />
			</Provider>,
		);

		expect(screen.queryByText("file body")).not.toBeNull();
	});
});
