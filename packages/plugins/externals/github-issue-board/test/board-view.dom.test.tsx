// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act, type ComponentType } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { PluginContext, PluginStorageApi } from "@vetta-org/plugin-sdk";
import plugin from "../src/index";

interface RegisteredView {
	id: string;
	label: string;
	component: ComponentType<{ pluginId: string; viewId: string }>;
}

const COPY: Record<string, string> = {
	"board.title": "GitHub Issue Board",
	"board.taskInput.label": "Task description",
	"board.add": "Add",
	"board.queue.title": "Title",
	"board.queue.source": "Source",
	"board.queue.status": "Status",
	"board.source.manual": "Manual",
	"board.status.pending": "Pending",
};

/** Minimal host context: only what activate() and the board view actually touch. */
function fakeContext() {
	const registered: RegisteredView[] = [];
	const files = new Map<string, string>();
	const storage = {
		readFile: async (path: string) => files.get(path) ?? null,
		writeFile: async (path: string, data: string) => {
			files.set(path, data);
			return { revision: String(files.size), changedPaths: [path] };
		},
	} as unknown as PluginStorageApi;
	const ctx = {
		i18n: {
			locale: "en",
			t: (key: string) => COPY[key] ?? key,
			onChange: () => ({ dispose: () => {} }),
		},
		ui: {
			registerWorkspaceView: (contribution: RegisteredView) => {
				registered.push(contribution);
				return { dispose: () => {} };
			},
		},
		storage,
	} as unknown as PluginContext;
	return { ctx, registered };
}

function boardView(registered: RegisteredView[]) {
	const view = registered[0];
	if (!view) throw new Error("no workspace view registered");
	return view;
}

afterEach(cleanup);

describe("GitHub Issue board view", () => {
	it("renders the titled page from the plugin workspace entry", () => {
		const { ctx, registered } = fakeContext();
		plugin.activate(ctx);

		expect(registered).toHaveLength(1);
		const view = boardView(registered);
		expect(view.id).toBe("board");
		expect(view.label).toBe("%view.board.label%");

		render(<view.component pluginId="github-issue-board" viewId="board" />);
		expect(screen.getByRole("heading", { name: COPY["board.title"] })).toBeTruthy();
	});

	it("adds a manual pending task to the queue and keeps it after remount", async () => {
		const { ctx, registered } = fakeContext();
		plugin.activate(ctx);
		const view = boardView(registered);

		const first = render(<view.component pluginId="github-issue-board" viewId="board" />);

		const input = await waitFor(() => {
			const field = screen.getByRole("textbox", { name: COPY["board.taskInput.label"] });
			if (!(field instanceof HTMLTextAreaElement) || field.disabled) {
				throw new Error("task input is not ready");
			}
			return field;
		});
		fireEvent.change(input, { target: { value: "Fix the login button" } });
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: COPY["board.add"] }));
		});

		expect(screen.getByRole("cell", { name: "Fix the login button" })).toBeTruthy();
		expect(screen.getByRole("cell", { name: COPY["board.source.manual"] })).toBeTruthy();
		expect(screen.getByRole("cell", { name: COPY["board.status.pending"] })).toBeTruthy();

		first.unmount();
		render(<view.component pluginId="github-issue-board" viewId="board" />);

		await waitFor(() => {
			expect(screen.getByRole("cell", { name: "Fix the login button" })).toBeTruthy();
		});
		expect(screen.getByRole("cell", { name: COPY["board.source.manual"] })).toBeTruthy();
		expect(screen.getByRole("cell", { name: COPY["board.status.pending"] })).toBeTruthy();
	});
});
