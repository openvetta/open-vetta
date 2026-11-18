// @vitest-environment jsdom

import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import { activityPanelOpenAtom, activityPanelTabByProjectAtom, hiddenActivityTabsAtom } from "./activity-atoms";
import { browserUrlByWorkspaceAtom, openUrlInActivityWorkspaceAtom } from "./browser-atoms";

describe("workspace browser state", () => {
	it("opens and remembers URLs under an explicit workspace without reading active conversation state", () => {
		const store = createStore();
		store.set(openUrlInActivityWorkspaceAtom, {
			workspaceId: "agent-team:delivery",
			url: "https://example.com/team",
		});

		expect(store.get(browserUrlByWorkspaceAtom).get("agent-team:delivery")).toBe("https://example.com/team");
		expect(store.get(activityPanelTabByProjectAtom).get("agent-team:delivery")).toBe("browser");
		expect(store.get(activityPanelOpenAtom)).toBe(true);
	});

	// 浏览器页签可以被关进「+」；点链接又把它带回来，否则面板打开了却没有这个页签。
	it("restores a hidden browser tab when a URL is opened", () => {
		const store = createStore();
		store.set(hiddenActivityTabsAtom, new Map([["agent-team:delivery", ["browser", "todo"]]]));

		store.set(openUrlInActivityWorkspaceAtom, {
			workspaceId: "agent-team:delivery",
			url: "https://example.com/team",
		});

		expect(store.get(hiddenActivityTabsAtom).get("agent-team:delivery")).toEqual(["todo"]);
	});
});
