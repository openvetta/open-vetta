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
	"board.queue.labels": "Labels",
	"board.queue.assignees": "Assignees",
	"board.queue.source": "Source",
	"board.queue.status": "Status",
	"board.source.manual": "Manual",
	"board.source.issue": "Issue",
	"board.issue.ref": "#{{number}}",
	"board.issue.unassigned": "Unassigned",
	"board.issue.dash": "—",
	"board.issue.nobody": "No description",
	"board.issue.noComments": "No comments",
	"board.issue.commentsError": "Could not load comments",
	"board.issue.commentsLoading": "Loading comments…",
	"board.status.pending": "Pending",
	"board.status.running": "Running",
	"board.status.completed": "Completed",
	"board.run": "Run",
	"board.run.direct": "Run directly",
	"board.run.withSkill": "Run with {{name}}",
	"board.edit": "Edit",
	"board.delete": "Delete",
	"board.delete.confirm": "Confirm delete",
	"board.save": "Save",
	"board.cancel": "Cancel",
	"board.taskEdit.label": "Edit task description",
	"board.error.noProject": "Select a project or local folder first",
	"board.repo.owner": "Owner",
	"board.repo.name": "Repository",
	"board.fetch": "Fetch issues",
	"board.fetch.loadMore": "Load more",
	"board.fetch.none": "No new open issues were imported",
	"board.fetch.summary": "Imported {{imported}}, updated {{updated}}",
	"board.fetch.more": "Imported {{imported}} more",
	"board.empty.fetching": "Fetching issues…",
	"board.empty.noIssues": "This repository has no open issues to import",
	"board.empty.notFetched":
		"Issues have not been fetched yet. Click “Fetch issues” to import open issues from this repository.",
	"board.workspace.label": "Project",
	"board.workspace.conversation": "Current session · {{path}}",
	"board.workspace.conversationNone": "Current session (no project open)",
	"board.workspace.project": "{{name}} · {{path}}",
	"board.workspace.pickDirectory": "Choose local folder",
	"board.project.current": "Working directory: {{path}}",
	"board.project.none": "No project is selected. Pick one from the workbench or a local folder, then fetch.",
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
	issuesByRepo?: Record<string, unknown[]>;
	issuesByPage?: Record<number, unknown[]>;
	comments?: unknown[];
	initialState?: unknown;
	networkResponse?: PluginNetworkResponse;
	gitRemote?: { stdout: string; exitCode: number };
	gitRemoteByCwd?: Record<string, { stdout: string; exitCode: number }>;
	ghApi?: { stdout: string; stderr?: string; exitCode: number };
	projects?: Array<{ path: string; name?: string }>;
	openDirectory?: () => Promise<string | null>;
}) {
	const registered: RegisteredView[] = [];
	const files = new Map<string, string>();
	if (options?.initialState !== undefined) {
		files.set("state.json", JSON.stringify(options.initialState));
	}
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
	const runCommand = vi.fn(async (file: string, _args?: string[], commandOptions?: { cwd?: string }) => {
		if (file === "gh") {
			if (options?.ghApi) {
				return { stderr: "", ...options.ghApi };
			}
			throw new Error("Command failed to start: gh (ENOENT)");
		}
		const remote =
			(commandOptions?.cwd ? options?.gitRemoteByCwd?.[commandOptions.cwd] : undefined) ?? options?.gitRemote;
		return {
			stdout: remote?.stdout ?? "",
			stderr: "",
			exitCode: remote?.exitCode ?? 0,
		};
	});
	const openDirectory = vi.fn(options?.openDirectory ?? (async () => null));
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
				let body: unknown = options?.issues ?? [];
				if (request.url.includes("/comments")) {
					body = options?.comments ?? [];
				} else if (options?.issuesByPage) {
					const match = /[?&]page=(\d+)/.exec(request.url);
					const page = match ? Number(match[1]) : 1;
					body = options.issuesByPage[page] ?? [];
				} else if (options?.issuesByRepo) {
					body = [];
					for (const [repo, items] of Object.entries(options.issuesByRepo)) {
						if (request.url.includes(`repos/${repo}/issues`)) {
							body = items;
							break;
						}
					}
				}
				return {
					ok: true,
					status: 200,
					statusText: "OK",
					headers: {},
					body,
				};
			},
		},
		official: {
			projects: {
				list: async () => ({
					workspacePath: "/ws",
					projects: options?.projects ?? [],
					archivedProjects: [],
				}),
			},
			dialog: { openDirectory },
		},
	} as unknown as PluginContext;
	return {
		ctx,
		registered,
		notifications,
		createSession,
		sendPrompt,
		openSession,
		requests,
		runCommand,
		openDirectory,
	};
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

async function readyWorkspaceSelect(): Promise<HTMLSelectElement> {
	return waitFor(() => {
		const field = screen.getByRole("combobox", { name: COPY["board.workspace.label"] });
		if (!(field instanceof HTMLSelectElement) || field.disabled) {
			throw new Error("workspace select is not ready");
		}
		return field;
	});
}

async function selectWorkspace(optionName: string): Promise<void> {
	const select = await readyWorkspaceSelect();
	const option = await waitFor(() => {
		const found = within(select).getByRole("option", { name: optionName });
		if (!(found instanceof HTMLOptionElement)) throw new Error("workspace option missing");
		return found;
	});
	await act(async () => {
		fireEvent.change(select, { target: { value: option.value } });
	});
}

function taskRow(title: string): HTMLElement {
	return screen.getByRole("row", { name: new RegExp(title) });
}

async function runDirectly(title: string): Promise<void> {
	await act(async () => {
		fireEvent.click(within(taskRow(title)).getByRole("button", { name: COPY["board.run"] }));
	});
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: COPY["board.run.direct"] }));
	});
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

	it("edits a pending manual task and runs the updated prompt after remount", async () => {
		const { ctx, registered, sendPrompt } = fakeContext();
		plugin.activate(ctx);
		const view = boardView(registered);
		const first = render(<view.component pluginId="github-issue-board" viewId="board" />);

		await addTask("Fix the login button");
		await act(async () => {
			fireEvent.click(within(taskRow("Fix the login button")).getByRole("button", { name: COPY["board.edit"] }));
		});
		fireEvent.change(screen.getByRole("textbox", { name: COPY["board.taskEdit.label"] }), {
			target: { value: "Fix the logout button" },
		});
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: COPY["board.save"] }));
		});
		expect(screen.getByRole("cell", { name: "Fix the logout button" })).toBeTruthy();
		expect(screen.queryByRole("cell", { name: "Fix the login button" })).toBeNull();

		first.unmount();
		render(<view.component pluginId="github-issue-board" viewId="board" />);
		await waitFor(() => {
			expect(screen.getByRole("cell", { name: "Fix the logout button" })).toBeTruthy();
		});
		await runDirectly("Fix the logout button");
		await waitFor(() => {
			expect(
				within(taskRow("Fix the logout button")).getByRole("cell", { name: COPY["board.status.completed"] }),
			).toBeTruthy();
		});
		expect(sendPrompt).toHaveBeenCalledWith("Fix the logout button");
	});

	it("deletes a queued task after confirmation and keeps the rest after remount", async () => {
		const { ctx, registered } = fakeContext();
		plugin.activate(ctx);
		const view = boardView(registered);
		const first = render(<view.component pluginId="github-issue-board" viewId="board" />);

		await addTask("Fix the login button");
		await addTask("Write the tests");
		await act(async () => {
			fireEvent.click(within(taskRow("Fix the login button")).getByRole("button", { name: COPY["board.delete"] }));
		});
		expect(screen.getByRole("cell", { name: "Fix the login button" })).toBeTruthy();
		await act(async () => {
			fireEvent.click(within(taskRow("Fix the login button")).getByRole("button", { name: COPY["board.cancel"] }));
		});
		expect(screen.getByRole("cell", { name: "Fix the login button" })).toBeTruthy();

		await act(async () => {
			fireEvent.click(within(taskRow("Fix the login button")).getByRole("button", { name: COPY["board.delete"] }));
		});
		await act(async () => {
			fireEvent.click(
				within(taskRow("Fix the login button")).getByRole("button", { name: COPY["board.delete.confirm"] }),
			);
		});
		expect(screen.queryByRole("cell", { name: "Fix the login button" })).toBeNull();
		expect(screen.getByRole("cell", { name: "Write the tests" })).toBeTruthy();

		first.unmount();
		render(<view.component pluginId="github-issue-board" viewId="board" />);
		await waitFor(() => {
			expect(screen.getByRole("cell", { name: "Write the tests" })).toBeTruthy();
		});
		expect(screen.queryByRole("cell", { name: "Fix the login button" })).toBeNull();
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
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: COPY["board.run.direct"] }));
		});

		await waitFor(() => {
			expect(within(taskRow("Fix the login button")).getByRole("cell", { name: COPY["board.status.running"] })).toBeTruthy();
		});
		expect(within(taskRow("Write the tests")).getByRole("button", { name: COPY["board.run"] })).toHaveProperty(
			"disabled",
			true,
		);
		expect(within(taskRow("Fix the login button")).getByRole("button", { name: COPY["board.edit"] })).toHaveProperty(
			"disabled",
			true,
		);
		expect(within(taskRow("Fix the login button")).getByRole("button", { name: COPY["board.delete"] })).toHaveProperty(
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
		await runDirectly("Fix the login button");

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
		await runDirectly("Fix the login button");

		await waitFor(() => {
			expect(
				within(taskRow("Fix the login button")).getByRole("cell", { name: COPY["board.status.completed"] }),
			).toBeTruthy();
		});
		expect(createSession).toHaveBeenCalledWith("/repo");
		expect(sendPrompt).toHaveBeenCalledWith("Fix the login button");
	});

	it("runs with the implement skill token when that run mode is chosen", async () => {
		const { ctx, registered, sendPrompt } = fakeContext();
		plugin.activate(ctx);
		const view = boardView(registered);
		render(<view.component pluginId="github-issue-board" viewId="board" />);

		await addTask("Fix the login button");
		await act(async () => {
			fireEvent.click(within(taskRow("Fix the login button")).getByRole("button", { name: COPY["board.run"] }));
		});
		expect(screen.getByRole("button", { name: COPY["board.run.direct"] })).toBeTruthy();
		expect(within(taskRow("Fix the login button")).getByRole("button", { name: COPY["board.run"] })).toBeTruthy();
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Run with implement" }));
		});
		await waitFor(() => {
			expect(
				within(taskRow("Fix the login button")).getByRole("cell", { name: COPY["board.status.completed"] }),
			).toBeTruthy();
		});
		expect(sendPrompt).toHaveBeenCalledWith("@skill:implement Fix the login button");
	});

	it("cancels the run chooser without starting a session", async () => {
		const { ctx, registered, createSession } = fakeContext();
		plugin.activate(ctx);
		const view = boardView(registered);
		render(<view.component pluginId="github-issue-board" viewId="board" />);

		await addTask("Fix the login button");
		await act(async () => {
			fireEvent.click(within(taskRow("Fix the login button")).getByRole("button", { name: COPY["board.run"] }));
		});
		expect(screen.getByRole("button", { name: COPY["board.run.direct"] })).toBeTruthy();
		await act(async () => {
			fireEvent.click(within(taskRow("Fix the login button")).getByRole("button", { name: COPY["board.run"] }));
		});
		expect(createSession).not.toHaveBeenCalled();
		expect(screen.queryByRole("button", { name: COPY["board.run.direct"] })).toBeNull();
		expect(within(taskRow("Fix the login button")).getByRole("cell", { name: COPY["board.status.pending"] })).toBeTruthy();
	});

	it("opens the recorded conversation from a finished task", async () => {
		const { ctx, registered, openSession } = fakeContext();
		plugin.activate(ctx);
		const view = boardView(registered);
		render(<view.component pluginId="github-issue-board" viewId="board" />);

		await addTask("Fix the login button");
		await runDirectly("Fix the login button");
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

		expect(screen.getByRole("cell", { name: "#10 Fix login" })).toBeTruthy();
		expect(within(taskRow("Fix login")).getByRole("cell", { name: COPY["board.source.issue"] })).toBeTruthy();
		expect(within(taskRow("Fix login")).getByRole("cell", { name: COPY["board.status.pending"] })).toBeTruthy();
		expect(within(taskRow("Fix login")).queryByRole("button", { name: COPY["board.edit"] })).toBeNull();
		expect(within(taskRow("Fix login")).queryByRole("button", { name: COPY["board.delete"] })).toBeNull();
		expect(screen.queryByRole("cell", { name: "Add feature" })).toBeNull();
		expect(requests[0]?.url).toBe("https://api.github.com/repos/acme/app/issues?state=open&per_page=100");
		expect(requests[0]?.headers?.Authorization).toBeUndefined();

		await fetchIssues();
		expect(screen.getAllByRole("cell", { name: "#10 Fix login" })).toHaveLength(1);

		first.unmount();
		render(<view.component pluginId="github-issue-board" viewId="board" />);
		await waitFor(() => {
			expect(screen.getByRole("cell", { name: "#10 Fix login" })).toBeTruthy();
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
		expect(screen.queryByRole("cell", { name: "#10 Fix login" })).toBeNull();
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

		expect(await screen.findByText("Working directory: /repo")).toBeTruthy();
		await fetchIssues();

		expect(runCommand).toHaveBeenCalledWith("git", ["remote", "-v"], {
			cwd: "/repo",
			timeoutMs: 8_000,
		});
		expect(screen.getByRole("cell", { name: "#10 Fix login" })).toBeTruthy();
		expect(requests[0]?.url).toBe("https://api.github.com/repos/acme/app/issues?state=open&per_page=100");
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
			["api", "repos/acme/app/issues?state=open&per_page=100"],
			{
				timeoutMs: 20_000,
				env: { GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1" },
			},
		);
		expect(requests).toHaveLength(0);
		expect(screen.getByRole("cell", { name: "#10 Fix login" })).toBeTruthy();
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
		expect(screen.queryByRole("cell", { name: "#10 Fix login" })).toBeNull();
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

	it("shows only the current repository's issues after fetching another repo", async () => {
		const { ctx, registered } = fakeContext({
			issuesByRepo: {
				"acme/app": [
					{
						number: 10,
						title: "Fix login",
						html_url: "https://github.com/acme/app/issues/10",
						body: "The button does nothing.",
						updated_at: "2026-01-02T03:04:05Z",
					},
				],
				"acme/web": [
					{
						number: 11,
						title: "Ship web",
						html_url: "https://github.com/acme/web/issues/11",
						body: "The landing page.",
						updated_at: "2026-01-03T00:00:00Z",
					},
				],
			},
		});
		plugin.activate(ctx);
		const view = boardView(registered);
		render(<view.component pluginId="github-issue-board" viewId="board" />);

		await fillRepo("acme", "app");
		await fetchIssues();
		expect(screen.getByRole("cell", { name: "#10 Fix login" })).toBeTruthy();

		await fillRepo("acme", "web");
		await fetchIssues();
		expect(screen.getByRole("cell", { name: "#11 Ship web" })).toBeTruthy();
		expect(screen.queryByRole("cell", { name: "#10 Fix login" })).toBeNull();
	});

	it("uses a workbench project to resolve git remote, fetch issues, and run in that folder", async () => {
		const { ctx, registered, createSession, runCommand } = fakeContext({
			cwd: null,
			projects: [{ path: "/apps/web", name: "web" }],
			gitRemoteByCwd: {
				"/apps/web": {
					stdout: "origin\tgit@github.com:acme/web.git (fetch)\n",
					exitCode: 0,
				},
			},
			issues: [
				{
					number: 11,
					title: "Ship web",
					html_url: "https://github.com/acme/web/issues/11",
					body: "The landing page.",
					updated_at: "2026-01-03T00:00:00Z",
				},
			],
		});
		plugin.activate(ctx);
		const view = boardView(registered);
		render(<view.component pluginId="github-issue-board" viewId="board" />);

		expect(await screen.findByText(COPY["board.project.none"] ?? "")).toBeTruthy();
		await selectWorkspace("web · /apps/web");

		expect(await screen.findByText("Working directory: /apps/web")).toBeTruthy();
		expect(runCommand).toHaveBeenCalledWith("git", ["remote", "-v"], {
			cwd: "/apps/web",
			timeoutMs: 8_000,
		});
		expect((await readyRepoField(COPY["board.repo.owner"] ?? "Owner")).value).toBe("acme");
		expect((await readyRepoField(COPY["board.repo.name"] ?? "Repository")).value).toBe("web");

		await fetchIssues();
		expect(screen.getByRole("cell", { name: "#11 Ship web" })).toBeTruthy();

		await runDirectly("Ship web");
		await waitFor(() => {
			expect(within(taskRow("Ship web")).getByRole("cell", { name: COPY["board.status.completed"] })).toBeTruthy();
		});
		expect(createSession).toHaveBeenCalledWith("/apps/web");
	});

	it("fills owner and repo from git remote after the user picks a local folder", async () => {
		const { ctx, registered, openDirectory, runCommand } = fakeContext({
			openDirectory: async () => "/picked",
			gitRemoteByCwd: {
				"/picked": {
					stdout: "origin\tgit@github.com:acme/picked.git (fetch)\n",
					exitCode: 0,
				},
			},
		});
		plugin.activate(ctx);
		const view = boardView(registered);
		render(<view.component pluginId="github-issue-board" viewId="board" />);

		await waitFor(() => {
			expect(screen.getByRole("button", { name: COPY["board.workspace.pickDirectory"] })).not.toHaveProperty(
				"disabled",
				true,
			);
		});
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: COPY["board.workspace.pickDirectory"] }));
		});

		expect(openDirectory).toHaveBeenCalledTimes(1);
		expect(await screen.findByText("Working directory: /picked")).toBeTruthy();
		expect(runCommand).toHaveBeenCalledWith("git", ["remote", "-v"], {
			cwd: "/picked",
			timeoutMs: 8_000,
		});
		expect((await readyRepoField(COPY["board.repo.owner"] ?? "Owner")).value).toBe("acme");
		expect((await readyRepoField(COPY["board.repo.name"] ?? "Repository")).value).toBe("picked");
	});

	it("keeps the current workspace when the folder picker is cancelled", async () => {
		const { ctx, registered, openDirectory, runCommand } = fakeContext({
			openDirectory: async () => null,
		});
		plugin.activate(ctx);
		const view = boardView(registered);
		render(<view.component pluginId="github-issue-board" viewId="board" />);

		expect(await screen.findByText("Working directory: /repo")).toBeTruthy();
		await waitFor(() => {
			expect(screen.getByRole("button", { name: COPY["board.workspace.pickDirectory"] })).not.toHaveProperty(
				"disabled",
				true,
			);
		});
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: COPY["board.workspace.pickDirectory"] }));
		});

		expect(openDirectory).toHaveBeenCalledTimes(1);
		expect(screen.getByText("Working directory: /repo")).toBeTruthy();
		expect(runCommand).not.toHaveBeenCalled();
	});

	it("refreshes an existing pending issue instead of duplicating it", async () => {
		const issues = [
			{
				number: 10,
				title: "Fix login",
				html_url: "https://github.com/acme/app/issues/10",
				body: "The button does nothing.",
				updated_at: "2026-01-02T03:04:05Z",
			},
		];
		const { ctx, registered, sendPrompt } = fakeContext({ issues });
		plugin.activate(ctx);
		const view = boardView(registered);
		render(<view.component pluginId="github-issue-board" viewId="board" />);

		await fillRepo("acme", "app");
		await fetchIssues();
		expect(screen.getByRole("cell", { name: "#10 Fix login" })).toBeTruthy();

		issues[0] = {
			number: 10,
			title: "Fix login button",
			html_url: "https://github.com/acme/app/issues/10",
			body: "Click does nothing now.",
			updated_at: "2026-02-01T00:00:00Z",
		};
		await fetchIssues();
		expect(screen.getByRole("cell", { name: "#10 Fix login button" })).toBeTruthy();
		expect(screen.getAllByRole("cell", { name: "#10 Fix login button" })).toHaveLength(1);

		await runDirectly("Fix login button");
		await waitFor(() => {
			expect(
				within(taskRow("Fix login button")).getByRole("cell", { name: COPY["board.status.completed"] }),
			).toBeTruthy();
		});
		expect(sendPrompt).toHaveBeenCalledWith(expect.stringContaining("Click does nothing now."));
	});

	it("fetches issues automatically after selecting a workbench project", async () => {
		const { ctx, registered, runCommand } = fakeContext({
			cwd: null,
			projects: [{ path: "/apps/web", name: "web" }],
			gitRemoteByCwd: {
				"/apps/web": {
					stdout: "origin\tgit@github.com:acme/web.git (fetch)\n",
					exitCode: 0,
				},
			},
			issues: [
				{
					number: 11,
					title: "Ship web",
					html_url: "https://github.com/acme/web/issues/11",
					body: "The landing page.",
					updated_at: "2026-01-03T00:00:00Z",
				},
			],
		});
		plugin.activate(ctx);
		const view = boardView(registered);
		render(<view.component pluginId="github-issue-board" viewId="board" />);

		await selectWorkspace("web · /apps/web");
		expect(runCommand).toHaveBeenCalledWith("git", ["remote", "-v"], {
			cwd: "/apps/web",
			timeoutMs: 8_000,
		});
		expect(await screen.findByRole("cell", { name: "#11 Ship web" })).toBeTruthy();
	});

	it("loads the next page of issues and hides load more on a short page", async () => {
		const issueItem = (number: number) => ({
			number,
			title: `Issue ${number}`,
			html_url: `https://github.com/acme/app/issues/${number}`,
			body: `Body ${number}`,
			updated_at: "2026-01-02T03:04:05Z",
		});
		const { ctx, registered } = fakeContext({
			issuesByPage: {
				1: Array.from({ length: 100 }, (_, index) => issueItem(index + 1)),
				2: [issueItem(101)],
			},
		});
		plugin.activate(ctx);
		const view = boardView(registered);
		render(<view.component pluginId="github-issue-board" viewId="board" />);

		await fillRepo("acme", "app");
		await fetchIssues();
		expect(screen.getByRole("cell", { name: "#1 Issue 1" })).toBeTruthy();
		expect(screen.getByRole("cell", { name: "#100 Issue 100" })).toBeTruthy();
		const loadMore = screen.getByRole("button", { name: COPY["board.fetch.loadMore"] });
		await act(async () => {
			fireEvent.click(loadMore);
		});
		expect(await screen.findByRole("cell", { name: "#101 Issue 101" })).toBeTruthy();
		expect(screen.queryByRole("button", { name: COPY["board.fetch.loadMore"] })).toBeNull();
	});

	it("explains an empty queue before and after fetching zero issues", async () => {
		const { ctx, registered } = fakeContext({ issues: [] });
		plugin.activate(ctx);
		const view = boardView(registered);
		render(<view.component pluginId="github-issue-board" viewId="board" />);

		expect(await screen.findByText(COPY["board.empty.notFetched"] ?? "")).toBeTruthy();
		await fillRepo("acme", "app");
		await fetchIssues();
		expect(screen.getByText(COPY["board.empty.noIssues"] ?? "")).toBeTruthy();
		expect(screen.getByText(COPY["board.fetch.none"] ?? "")).toBeTruthy();
	});

	it("shows labels, assignee, body and comments when an issue is expanded", async () => {
		const { ctx, registered, requests } = fakeContext({
			issues: [
				{
					number: 10,
					title: "Fix login",
					html_url: "https://github.com/acme/app/issues/10",
					body: "The button does nothing.",
					updated_at: "2026-01-02T03:04:05Z",
					labels: [{ name: "bug" }],
					assignees: [{ login: "alice" }],
				},
			],
			comments: [
				{
					id: 99,
					body: "Looks good.",
					created_at: "2026-01-04T00:00:00Z",
					user: { login: "bob" },
				},
			],
		});
		plugin.activate(ctx);
		const view = boardView(registered);
		render(<view.component pluginId="github-issue-board" viewId="board" />);

		await fillRepo("acme", "app");
		await fetchIssues();
		const row = taskRow("Fix login");
		expect(within(row).getByText("bug")).toBeTruthy();
		expect(within(row).getByText("alice")).toBeTruthy();

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "#10 Fix login" }));
		});
		expect(screen.getByText("The button does nothing.")).toBeTruthy();
		await waitFor(() => {
			expect(screen.getByText("bob")).toBeTruthy();
		});
		expect(screen.getByText("Looks good.")).toBeTruthy();
		expect(requests.some((request) => request.url.includes("/issues/10/comments"))).toBe(true);
	});

	it("hides directory-bound manual tasks in another project and keeps legacy tasks visible", async () => {
		const { ctx, registered } = fakeContext({
			cwd: "/repo",
			projects: [{ path: "/apps/web", name: "web" }],
			gitRemoteByCwd: {
				"/apps/web": {
					stdout: "origin\tgit@github.com:acme/web.git (fetch)\n",
					exitCode: 0,
				},
				"/repo": {
					stdout: "origin\tgit@github.com:acme/app.git (fetch)\n",
					exitCode: 0,
				},
			},
			issues: [],
			initialState: {
				repoTarget: null,
				workspace: { kind: "conversation" },
				tasks: [
					{
						id: "legacy",
						title: "legacy",
						promptText: "legacy",
						source: { kind: "manual" },
						status: "pending",
						createdAt: 1,
						updatedAt: 1,
					},
				],
			},
		});
		plugin.activate(ctx);
		const view = boardView(registered);
		render(<view.component pluginId="github-issue-board" viewId="board" />);

		expect(await screen.findByRole("cell", { name: "legacy" })).toBeTruthy();
		await selectWorkspace("web · /apps/web");
		expect(await screen.findByText("Working directory: /apps/web")).toBeTruthy();
		await waitFor(() => {
			expect(screen.getByRole("button", { name: COPY["board.fetch"] })).not.toHaveProperty("disabled", true);
		});
		expect(screen.getByRole("cell", { name: "legacy" })).toBeTruthy();
		await addTask("本地修复");
		expect(screen.getByRole("cell", { name: "本地修复" })).toBeTruthy();

		await selectWorkspace("Current session · /repo");
		await waitFor(() => {
			expect(screen.queryByRole("cell", { name: "本地修复" })).toBeNull();
		});
		expect(screen.getByRole("cell", { name: "legacy" })).toBeTruthy();

		await selectWorkspace("web · /apps/web");
		expect(await screen.findByRole("cell", { name: "本地修复" })).toBeTruthy();
		expect(screen.getByRole("cell", { name: "legacy" })).toBeTruthy();
	});
});
