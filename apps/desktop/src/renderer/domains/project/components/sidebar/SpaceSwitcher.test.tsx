// @vitest-environment jsdom
import { pendingInteractionPathsAtom } from "@shared/store/pending-interactions-atoms";
import { runningSessionPathsAtom } from "@shared/store/running-sessions-atoms";
import { sessionsMapAtom } from "@shared/store/atoms";
import { INITIAL_SPACES, spacesAtom } from "@shared/store/spaces";
import project from "@/shared/i18n/locales/en/project.json";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createInstance } from "i18next";
import { createStore, Provider } from "jotai";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpaceEditorDialog } from "../SpaceEditorDialog";
import { SpaceSwitcher } from "./SpaceSwitcher";

const i18n = createInstance();
await i18n.init({ lng: "en", fallbackLng: "en", resources: { en: { project } } });

const navigate = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", () => ({
	useLocation: () => "/",
	useNavigate: () => navigate,
}));

/** 按钮组量到的宽度；每格 32px，按钮组自身左右各 2px 内边距。 */
let availableWidth = 180;

beforeEach(() => {
	navigate.mockClear();
	localStorage.removeItem("vetta.desktop-spaces.v1");
	vi.stubGlobal("ResizeObserver", class {
		constructor(private readonly callback: (entries: { contentRect: { width: number } }[]) => void) {}
		observe() {
			this.callback([{ contentRect: { width: availableWidth } }]);
		}
		unobserve() {}
		disconnect() {}
	});
	const subscribe = () => () => {};
	vi.stubGlobal("vetta", {
		config: {
			get: async () => ({ projects: [], shortcuts: { bindings: {} } }),
			set: async () => {},
			onShortcutsChanged: subscribe,
		},
		agentTeams: { listSessions: async () => [] },
		session: { listSessions: async () => [] },
	});
});

afterEach(() => {
	cleanup();
	localStorage.removeItem("vetta.desktop-spaces.v1");
	vi.unstubAllGlobals();
});

/** 挂上切换器与它要打开的新建/编辑对话框，并铺好 `spaceCount` 个自定义工作空间。 */
function renderSwitcher(
	spaceCount: number,
	width: number,
	activity: { running?: string[]; waiting?: Record<string, number> } = {},
) {
	availableWidth = width;
	const store = createStore();
	store.set(spacesAtom, {
		...INITIAL_SPACES,
		spaces: Array.from({ length: spaceCount }, (_, index) => ({
			id: `space-${index}`,
			name: `Space ${index + 1}`,
			icon: { kind: "solar" as const, value: "star" as const },
		})),
	});
	store.set(runningSessionPathsAtom, new Set(activity.running ?? []));
	store.set(pendingInteractionPathsAtom, new Map(Object.entries(activity.waiting ?? {})));
	render(
		<I18nextProvider i18n={i18n}>
			<Provider store={store}>
				<SpaceSwitcher />
				<SpaceEditorDialog />
			</Provider>
		</I18nextProvider>,
	);
	return { store, group: screen.getByRole("group", { name: "Workspaces" }) };
}

function groupLabels(group: HTMLElement): (string | null)[] {
	return within(group)
		.getAllByRole("button")
		.map((button) => button.getAttribute("aria-label"));
}

describe("SpaceSwitcher 新建工作空间", () => {
	it("放得下时按钮组最右侧是加号、没有更多按钮；点击加号新建，保存后新工作空间直接占一格", async () => {
		const user = userEvent.setup();
		const { store, group } = renderSwitcher(1, 180);
		expect(groupLabels(group)).toEqual(["Main workspace", "Space 1", "New workspace"]);

		await user.click(within(group).getByRole("button", { name: "New workspace" }));
		const dialog = await screen.findByRole("dialog");
		expect(within(dialog).getByText("New workspace")).toBeTruthy();

		await user.type(within(dialog).getByLabelText("Workspace name"), "Writing");
		await user.click(within(dialog).getByRole("button", { name: "Save" }));

		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(store.get(spacesAtom).spaces.map((space) => space.name)).toEqual(["Space 1", "Writing"]);
		expect(groupLabels(group)).toEqual(["Main workspace", "Space 1", "Writing", "New workspace"]);
	});

	it("工作空间多到放不下时只留更多按钮，加号收进它的列表里，与设置同排且都只有图标", async () => {
		const user = userEvent.setup();
		const { group } = renderSwitcher(2, 68);
		// 溢出时「更多」独占末格，新建不在按钮组里。
		expect(groupLabels(group)).toEqual(["Main workspace", "More workspaces"]);

		await user.click(within(group).getByRole("button", { name: "More workspaces" }));
		const popover = await screen.findByRole("dialog");
		const add = within(popover).getByRole("button", { name: "New workspace" });
		const settings = within(popover).getByRole("button", { name: "Workspace settings" });

		expect(add.parentElement).toBe(settings.parentElement);
		for (const button of [add, settings]) {
			expect(button.className).toContain("flex-1");
			expect(button.className).toContain("bg-secondary");
			expect(button.textContent).toBe("");
		}
		// 列表与底部操作之间靠留白，不画分隔线。
		expect(popover.innerHTML).not.toContain("bg-border");

		await user.click(add);
		await waitFor(() => expect(document.querySelector('[data-slot="popover-content"]')).toBeNull());
		const editor = await screen.findByRole("dialog");
		expect(within(editor).getByLabelText("Workspace name")).toBeTruthy();
	});

	it("加号自带的是不带外圈的加号图标", () => {
		const { group } = renderSwitcher(1, 180);
		const add = within(group).getByRole("button", { name: "New workspace" });
		expect(add.innerHTML).toContain("solar--add-linear");
		expect(add.innerHTML).not.toContain("add-circle");
	});

	it("溢出时列表底部的设置按钮仍然跳到工作空间设置", async () => {
		const user = userEvent.setup();
		const { group } = renderSwitcher(2, 68);

		await user.click(within(group).getByRole("button", { name: "More workspaces" }));
		const popover = await screen.findByRole("dialog");
		await user.click(within(popover).getByRole("button", { name: "Workspace settings" }));

		expect(navigate).toHaveBeenLastCalledWith({ to: "/settings/$tab", params: { tab: "spaces" } });
	});
});

describe("SpaceSwitcher 工作空间状态", () => {
	const sessionOf = (cwd: string): string => `${cwd}/.vetta/sessions/a.jsonl`;
	/** 让会话能按 cwd 归因到某个空间：会话进 sessionsMap，cwd 登记为该空间的项目。 */
	const placeSession = (store: ReturnType<typeof createStore>, cwd: string, spaceId: string): string => {
		const path = sessionOf(cwd);
		store.set(
			sessionsMapAtom,
			new Map([
				[
					cwd,
					[{ id: "a", path, cwd, firstMessage: "hi", modifiedAt: 1 }],
				],
			]),
		);
		store.set(spacesAtom, (state) => ({ ...state, projects: { ...state.projects, [cwd]: spaceId } }));
		return path;
	};

	it("空间内有会话在跑时给该格点运行灯，并在名称后带数量", async () => {
		const { store, group } = renderSwitcher(1, 180, { running: [sessionOf("/test/space-0")] });
		placeSession(store, "/test/space-0", "space-0");

		const cell = within(group).getByRole("button", { name: /Space 1/ });
		await waitFor(() => expect(cell.getAttribute("aria-label")).toBe("Space 1 · 1 running"));
		expect(cell.querySelector(".project-running-ping")).not.toBeNull();
	});

	it("有人在等时换成琥珀色问号，且不再同时显示运行灯", async () => {
		const path = sessionOf("/test/space-0");
		const { store, group } = renderSwitcher(1, 180, {
			running: [path],
			waiting: { [path]: 1 },
		});
		placeSession(store, "/test/space-0", "space-0");

		const cell = await within(group).findByRole("button", { name: /Space 1/ });
		expect(cell.getAttribute("aria-label")).toBe("Space 1 · 1 waiting for you");
		expect(cell.querySelector(".project-running-ping")).toBeNull();
		expect(cell.innerHTML).toContain("bg-amber-500");
	});

	it("被收纳的空间有状态时「更多」按钮也点灯，展开后的行里同样带角标", async () => {
		const user = userEvent.setup();
		const path = sessionOf("/test/space-1");
		const { store, group } = renderSwitcher(2, 68, { waiting: { [path]: 1 } });
		placeSession(store, "/test/space-1", "space-1");

		const more = await within(group).findByRole("button", { name: /More workspaces/ });
		await waitFor(() => expect(more.getAttribute("aria-label")).toBe("More workspaces · 1 waiting for you"));
		expect(more.innerHTML).toContain("bg-amber-500");

		await user.click(more);
		const popover = await screen.findByRole("dialog");
		const row = within(popover).getByRole("button", { name: "Space 2 · 1 waiting for you" });
		expect(row.innerHTML).toContain("bg-amber-500");
	});

	it("没有任何运行或等待的空间不显示状态角标", async () => {
		const { group } = renderSwitcher(1, 180);
		const cell = within(group).getByRole("button", { name: "Space 1" });
		expect(cell.querySelector(".project-running-ping")).toBeNull();
		expect(cell.innerHTML).not.toContain("bg-amber-500");
	});
});
