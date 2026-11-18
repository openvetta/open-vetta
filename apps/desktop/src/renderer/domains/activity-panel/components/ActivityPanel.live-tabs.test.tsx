// @vitest-environment jsdom

import {
	activityPanelOpenAtom,
	hiddenActivityTabsAtom,
	openUrlInActivityWorkspaceAtom,
	planModeStateBySessionAtom,
	todoItemsBySessionAtom,
} from "@shared/store/atoms";
import { createActivityWorkspace } from "@shared/workspace/activity-workspace";
import { act, cleanup, render, screen } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityPanel } from "./ActivityPanel";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("motion/react", () => {
	const motion = new Proxy({}, { get: () => ({ children }: { children: ReactNode }) => <div>{children}</div> });
	return {
		AnimatePresence: ({ children }: { children: ReactNode }) => children,
		LayoutGroup: ({ children }: { children: ReactNode }) => children,
		motion,
		useReducedMotion: () => true,
	};
});
vi.mock("./file-tab/FileTabContent", () => ({ FileTabContent: () => <div>file body</div> }));

class NoopResizeObserver {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
}

beforeEach(() => vi.stubGlobal("ResizeObserver", NoopResizeObserver));
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("activity panel tabs driven by live session state", () => {
	// 工作区对象在一次会话里是稳定的：tab 的出现只能靠各自的数据变化驱动，不能指望面板被外部重渲。
	const workspace = createActivityWorkspace("/work/project", "/work/project", ["runtime-1"]);

	it("adds the todo and plan tabs as soon as the running session produces them", () => {
		const store = createStore();
		store.set(activityPanelOpenAtom, true);
		render(
			<Provider store={store}>
				<ActivityPanel workspace={workspace} pluginScenario="project" />
			</Provider>,
		);
		expect(screen.queryByText("activityPanel.tabs.todo")).toBeNull();
		expect(screen.queryByText("activityPanel.tabs.plan")).toBeNull();

		act(() => {
			store.set(todoItemsBySessionAtom, new Map([["runtime-1", [{ id: 1, content: "Ship", status: "pending" }]]]));
			store.set(planModeStateBySessionAtom, {
				"runtime-1": { permissionMode: "default", plan: { content: "1. Ship", status: "approved", updatedAt: "t" } },
			});
		});
		expect(screen.queryByText("activityPanel.tabs.todo")).not.toBeNull();
		expect(screen.queryByText("activityPanel.tabs.plan")).not.toBeNull();

		act(() => store.set(todoItemsBySessionAtom, new Map()));
		expect(screen.queryByText("activityPanel.tabs.todo")).toBeNull();
		expect(screen.queryByText("activityPanel.tabs.plan")).not.toBeNull();
	});

	// 浏览器是常驻页签：即便还没有地址，栏上也要有入口，用户才能手输地址把浏览器打开。
	it("keeps the browser tab on the bar without a page", () => {
		const store = createStore();
		store.set(activityPanelOpenAtom, true);
		render(
			<Provider store={store}>
				<ActivityPanel workspace={workspace} pluginScenario="project" />
			</Provider>,
		);
		expect(screen.queryByText("browser.tab")).not.toBeNull();
	});

	// 用户把浏览器页签关掉后，点消息里的链接必须能把它带回来。
	it("brings a closed browser tab back when a link is opened", () => {
		const store = createStore();
		store.set(activityPanelOpenAtom, true);
		store.set(hiddenActivityTabsAtom, new Map([["/work/project", ["browser"]]]));
		render(
			<Provider store={store}>
				<ActivityPanel workspace={workspace} pluginScenario="project" />
			</Provider>,
		);
		expect(screen.queryAllByText("browser.tab")).toHaveLength(0);

		act(() => {
			store.set(openUrlInActivityWorkspaceAtom, { workspaceId: "/work/project", url: "https://example.com/a" });
		});
		expect(screen.queryAllByText("browser.tab").length).toBeGreaterThan(0);
	});

	// 端口只有「远端」才有。本机项目下这个 tab 不该占位，远程项目下它必须在——它同时是
	// 手动添加端口的唯一入口，没有转发时也要能进去。
	it("shows the ports tab for a remote project only", async () => {
		vi.stubGlobal(
			"window",
			Object.assign(globalThis.window, {
				vetta: {
					ssh: { listPortForwards: async () => [], onPortForwardsChanged: () => () => {} },
				},
			}),
		);
		const store = createStore();
		store.set(activityPanelOpenAtom, true);
		render(
			<Provider store={store}>
				<ActivityPanel workspace={workspace} pluginScenario="project" />
			</Provider>,
		);
		expect(screen.queryByText("activityPanel.tabs.ports")).toBeNull();
		cleanup();

		const remoteCwd = "ssh://host-1/home/me/app";
		render(
			<Provider store={store}>
				<ActivityPanel
					workspace={createActivityWorkspace(remoteCwd, remoteCwd, ["runtime-1"])}
					pluginScenario="project"
				/>
			</Provider>,
		);
		expect(await screen.findByText("activityPanel.tabs.ports")).toBeTruthy();
	});
});
