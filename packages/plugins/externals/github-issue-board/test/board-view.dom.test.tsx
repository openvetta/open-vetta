// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { act, type ComponentType } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	__setPluginHostBridge,
	type ConversationEvent,
	type ConversationState,
	type PluginContext,
	type PluginConversationApi,
	type PluginStorageApi,
} from "@vetta-org/plugin-sdk";
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
	"board.status.running": "Running",
	"board.status.completed": "Completed",
	"board.run": "Run",
	"board.error.noProject": "Open a project first",
};

function installHostBridge(conversation: ConversationState): void {
	__setPluginHostBridge({
		useActiveConversation: () => conversation,
		useConversationMessages: () => [],
		usePromptAttachment: () => null,
		useLocale: () => "en",
		useSidebarState: () => ({ collapsed: false, narrow: false, visible: true }),
		conversation: {} as PluginConversationApi,
	});
}

/** Minimal host context: only what activate() and the board view actually touch. */
function fakeContext(options?: { cwd?: string | null; hangSend?: boolean }) {
	const registered: RegisteredView[] = [];
	const files = new Map<string, string>();
	const notifications: string[] = [];
	const listeners = new Set<(event: ConversationEvent) => void>();
	const cwd = options?.cwd === undefined ? "/repo" : options.cwd;
	installHostBridge({
		id: cwd ? "active" : null,
		cwd,
		sessionPath: cwd ? "/repo/session.jsonl" : null,
		model: null,
		isStreaming: false,
	});
	const storage = {
		readFile: async (path: string) => files.get(path) ?? null,
		writeFile: async (path: string, data: string) => {
			files.set(path, data);
			return { revision: String(files.size), changedPaths: [path] };
		},
	} as unknown as PluginStorageApi;
	const createSession = vi.fn(async (sessionCwd: string) => ({
		id: "sess-1",
		cwd: sessionCwd,
		sessionPath: "/repo/sess-1.jsonl",
		model: null,
		isStreaming: false,
	}));
	const sendPrompt = vi.fn(async () => {
		if (options?.hangSend) return new Promise<never>(() => undefined);
		for (const listener of listeners) listener({ type: "turn-end", stopReason: "stop" });
		return { status: "sent" as const };
	});
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
			notify: ({ message }: { message: string }) => {
				notifications.push(message);
			},
		},
		conversation: {
			createSession,
			sendPrompt,
			insertText: () => undefined,
			abort: async () => undefined,
			on: (listener: (event: ConversationEvent) => void) => {
				listeners.add(listener);
				return { dispose: () => listeners.delete(listener) };
			},
		},
		storage,
	} as unknown as PluginContext;
	return { ctx, registered, notifications, createSession, sendPrompt };
}

function boardView(registered: RegisteredView[]) {
	const view = registered[0];
	if (!view) throw new Error("no workspace view registered");
	return view;
}

async function readyInput(): Promise<HTMLTextAreaElement> {
	return waitFor(() => {
		const field = screen.getByRole("textbox", { name: COPY["board.taskInput.label"] });
		if (!(field instanceof HTMLTextAreaElement) || field.disabled) {
			throw new Error("task input is not ready");
		}
		return field;
	});
}

async function addTask(prompt: string): Promise<void> {
	const input = await readyInput();
	fireEvent.change(input, { target: { value: prompt } });
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: COPY["board.add"] }));
	});
}

function taskRow(title: string): HTMLElement {
	return screen.getByRole("row", { name: new RegExp(title) });
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

		await addTask("Fix the login button");

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

	it("disables other run buttons while a task is running", async () => {
		const { ctx, registered } = fakeContext({ hangSend: true });
		plugin.activate(ctx);
		const view = boardView(registered);
		render(<view.component pluginId="github-issue-board" viewId="board" />);

		await addTask("Fix the login button");
		await addTask("Write the tests");

		const firstRun = within(taskRow("Fix the login button")).getByRole("button", { name: COPY["board.run"] });
		const secondRun = within(taskRow("Write the tests")).getByRole("button", { name: COPY["board.run"] });
		expect(firstRun).not.toHaveProperty("disabled", true);
		expect(secondRun).not.toHaveProperty("disabled", true);

		await act(async () => {
			fireEvent.click(firstRun);
		});

		await waitFor(() => {
			expect(within(taskRow("Fix the login button")).getByRole("cell", { name: COPY["board.status.running"] })).toBeTruthy();
		});
		expect(within(taskRow("Write the tests")).getByRole("button", { name: COPY["board.run"] })).toHaveProperty(
			"disabled",
			true,
		);
	});

	it("prompts to open a project instead of starting a session when cwd is missing", async () => {
		const { ctx, registered, notifications, createSession } = fakeContext({ cwd: null });
		plugin.activate(ctx);
		const view = boardView(registered);
		render(<view.component pluginId="github-issue-board" viewId="board" />);

		await addTask("Fix the login button");
		await act(async () => {
			fireEvent.click(within(taskRow("Fix the login button")).getByRole("button", { name: COPY["board.run"] }));
		});

		expect(notifications).toContain(COPY["board.error.noProject"]);
		expect(createSession).not.toHaveBeenCalled();
		expect(within(taskRow("Fix the login button")).getByRole("cell", { name: COPY["board.status.pending"] })).toBeTruthy();
	});

	it("runs a pending task and marks it completed after a clean stop", async () => {
		const { ctx, registered, createSession, sendPrompt } = fakeContext();
		plugin.activate(ctx);
		const view = boardView(registered);
		render(<view.component pluginId="github-issue-board" viewId="board" />);

		await addTask("Fix the login button");
		await act(async () => {
			fireEvent.click(within(taskRow("Fix the login button")).getByRole("button", { name: COPY["board.run"] }));
		});

		await waitFor(() => {
			expect(
				within(taskRow("Fix the login button")).getByRole("cell", { name: COPY["board.status.completed"] }),
			).toBeTruthy();
		});
		expect(createSession).toHaveBeenCalledWith("/repo");
		expect(sendPrompt).toHaveBeenCalledWith("Fix the login button");
	});
});
