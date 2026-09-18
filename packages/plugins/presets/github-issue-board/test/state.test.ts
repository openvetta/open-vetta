import { describe, expect, it } from "vitest";
import { EMPTY_STATE, parsePluginState } from "../src/state";
import { CONVERSATION_WORKSPACE } from "../src/workspace";

describe("parsePluginState", () => {
	it("keeps a pinned workspace path and defaults missing workspace to the current session", () => {
		expect(parsePluginState({ repoTarget: null, workspace: { kind: "path", path: "/apps/web" }, tasks: [] })).toEqual({
			repoTarget: null,
			workspace: { kind: "path", path: "/apps/web" },
			tasks: [],
		});
		expect(parsePluginState({ repoTarget: null, tasks: [] })).toEqual({
			repoTarget: null,
			workspace: CONVERSATION_WORKSPACE,
			tasks: [],
		});
		expect(parsePluginState(null)).toEqual(EMPTY_STATE);
	});
});
