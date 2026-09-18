// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { PluginContext } from "@vetta-org/plugin-sdk";
import plugin from "../src/index";

interface RegisteredView {
	id: string;
	label: string;
	component: ComponentType<{ pluginId: string; viewId: string }>;
}

const BOARD_TITLE = "GitHub Issue Board";

/** Minimal host context: only what activate() actually touches. */
function fakeContext() {
	const registered: RegisteredView[] = [];
	const ctx = {
		i18n: {
			locale: "en",
			t: (key: string) => (key === "board.title" ? BOARD_TITLE : key),
			onChange: () => ({ dispose: () => {} }),
		},
		ui: {
			registerWorkspaceView: (contribution: RegisteredView) => {
				registered.push(contribution);
				return { dispose: () => {} };
			},
		},
	} as unknown as PluginContext;
	return { ctx, registered };
}

afterEach(cleanup);

describe("empty GitHub Issue board view", () => {
	it("renders the titled empty page from the plugin workspace entry", () => {
		const { ctx, registered } = fakeContext();
		plugin.activate(ctx);

		expect(registered).toHaveLength(1);
		const view = registered[0];
		if (!view) throw new Error("no workspace view registered");
		expect(view.id).toBe("board");
		expect(view.label).toBe("%view.board.label%");

		render(<view.component pluginId="github-issue-board" viewId="board" />);
		expect(screen.getByRole("heading", { name: BOARD_TITLE })).toBeTruthy();
	});
});
