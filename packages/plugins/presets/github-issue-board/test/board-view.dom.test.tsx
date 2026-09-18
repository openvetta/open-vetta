// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { act, type ComponentType } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	__setPluginHostBridge,
	type ConversationEvent,
	type ConversationState,
	type PluginCommandApi,
	type PluginContext,
	type PluginConversationApi,
	type PluginNetworkRequest,
	type PluginNetworkResponse,
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
	"board.source.issue": "Issue",
	"board.status.pending": "Pending",
	"board.status.running": "Running",
	"board.status.completed": "Completed",
	"board.run": "Run",
	"board.error.noProject": "Open a project first",
	"board.repo.owner": "Owner",
	"board.repo.name": "Repository",
	"board.fetch": "Fetch issues",
	"board.project.current": "Current project: {{path}}",
	"board.project.none": "No project is open. Open a local repository in the sidebar, then fetch.",
	"board.error.notFound": "Repository not found or private.",
	"board.error.nonJson": "GitHub returned an unexpected, non-JSON error.",
	"board.error.noGithubRemote": "The current project has no GitHub remote.",
	"board.error.notGit": "The current folder is not a Git repository.",
	"board.openSession": "Open conversation",
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
function interpolate(text: string, params?: Record<string, string | number>): string {
	if (!params) return text;
	return text.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
		name in params ? String(params[name]) : match,
	);
}

function fakeContext(options?: {
	cwd?: string | null;
	hangSend?: boolean;
	issues?: unknown[];
	networkResponse?: PluginNetworkResponse;
	gitRemote?: { stdout: string; exitCode: number };
	ghApi?: { stdout: string; stderr?: string; exitCode: number };
}) {
	const registered: RegisteredView[] = [];
	const files = new Map<string, string>();
	const notifications: string[] = [];
	const listeners = new Set<(event: ConversationEvent) => void>();
	const requests: PluginNetworkRequest[] = [];
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
	const openSession = vi.fn(async () => undefined);
	const runCommand = vi.fn(async (file: string) => {
		if (file === "gh") {
			if (options?.ghApi) {
				return { stderr: "", ...options.ghApi };
			}
			throw new Error("Command failed to start: gh (ENOENT)");
		}
		return {
			stdout: options?.gitRemote?.stdout ?? "",
			stderr: "",
			exitCode: options?.gitRemote?.exitCode ?? 0,
		};
	});
	const ctx = {
		i18n: {
			locale: "en",
			t: (key: string, params?: Record<string, string | number>) =>
				interpolate(COPY[key] ?? key, params),
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
			openSession,
			insertText: () => undefined,
			abort: async () => undefined,
			on: (listener: (event: ConversationEvent) => void) => {
				listeners.add(listener);
				return { dispose: () => listeners.delete(listener) };
			},
		},
		storage,
		command: { run: runCommand } as unknown as PluginCommandApi,
		network: {
			request: async (request: PluginNetworkRequest) => {
				requests.push(request);
				if (options?.networkResponse) return options.networkResponse;
				return {
					ok: true,
					status: 200,
					statusText: "OK",
					headers: {},
					body: options?.issues ?? [],
				};
			},
		},
	} as unknown as PluginContext;
	return { ctx, registered, notifications, createSession, sendPrompt, openSession, requests, runCommand };
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

async function readyRepoField(label: string): Promise<HTMLInputElement> {
	return waitFor(() => {
		const field = screen.getByRole("textbox", { name: label });
		if (!(field instanceof HTMLInputElement) || field.disabled) {
			throw new Error(`${label} is not ready`);
		}
		return field;
	});
}

async function fillRepo(owner: string, repo: string): Promise<void> {
	fireEvent.change(await readyRepoField(COPY["board.repo.owner"] ?? "Owner"), { target: { value: owner } });
	fireEvent.change(await readyRepoField(COPY["board.repo.name"] ?? "Repository"), { target: { value: repo } });
}

async function readyFetchButton(): Promise<HTMLElement> {
	return waitFor(() => {
		const button = screen.getByRole("button", { name: COPY["board.fetch"] });
		if (!(button instanceof HTMLButtonElement) || button.disabled) {
			throw new Error("fetch button is not ready");
		}
		return button;
	});
}

async function fetchIssues(): Promise<void> {
	const button = await readyFetchButton();
	await act(async () => {
		fireEvent.click(button);
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

	it("opens the recorded conversation from a finished task", async () => {
		const { ctx, registered, openSession } = fakeContext();
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

		await act(async () => {
			fireEvent.click(
				within(taskRow("Fix the login button")).getByRole("button", { name: COPY["board.openSession"] }),
			);
		});
		expect(openSession).toHaveBeenCalledWith({ cwd: "/repo", sessionPath: "/repo/sess-1.jsonl" });
	});

	it("imports open issues from the filled repo and does not enqueue duplicates", async () => {
		const { ctx, registered, requests } = fakeContext({
			issues: [
				{
					number: 10,
					title: "Fix login",
					html_url: "https://github.com/acme/app/issues/10",
					body: "The button does nothing.",
					updated_at: "2026-01-02T03:04:05Z",
				},
				{
					number: 11,
					title: "Add feature",
					html_url: "https://github.com/acme/app/pull/11",
					body: "A pull request.",
					updated_at: "2026-01-03T00:00:00Z",
					pull_request: { url: "https://api.github.com/repos/acme/app/pulls/11" },
				},
			],
		});
		plugin.activate(ctx);
		const view = boardView(registered);
		const first = render(<view.component pluginId="github-issue-board" viewId="board" />);

		await fillRepo("acme", "app");
		await fetchIssues();

		expect(screen.getByRole("cell", { name: "Fix login" })).toBeTruthy();
		expect(within(taskRow("Fix login")).getByRole("cell", { name: COPY["board.source.issue"] })).toBeTruthy();
		expect(within(taskRow("Fix login")).getByRole("cell", { name: COPY["board.status.pending"] })).toBeTruthy();
		expect(screen.queryByRole("cell", { name: "Add feature" })).toBeNull();
		expect(requests[0]?.url).toBe("https://api.github.com/repos/acme/app/issues?state=open&per_page=30");
		expect(requests[0]?.headers?.Authorization).toBeUndefined();

		await fetchIssues();
		expect(screen.getAllByRole("cell", { name: "Fix login" })).toHaveLength(1);

		first.unmount();
		render(<view.component pluginId="github-issue-board" viewId="board" />);
		await waitFor(() => {
			expect(screen.getByRole("cell", { name: "Fix login" })).toBeTruthy();
		});
		expect((await readyRepoField(COPY["board.repo.owner"] ?? "Owner")).value).toBe("acme");
		expect((await readyRepoField(COPY["board.repo.name"] ?? "Repository")).value).toBe("app");
	});

	it("notifies when the filled repository is missing or private", async () => {
		const { ctx, registered, notifications } = fakeContext({
			networkResponse: {
				ok: false,
				status: 404,
				statusText: "Not Found",
				headers: {},
				body: { message: "Not Found" },
			},
		});
		plugin.activate(ctx);
		const view = boardView(registered);
		render(<view.component pluginId="github-issue-board" viewId="board" />);

		await fillRepo("nope", "missing");
		await fetchIssues();

		expect(notifications).toContain(COPY["board.error.notFound"]);
		expect(screen.queryByRole("cell", { name: "Fix login" })).toBeNull();
	});

	it("fetches issues from the current project's GitHub remote without typing owner/repo", async () => {
		const { ctx, registered, requests, runCommand } = fakeContext({
			gitRemote: {
				stdout: "origin\tgit@github.com:acme/app.git (fetch)\n",
				exitCode: 0,
			},
			issues: [
				{
					number: 10,
					title: "Fix login",
					html_url: "https://github.com/acme/app/issues/10",
					body: "The button does nothing.",
					updated_at: "2026-01-02T03:04:05Z",
				},
			],
		});
		plugin.activate(ctx);
		const view = boardView(registered);
		render(<view.component pluginId="github-issue-board" viewId="board" />);

		expect(await screen.findByText("Current project: /repo")).toBeTruthy();
		await fetchIssues();

		expect(runCommand).toHaveBeenCalledWith("git", ["remote", "-v"], {
			cwd: "/repo",
			timeoutMs: 8_000,
		});
		expect(screen.getByRole("cell", { name: "Fix login" })).toBeTruthy();
		expect(requests[0]?.url).toBe("https://api.github.com/repos/acme/app/issues?state=open&per_page=30");
		expect((await readyRepoField(COPY["board.repo.owner"] ?? "Owner")).value).toBe("acme");
		expect((await readyRepoField(COPY["board.repo.name"] ?? "Repository")).value).toBe("app");
	});

	it("fetches issues through the local gh login without calling the unauthenticated API", async () => {
		const issue = {
			number: 10,
			title: "Fix login",
			html_url: "https://github.com/acme/app/issues/10",
			body: "The button does nothing.",
			updated_at: "2026-01-02T03:04:05Z",
		};
		const { ctx, registered, requests, runCommand } = fakeContext({
			gitRemote: {
				stdout: "origin\tgit@github.com:acme/app.git (fetch)\n",
				exitCode: 0,
			},
			ghApi: { stdout: JSON.stringify([issue]), exitCode: 0 },
		});
		plugin.activate(ctx);
		const view = boardView(registered);
		render(<view.component pluginId="github-issue-board" viewId="board" />);

		await fetchIssues();

		expect(runCommand).toHaveBeenCalledWith(
			"gh",
			["api", "repos/acme/app/issues?state=open&per_page=30"],
			{
				timeoutMs: 20_000,
				env: { GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1" },
			},
		);
		expect(requests).toHaveLength(0);
		expect(screen.getByRole("cell", { name: "Fix login" })).toBeTruthy();
	});

	it("shows a fetch error instead of crashing when gh returns an unreadable body", async () => {
		const { ctx, registered, notifications } = fakeContext({
			ghApi: { stdout: "unknown shorthand flag: 'F' in -F", exitCode: 1 },
		});
		plugin.activate(ctx);
		const view = boardView(registered);
		render(<view.component pluginId="github-issue-board" viewId="board" />);

		await fillRepo("acme", "app");
		await fetchIssues();

		expect(notifications).toContain(COPY["board.error.nonJson"]);
		expect(screen.queryByRole("cell", { name: "Fix login" })).toBeNull();
	});

	it("prompts to open a project when fetching without a cwd or GitHub remote", async () => {
		const missingProject = fakeContext({ cwd: null });
		plugin.activate(missingProject.ctx);
		const missingView = boardView(missingProject.registered);
		render(<missingView.component pluginId="github-issue-board" viewId="board" />);

		expect(await screen.findByText(COPY["board.project.none"] ?? "")).toBeTruthy();
		await fetchIssues();
		expect(missingProject.notifications).toContain(COPY["board.error.noProject"]);
		expect(missingProject.requests).toHaveLength(0);
		expect(missingProject.runCommand).not.toHaveBeenCalled();

		cleanup();

		const noGithub = fakeContext({
			gitRemote: { stdout: "origin\tgit@gitlab.com:acme/app.git (fetch)\n", exitCode: 0 },
		});
		plugin.activate(noGithub.ctx);
		const noGithubView = boardView(noGithub.registered);
		render(<noGithubView.component pluginId="github-issue-board" viewId="board" />);

		await fetchIssues();
		expect(noGithub.notifications).toContain(COPY["board.error.noGithubRemote"]);
		expect(noGithub.requests).toHaveLength(0);
	});
});
