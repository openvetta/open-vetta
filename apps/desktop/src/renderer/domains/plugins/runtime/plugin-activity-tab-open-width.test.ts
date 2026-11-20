// @vitest-environment jsdom
import type { InstalledPlugin } from "@preload/api";
import {
	activeSessionAtom,
	activityPanelOpenAtom,
	activityPanelTabByProjectAtom,
	activityPanelWidthAtom,
	activityPanelWidthModeAtom,
	attachedPluginTabsAtom,
	mountedActivityWorkspacesAtom,
} from "@shared/store/atoms";
import type { PluginPermission } from "@vetta-org/plugin-sdk";
import { getDefaultStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PluginLocalContributions } from "./plugin-local-contributions";
import { createPluginUiApi } from "./plugin-ui-context";

const CWD = "/work/project";
const USER_WIDTH = 400;

function createUi(isActivating?: () => boolean) {
	return createPluginUiApi({
		plugin: {
			id: "demo-plugin",
			name: "Demo",
			permissions: ["ui.slot.activity-tab"] as PluginPermission[],
			grantedPermissions: ["ui.slot.activity-tab"] as PluginPermission[],
		} as unknown as InstalledPlugin,
		contributions: new PluginLocalContributions(),
		onChanged: () => {},
		disposers: [],
		agentContributions: { handlers: [] } as never,
		capabilitySessionId: "session-1",
		isActivating,
	});
}

describe("openActivityTab width", () => {
	beforeEach(() => {
		vi.spyOn(console, "info").mockImplementation(() => undefined);
		vi.spyOn(console, "debug").mockImplementation(() => undefined);
		const store = getDefaultStore();
		store.set(activeSessionAtom, { cwd: CWD, runtimeId: "runtime-1", sessionPath: "/sessions/1.jsonl" });
		store.set(attachedPluginTabsAtom, new Map([[CWD, ["demo-plugin:canvas"]]]));
		store.set(activityPanelTabByProjectAtom, new Map());
		store.set(mountedActivityWorkspacesAtom, []);
		store.set(activityPanelOpenAtom, false);
		store.set(activityPanelWidthAtom, USER_WIDTH);
	});

	// 标签卡早已 attach（插件先 setActivityTabVisible 亮出来）时，翻开关着的面板也要认
	// 宽度，否则面板按旧宽度滑完再被插件拉宽一截。
	it("把关着的面板翻开时采用请求的宽度，且宽度先于打开写入", () => {
		const store = getDefaultStore();
		let modeWhenOpened: unknown = null;
		const unsubscribe = store.sub(activityPanelOpenAtom, () => {
			modeWhenOpened = store.get(activityPanelWidthModeAtom);
		});

		createUi().openActivityTab("canvas", { width: "max" });
		unsubscribe();

		expect(store.get(activityPanelOpenAtom)).toBe(true);
		expect(store.get(activityPanelWidthModeAtom)).toEqual({ kind: "max" });
		expect(modeWhenOpened).toEqual({ kind: "max" });
	});

	it("面板已经开着时只切标签卡，保留用户拖出的宽度", () => {
		const store = getDefaultStore();
		store.set(activityPanelOpenAtom, true);

		createUi().openActivityTab("canvas", { width: "max" });

		expect(store.get(activityPanelWidthModeAtom)).toEqual({ kind: "fixed", px: USER_WIDTH });
	});

	// activate 里的调用随每次启动/热更新重放，不能把用户的宽度冲回初始值。
	it("activate 期间的重放不改宽度", () => {
		const store = getDefaultStore();

		createUi(() => true).openActivityTab("canvas", { width: 420 });

		expect(store.get(activityPanelOpenAtom)).toBe(true);
		expect(store.get(activityPanelWidthModeAtom)).toEqual({ kind: "fixed", px: USER_WIDTH });
	});

	it("首次 attach 照旧采用宽度，activate 期间也一样", () => {
		const store = getDefaultStore();
		store.set(attachedPluginTabsAtom, new Map());
		store.set(activityPanelOpenAtom, true);

		createUi(() => true).openActivityTab("canvas", { width: "max" });

		expect(store.get(activityPanelWidthModeAtom)).toEqual({ kind: "max" });
	});
});
