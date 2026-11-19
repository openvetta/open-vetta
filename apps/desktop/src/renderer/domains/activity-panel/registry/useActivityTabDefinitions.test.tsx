// @vitest-environment jsdom

import { createActivityWorkspace } from "@shared/workspace/activity-workspace";
import type { RegisteredActivityTab } from "@shared/store/atoms";
import { renderHook } from "@testing-library/react";
import { type ReactNode, createElement } from "react";
import { describe, expect, it } from "vitest";
import { ActivityPanelContextProvider } from "./context";
import { toPluginDefinition } from "./useActivityTabDefinitions";

describe("plugin activity tab definitions", () => {
	it("preserves retention and legacy lifecycle declarations", () => {
		const tab: RegisteredActivityTab = {
			pluginId: "remotion-renderer",
			pluginName: "Remotion",
			tabId: "studio",
			label: "Studio",
			component: () => null,
			scope_use: ["project"],
			retention: "warm",
			keepAliveWhenAvailable: true,
		};

		const definition = toPluginDefinition(tab, (_pluginId, text) => text);

		expect(definition.retention).toBe("warm");
		expect(definition.keepAliveWhenAvailable).toBe(true);
	});

	// 插件按「当前面板工作空间」自报 meta（Git 面板据此判断目录是不是仓库）：
	// useMeta 必须拿到面板 cwd，而不是会话 cwd 或全局前台状态。
	it("gives the contribution's useMeta the panel workspace cwd", () => {
		const seen: Array<string | null> = [];
		const tab: RegisteredActivityTab = {
			pluginId: "git",
			pluginName: "Git",
			tabId: "changes",
			label: "Changes",
			component: () => null,
			scope_use: ["project"],
			initiallyVisible: false,
			useMeta: ({ cwd }) => {
				seen.push(cwd);
				return cwd === "/repo" ? { pinned: true } : null;
			},
		};
		const definition = toPluginDefinition(tab, (_pluginId, text) => text);

		const wrapper = ({ children }: { children: ReactNode }) =>
			createElement(ActivityPanelContextProvider, {
				value: { workspace: createActivityWorkspace("/repo", "/repo"), knowledgeHistory: false },
				children,
			});

		const { result } = renderHook(() => definition.useMeta(), { wrapper });

		expect(seen).toEqual(["/repo"]);
		expect(result.current).toMatchObject({ label: "Changes", pinned: true });
	});

	it("drops the tab when the contribution says it is unavailable for this workspace", () => {
		const tab: RegisteredActivityTab = {
			pluginId: "git",
			pluginName: "Git",
			tabId: "changes",
			label: "Changes",
			component: () => null,
			scope_use: ["project"],
			useMeta: () => null,
		};
		const definition = toPluginDefinition(tab, (_pluginId, text) => text);
		const wrapper = ({ children }: { children: ReactNode }) =>
			createElement(ActivityPanelContextProvider, {
				value: { workspace: createActivityWorkspace("/plain", "/plain"), knowledgeHistory: false },
				children,
			});

		const { result } = renderHook(() => definition.useMeta(), { wrapper });

		expect(result.current).toBeNull();
	});
});
