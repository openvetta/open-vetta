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
	"board.queue.actions": "Actions",
	"board.source.manual": "Manual",
	"board.source.issue": "Issue",
	"board.issue.ref": "#{{number}}",
	"board.issue.unassigned": "Unassigned",
	"board.issue.dash": "—",
	"board.issue.nobody": "No description",
	"board.issue.noComments": "No comments",
	"board.issue.commentsError": "Could not load comments",
	"board.issue.commentsLoading": "Loading comments…",
	"board.issue.state.open": "Open",
	"board.issue.state.closed": "Closed",
	"board.status.pending": "Pending",
	"board.status.running": "Running",
	"board.status.completed": "Completed",
	"board.status.failed": "Failed",
	"board.run": "Run",
	"board.run.direct": "Run directly",
	"board.run.withSkill": "Run with {{name}}",
	"board.run.includeComments": "Include comments",
	"board.autoAdvance": "Run the next task automatically",
	"board.retry": "Retry",
	"board.stop": "Stop",
	"board.edit": "Edit",
	"board.delete": "Delete",
	"board.delete.confirm": "Confirm delete",
	"board.save": "Save",
	"board.cancel": "Cancel",
	"board.taskEdit.label": "Edit task description",
	"board.error.noProject": "Select a project or local folder first",
	"board.error.interrupted": "Interrupted by a previous session",
	"board.error.stopped": "Stopped",
	"board.error.commentsFallback": "Could not load comments; sent the description only",
	"board.fetch": "Fetch issues",
	"board.fetch.loadMore": "Load more",
	"board.fetch.none": "No new open issues were imported",
	"board.fetch.summary": "Imported {{imported}}, updated {{updated}}",
	"board.fetch.more": "Imported {{imported}} more",
	"board.empty.fetching": "Fetching issues…",
	"board.empty.noIssues": "This repository has no open issues to import",
	"board.empty.notFetched":
		"Issues have not been fetched yet. Click “Fetch issues” to import open issues from this repository.",
	"board.empty.filtered": "No tasks match the current filters",
	"board.filter.search": "Search title or number",
	"board.filter.status": "Status",
	"board.filter.status.all": "All",
	"board.filter.label": "Label",
	"board.filter.label.all": "All",
	"board.fetch.assignee": "Scope",
	"board.fetch.assignee.any": "All open",
	"board.fetch.assignee.me": "Assigned to me",
	"board.fetch.label": "Fetch label",
	"board.error.assigneeNeedsGh": "“Assigned to me” needs a logged-in GitHub CLI",
	"board.workspace.label": "Project",
	"board.workspace.placeholder": "Select project",
	"board.workspace.conversation": "Current session · {{path}}",
	"board.workspace.conversationNone": "Current session (no project open)",
	"board.workspace.project": "{{name}} · {{path}}",
	"board.workspace.pickDirectory": "Open local folder",
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
	commentsError?: boolean;
	skills?: Array<{
		name: string;
		alias?: string;
		description?: string;
		source?: string;
		type?: "skill" | "scene";
		enabled?: boolean;
	}>;
	skillsError?: boolean;
	initialState?: unknown;
	networkResponse?: PluginNetworkResponse;
	gitRemote?: { stdout: string; exitCode: number };
	gitRemoteByCwd?: Record<string, { stdout: string; exitCode: number }>;
	ghApi?: { stdout: string; stderr?: string; exitCode: number };
	projects?: Array<{ path: string; name?: string }>;
	openDirectory?: () => Promise<string | null>;
	runningSessionPaths?: string[];
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
	const sessionListeners = new Set<(event: { sessionPath: string; running: boolean; sessionId?: string }) => void>();
	const emitIdle = (): void => {
		for (const listener of sessionListeners) {
			listener({ sessionPath: "/repo/sess-1.jsonl", running: false, sessionId: "sess-1" });
		}
	};
	const createSession = vi.fn(async (input: { cwd: string; title?: string }) => ({
		sessionId: "sess-1",
		sessionPath: "/repo/sess-1.jsonl",
		cwd: input.cwd,
	}));
	const sendPrompt = vi.fn(async (_sessionId: string, _text: string) => {
		if (options?.hangSend) return { status: "sent" as const };
		queueMicrotask(emitIdle);
		return { status: "sent" as const };
	});
	const abortSession = vi.fn(async () => undefined);
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
					if (options?.commentsError) {
						return {
							ok: false,
							status: 500,
							statusText: "Error",
							headers: {},
							body: { message: "boom" },
						};
					}
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
			sessions: {
				create: createSession,
				prompt: sendPrompt,
				abort: abortSession,
				open: openSession,
				listRunning: async () => options?.runningSessionPaths ?? [],
				onRunningChanged: (handler: (event: { sessionPath: string; running: boolean; sessionId?: string }) => void) => {
					sessionListeners.add(handler);
					return () => {
						sessionListeners.delete(handler);
					};
				},
			},
			skills: {
				list: async (cwd?: string) => {
					if (options?.skillsError) throw new Error(`skills failed for ${cwd ?? ""}`);
					return (options?.skills ?? []).map((skill) => ({
						name: skill.name,
						description: skill.description ?? skill.name,
						source: skill.source ?? "custom",
						type: skill.type ?? "skill",
						...(skill.alias ? { alias: skill.alias } : {}),
						...(skill.enabled === undefined ? {} : { enabled: skill.enabled }),
					}));
				},
			},
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
		readState: () => (files.has("state.json") ? JSON.parse(files.get("state.json") ?? "null") : null),
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

function githubRemote(owner: string, repo: string): { stdout: string; exitCode: number } {
	return {
		stdout: `origin\tgit@github.com:${owner}/${repo}.git (fetch)\n`,
		exitCode: 0,
	};
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

async function readyWorkspaceTrigger(): Promise<HTMLElement> {
	return waitFor(() => {
		const trigger = screen.getByRole("button", { name: COPY["board.workspace.label"] });
		if (trigger.hasAttribute("disabled")) throw new Error("workspace picker is not ready");
		return trigger;
	});
}

async function openWorkspaceMenu(): Promise<void> {
	const trigger = await readyWorkspaceTrigger();
	if (trigger.getAttribute("aria-expanded") === "true") return;
	await act(async () => {
		fireEvent.click(trigger);
	});
}

async function selectWorkspace(optionName: string): Promise<void> {
	await openWorkspaceMenu();
	const item = await screen.findByRole("menuitem", { name: optionName });
	await act(async () => {
		fireEvent.click(item);
	});
}

async function selectFilterOption(filterName: string, optionName: string): Promise<void> {
	const trigger = screen.getByRole("button", { name: filterName });
	if (trigger.getAttribute("aria-expanded") !== "true") {
		await act(async () => {
			fireEvent.click(trigger);
		});
	}
	const item = await screen.findByRole("menuitem", { name: optionName });
	await act(async () => {
		fireEvent.click(item);
	});
}

function taskRow(title: string): HTMLElement {
	return screen.getByRole("row", { name: new RegExp(title) });
}

function listedSkill(
	name: string,
	extra?: { alias?: string; type?: "skill" | "scene"; enabled?: boolean },
): {
	name: string;
	alias?: string;
	type?: "skill" | "scene";
	enabled?: boolean;
} {
	return { name, ...extra };
}

async function openRunMenu(title: string): Promise<void> {
	await act(async () => {
		fireEvent.click(within(taskRow(title)).getByRole("button", { name: COPY["board.run"] }));
	});
	expect(await screen.findByRole("button", { name: COPY["board.run.direct"] })).toBeTruthy();
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
		expect(sendPrompt).toHaveBeenCalledWith("sess-1", "Fix the logout button");
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

	it("reclaims a persisted running issue on load so other tasks can run", async () => {
		const { ctx, registered } = fakeContext({
			gitRemote: githubRemote("acme", "app"),
			initialState: {
				repoTarget: { owner: "acme", repo: "app" },
				workspace: { kind: "conversation" },
				tasks: [
					{
						id: "run",
						title: "Fix login",
						promptText: "Fix login",
						source: {
							kind: "issue",
							owner: "acme",
							repo: "app",
							issueNumber: 10,
							issueUrl: "https://github.com/acme/app/issues/10",
							issueUpdatedAt: "2026-01-01T00:00:00Z",
							issueState: "open",
						},
						status: "running",
						sessionId: "/repo/sess-1.jsonl",
						createdAt: 1,
						updatedAt: 1,
					},
					{
						id: "next",
						title: "Add docs",
						promptText: "Add docs",
						source: {
							kind: "issue",
							owner: "acme",
							repo: "app",
							issueNumber: 11,
							issueUrl: "https://github.com/acme/app/issues/11",
							issueUpdatedAt: "2026-01-01T00:00:00Z",
							issueState: "open",
						},
						status: "pending",
						createdAt: 1,
						updatedAt: 1,
					},
				],
				issueNextPage: null,
				lastFetch: { owner: "acme", repo: "app" },
			},
		});
		plugin.activate(ctx);
		const view = boardView(registered);
		render(<view.component pluginId="github-issue-board" viewId="board" />);

		expect(await screen.findByText(COPY["board.error.interrupted"] ?? "")).toBeTruthy();
		expect(
			within(taskRow("Fix login")).getByRole("cell", {
				name: `${COPY["board.status.failed"]} ${COPY["board.issue.state.open"]} ${COPY["board.error.interrupted"]}`,
			}),
		).toBeTruthy();
		expect(within(taskRow("Fix login")).getByRole("button", { name: COPY["board.openSession"] })).toBeTruthy();
		expect(within(taskRow("Add docs")).getByRole("button", { name: COPY["board.run"] })).not.toHaveProperty(
			"disabled",
			true,
		);
	});

	it("retries a failed issue back to pending and runs the original prompt", async () => {
		const { ctx, registered, createSession, sendPrompt } = fakeContext({
			gitRemote: githubRemote("acme", "app"),
			initialState: {
				repoTarget: { owner: "acme", repo: "app" },
				workspace: { kind: "conversation" },
				tasks: [
					{
						id: "failed",
						title: "Fix login",
						promptText: "The button does nothing.",
						source: {
							kind: "issue",
							owner: "acme",
							repo: "app",
							issueNumber: 10,
							issueUrl: "https://github.com/acme/app/issues/10",
							issueUpdatedAt: "2026-01-01T00:00:00Z",
							issueState: "open",
						},
						status: "failed",
						error: "boom",
						createdAt: 1,
						updatedAt: 1,
					},
				],
				issueNextPage: null,
				lastFetch: { owner: "acme", repo: "app" },
			},
		});
		plugin.activate(ctx);
		const view = boardView(registered);
		render(<view.component pluginId="github-issue-board" viewId="board" />);

		expect(await screen.findByRole("button", { name: COPY["board.retry"] })).toBeTruthy();
		await act(async () => {
			fireEvent.click(within(taskRow("Fix login")).getByRole("button", { name: COPY["board.retry"] }));
		});
		expect(
			within(taskRow("Fix login")).getByRole("cell", {
				name: `${COPY["board.status.pending"]} ${COPY["board.issue.state.open"]}`,
			}),
		).toBeTruthy();
		expect(within(taskRow("Fix login")).queryByRole("button", { name: COPY["board.edit"] })).toBeNull();
		expect(within(taskRow("Fix login")).queryByRole("button", { name: COPY["board.delete"] })).toBeNull();

		await runDirectly("Fix login");
		await waitFor(() => {
			expect(
				within(taskRow("Fix login")).getByRole("cell", {
					name: `${COPY["board.status.completed"]} ${COPY["board.issue.state.open"]}`,
				}),
			).toBeTruthy();
		});
		expect(createSession).toHaveBeenCalledWith({ cwd: "/repo", title: "Fix login" });
		expect(sendPrompt).toHaveBeenCalledWith("sess-1", "The button does nothing.");
	});

	it("stops a running task and unlocks the rest of the queue", async () => {
		const { ctx, registered } = fakeContext({ hangSend: true });
		plugin.activate(ctx);
		const view = boardView(registered);
		render(<view.component pluginId="github-issue-board" viewId="board" />);

		await addTask("Fix the login button");
		await addTask("Write the tests");
		await runDirectly("Fix the login button");
		await waitFor(() => {
			expect(
				within(taskRow("Fix the login button")).getByRole("cell", { name: COPY["board.status.running"] }),
			).toBeTruthy();
		});
		expect(within(taskRow("Fix the login button")).queryByRole("button", { name: COPY["board.run"] })).toBeNull();
		await act(async () => {
			fireEvent.click(within(taskRow("Fix the login button")).getByRole("button", { name: COPY["board.stop"] }));
		});
		await waitFor(() => {
			expect(
				within(taskRow("Fix the login button")).getByRole("cell", {
					name: `${COPY["board.status.failed"]} ${COPY["board.error.stopped"]}`,
				}),
			).toBeTruthy();
		});
		expect(screen.getByText(COPY["board.error.stopped"] ?? "")).toBeTruthy();
		expect(within(taskRow("Write the tests")).getByRole("button", { name: COPY["board.run"] })).not.toHaveProperty(
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
		expect(createSession).toHaveBeenCalledWith({ cwd: "/repo", title: "Fix the login button" });
		expect(sendPrompt).toHaveBeenCalledWith("sess-1", "Fix the login button");
	});

	it("advances to the next pending task after a completed run when auto-advance is checked", async () => {
		const { ctx, registered, createSession, openSession, readState } = fakeContext();
		plugin.activate(ctx);
		const view = boardView(registered);
		render(<view.component pluginId="github-issue-board" viewId="board" />);

		await addTask("Fix the login button");
		await addTask("Write the tests");
		const autoAdvance = await screen.findByRole("checkbox", { name: COPY["board.autoAdvance"] });
		expect(autoAdvance).not.toHaveProperty("checked", true);
		await act(async () => {
			fireEvent.click(autoAdvance);
		});
		expect((autoAdvance as HTMLInputElement).checked).toBe(true);
		await waitFor(() => {
			expect(readState()?.autoAdvance).toBe(true);
		});

		await runDirectly("Fix the login button");
		await waitFor(() => {
			expect(
				within(taskRow("Write the tests")).getByRole("cell", { name: COPY["board.status.completed"] }),
			).toBeTruthy();
		});
		expect(
			within(taskRow("Fix the login button")).getByRole("cell", { name: COPY["board.status.completed"] }),
		).toBeTruthy();
		expect(createSession).toHaveBeenCalledTimes(2);
		expect(openSession).not.toHaveBeenCalled();
		expect(screen.getByRole("heading", { name: COPY["board.title"] })).toBeTruthy();
	});

	it("does not advance after a failed stop or when auto-advance is unchecked", async () => {
		const hanging = fakeContext({ hangSend: true });
		plugin.activate(hanging.ctx);
		const hangingView = boardView(hanging.registered);
		const first = render(<hangingView.component pluginId="github-issue-board" viewId="board" />);

		await addTask("Fix the login button");
		await addTask("Write the tests");
		await act(async () => {
			fireEvent.click(screen.getByRole("checkbox", { name: COPY["board.autoAdvance"] }));
		});
		await runDirectly("Fix the login button");
		await waitFor(() => {
			expect(
				within(taskRow("Fix the login button")).getByRole("cell", { name: COPY["board.status.running"] }),
			).toBeTruthy();
		});
		await act(async () => {
			fireEvent.click(within(taskRow("Fix the login button")).getByRole("button", { name: COPY["board.stop"] }));
		});
		await waitFor(() => {
			expect(
				within(taskRow("Fix the login button")).getByRole("cell", {
					name: `${COPY["board.status.failed"]} ${COPY["board.error.stopped"]}`,
				}),
			).toBeTruthy();
		});
		expect(within(taskRow("Write the tests")).getByRole("cell", { name: COPY["board.status.pending"] })).toBeTruthy();
		expect(hanging.createSession).toHaveBeenCalledTimes(1);
		first.unmount();

		const idle = fakeContext();
		plugin.activate(idle.ctx);
		const idleView = boardView(idle.registered);
		render(<idleView.component pluginId="github-issue-board" viewId="board" />);
		await addTask("Fix the login button");
		await addTask("Write the tests");
		await act(async () => {
			fireEvent.click(screen.getByRole("checkbox", { name: COPY["board.autoAdvance"] }));
		});
		await act(async () => {
			fireEvent.click(screen.getByRole("checkbox", { name: COPY["board.autoAdvance"] }));
		});
		await runDirectly("Fix the login button");
		await waitFor(() => {
			expect(
				within(taskRow("Fix the login button")).getByRole("cell", { name: COPY["board.status.completed"] }),
			).toBeTruthy();
		});
		expect(within(taskRow("Write the tests")).getByRole("cell", { name: COPY["board.status.pending"] })).toBeTruthy();
		expect(idle.createSession).toHaveBeenCalledTimes(1);
	});

	it("reuses the chosen skill for the next auto-advanced task", async () => {
		const { ctx, registered, sendPrompt, openSession } = fakeContext({
			skills: [listedSkill("implement", { alias: "impl" })],
		});
		plugin.activate(ctx);
		const view = boardView(registered);
		render(<view.component pluginId="github-issue-board" viewId="board" />);

		await addTask("Fix the login button");
		await addTask("Write the tests");
		await act(async () => {
			fireEvent.click(screen.getByRole("checkbox", { name: COPY["board.autoAdvance"] }));
		});
		await openRunMenu("Fix the login button");
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Run with impl" }));
		});
		await waitFor(() => {
			expect(
				within(taskRow("Write the tests")).getByRole("cell", { name: COPY["board.status.completed"] }),
			).toBeTruthy();
		});
		expect(sendPrompt).toHaveBeenNthCalledWith(1, "sess-1", "@skill:implement Fix the login button");
		expect(sendPrompt).toHaveBeenNthCalledWith(2, "sess-1", "@skill:implement Write the tests");
		expect(openSession).not.toHaveBeenCalled();
	});

	it("lists enabled skills from the project and prefixes the chosen skill token", async () => {
		const { ctx, registered, sendPrompt } = fakeContext({
			skills: [
				listedSkill("review"),
				listedSkill("implement", { alias: "impl" }),
				listedSkill("standup", { type: "scene" }),
				listedSkill("disabled-bot", { enabled: false }),
			],
		});
		plugin.activate(ctx);
		const view = boardView(registered);
		render(<view.component pluginId="github-issue-board" viewId="board" />);

		await addTask("Fix the login button");
		await openRunMenu("Fix the login button");

		expect(await screen.findByRole("button", { name: "Run with impl" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Run with review" })).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Run with standup" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Run with disabled-bot" })).toBeNull();
		expect(screen.queryByRole("checkbox", { name: COPY["board.run.includeComments"] })).toBeNull();

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Run with impl" }));
		});
		await waitFor(() => {
			expect(
				within(taskRow("Fix the login button")).getByRole("cell", { name: COPY["board.status.completed"] }),
			).toBeTruthy();
		});
		expect(sendPrompt).toHaveBeenCalledWith("sess-1", "@skill:implement Fix the login button");
	});

	it("only offers run directly when the skill list is empty or fails", async () => {
		const empty = fakeContext();
		plugin.activate(empty.ctx);
		const emptyView = boardView(empty.registered);
		const first = render(<emptyView.component pluginId="github-issue-board" viewId="board" />);

		await addTask("Fix the login button");
		await openRunMenu("Fix the login button");
		expect(screen.getByRole("button", { name: COPY["board.run.direct"] })).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Run with implement" })).toBeNull();
		first.unmount();

		const failed = fakeContext({ skillsError: true });
		plugin.activate(failed.ctx);
		const failedView = boardView(failed.registered);
		render(<failedView.component pluginId="github-issue-board" viewId="board" />);
		await addTask("Write the tests");
		await openRunMenu("Write the tests");
		expect(screen.getByRole("button", { name: COPY["board.run.direct"] })).toBeTruthy();
		expect(screen.queryByRole("button", { name: /Run with / })).toBeNull();
	});

	it("sends issue comments when checked without storing them on the queued prompt", async () => {
		const { ctx, registered, sendPrompt, readState } = fakeContext({
			gitRemote: githubRemote("acme", "app"),
			issues: [
				{
					number: 10,
					title: "Fix login",
					html_url: "https://github.com/acme/app/issues/10",
					body: "The button does nothing.",
					updated_at: "2026-01-02T03:04:05Z",
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

		await fetchIssues();
		await openRunMenu("Fix login");
		const checkbox = screen.getByRole("checkbox", { name: COPY["board.run.includeComments"] });
		expect(checkbox).not.toHaveProperty("checked", true);
		await act(async () => {
			fireEvent.click(checkbox);
		});
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: COPY["board.run.direct"] }));
		});
		await waitFor(() => {
			expect(
				within(taskRow("Fix login")).getByRole("cell", {
					name: `${COPY["board.status.completed"]} ${COPY["board.issue.state.open"]}`,
				}),
			).toBeTruthy();
		});
		const sent = String(sendPrompt.mock.calls[0]?.[1]);
		expect(sent).toContain("The button does nothing.");
		expect(sent).toContain("Comments:");
		expect(sent).toContain("bob: Looks good.");
		expect(sent).not.toMatch(/^@skill:/);
		const stored = readState() as { tasks: Array<{ promptText: string }> };
		expect(stored.tasks[0]?.promptText).toContain("The button does nothing.");
		expect(stored.tasks[0]?.promptText).not.toContain("Comments:");
		expect(stored.tasks[0]?.promptText).not.toContain("bob:");
	});

	it("notifies and still runs the issue body when comments fail to load", async () => {
		const { ctx, registered, sendPrompt, notifications } = fakeContext({
			gitRemote: githubRemote("acme", "app"),
			issues: [
				{
					number: 10,
					title: "Fix login",
					html_url: "https://github.com/acme/app/issues/10",
					body: "The button does nothing.",
					updated_at: "2026-01-02T03:04:05Z",
				},
			],
			commentsError: true,
		});
		plugin.activate(ctx);
		const view = boardView(registered);
		render(<view.component pluginId="github-issue-board" viewId="board" />);

		await fetchIssues();
		await openRunMenu("Fix login");
		await act(async () => {
			fireEvent.click(screen.getByRole("checkbox", { name: COPY["board.run.includeComments"] }));
		});
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: COPY["board.run.direct"] }));
		});
		await waitFor(() => {
			expect(
				within(taskRow("Fix login")).getByRole("cell", {
					name: `${COPY["board.status.completed"]} ${COPY["board.issue.state.open"]}`,
				}),
			).toBeTruthy();
		});
		expect(notifications).toContain(COPY["board.error.commentsFallback"]);
		const sent = String(sendPrompt.mock.calls[0]?.[1]);
		expect(sent).toContain("The button does nothing.");
		expect(sent).not.toContain("Comments:");
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

	it("imports open issues from the project remote and does not enqueue duplicates", async () => {
		const { ctx, registered, requests } = fakeContext({
			gitRemote: githubRemote("acme", "app"),
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

		await fetchIssues();

		expect(screen.getByRole("cell", { name: "#10 Fix login" })).toBeTruthy();
		expect(within(taskRow("Fix login")).getByRole("cell", { name: COPY["board.source.issue"] })).toBeTruthy();
		expect(
			within(taskRow("Fix login")).getByRole("cell", {
				name: `${COPY["board.status.pending"]} ${COPY["board.issue.state.open"]}`,
			}),
		).toBeTruthy();
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
	});

	it("notifies when the repository is missing or private", async () => {
		const { ctx, registered, notifications } = fakeContext({
			gitRemote: githubRemote("nope", "missing"),
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
			gitRemote: githubRemote("acme", "app"),
			ghApi: { stdout: "unknown shorthand flag: 'F' in -F", exitCode: 1 },
		});
		plugin.activate(ctx);
		const view = boardView(registered);
		render(<view.component pluginId="github-issue-board" viewId="board" />);

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

	it("shows only the current repository's issues after selecting another project", async () => {
		const { ctx, registered } = fakeContext({
			cwd: null,
			projects: [
				{ path: "/apps/app", name: "app" },
				{ path: "/apps/web", name: "web" },
			],
			gitRemoteByCwd: {
				"/apps/app": githubRemote("acme", "app"),
				"/apps/web": githubRemote("acme", "web"),
			},
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

		await selectWorkspace("app");
		expect(await screen.findByRole("cell", { name: "#10 Fix login" })).toBeTruthy();

		await selectWorkspace("web");
		expect(await screen.findByRole("cell", { name: "#11 Ship web" })).toBeTruthy();
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
		await selectWorkspace("web");

		expect(await screen.findByText("Working directory: /apps/web")).toBeTruthy();
		expect(runCommand).toHaveBeenCalledWith("git", ["remote", "-v"], {
			cwd: "/apps/web",
			timeoutMs: 8_000,
		});
		await fetchIssues();
		expect(screen.getByRole("cell", { name: "#11 Ship web" })).toBeTruthy();

		await runDirectly("Ship web");
		await waitFor(() => {
			expect(
				within(taskRow("Ship web")).getByRole("cell", {
					name: `${COPY["board.status.completed"]} ${COPY["board.issue.state.open"]}`,
				}),
			).toBeTruthy();
		});
		expect(createSession).toHaveBeenCalledWith({ cwd: "/apps/web", title: "Ship web" });
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

		await openWorkspaceMenu();
		const pickFolder = await screen.findByRole("menuitem", { name: COPY["board.workspace.pickDirectory"] });
		expect(pickFolder).not.toHaveProperty("disabled", true);
		await act(async () => {
			fireEvent.click(pickFolder);
		});

		expect(openDirectory).toHaveBeenCalledTimes(1);
		expect(await screen.findByText("Working directory: /picked")).toBeTruthy();
		expect(runCommand).toHaveBeenCalledWith("git", ["remote", "-v"], {
			cwd: "/picked",
			timeoutMs: 8_000,
		});
	});

	it("keeps the current workspace when the folder picker is cancelled", async () => {
		const { ctx, registered, openDirectory, runCommand } = fakeContext({
			openDirectory: async () => null,
		});
		plugin.activate(ctx);
		const view = boardView(registered);
		render(<view.component pluginId="github-issue-board" viewId="board" />);

		expect(await screen.findByText("Working directory: /repo")).toBeTruthy();
		await openWorkspaceMenu();
		const pickFolder = await screen.findByRole("menuitem", { name: COPY["board.workspace.pickDirectory"] });
		expect(pickFolder).not.toHaveProperty("disabled", true);
		await act(async () => {
			fireEvent.click(pickFolder);
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
		const { ctx, registered, sendPrompt } = fakeContext({ gitRemote: githubRemote("acme", "app"), issues });
		plugin.activate(ctx);
		const view = boardView(registered);
		render(<view.component pluginId="github-issue-board" viewId="board" />);

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
				within(taskRow("Fix login button")).getByRole("cell", {
					name: `${COPY["board.status.completed"]} ${COPY["board.issue.state.open"]}`,
				}),
			).toBeTruthy();
		});
		expect(sendPrompt).toHaveBeenCalledWith("sess-1", expect.stringContaining("Click does nothing now."));
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

		await selectWorkspace("web");
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
			gitRemote: githubRemote("acme", "app"),
			issuesByPage: {
				1: Array.from({ length: 100 }, (_, index) => issueItem(index + 1)),
				2: [issueItem(101)],
			},
		});
		plugin.activate(ctx);
		const view = boardView(registered);
		render(<view.component pluginId="github-issue-board" viewId="board" />);

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
		const { ctx, registered } = fakeContext({ gitRemote: githubRemote("acme", "app"), issues: [] });
		plugin.activate(ctx);
		const view = boardView(registered);
		render(<view.component pluginId="github-issue-board" viewId="board" />);

		expect(await screen.findByText(COPY["board.empty.notFetched"] ?? "")).toBeTruthy();
		await fetchIssues();
		expect(screen.getByText(COPY["board.empty.noIssues"] ?? "")).toBeTruthy();
		expect(screen.getByText(COPY["board.fetch.none"] ?? "")).toBeTruthy();
	});

	it("hides closed issues without a session and shows GitHub state on completed ones", async () => {
		const { ctx, registered } = fakeContext({
			gitRemote: githubRemote("acme", "app"),
			initialState: {
				repoTarget: { owner: "acme", repo: "app" },
				workspace: { kind: "conversation" },
				tasks: [
					{
						id: "leftover",
						title: "Old leftover",
						promptText: "Old leftover",
						source: {
							kind: "issue",
							owner: "acme",
							repo: "app",
							issueNumber: 10,
							issueUrl: "https://github.com/acme/app/issues/10",
							issueUpdatedAt: "2026-01-01T00:00:00Z",
							issueState: "open",
						},
						status: "pending",
						createdAt: 1,
						updatedAt: 1,
					},
					{
						id: "done",
						title: "Finished locally",
						promptText: "Finished locally",
						source: {
							kind: "issue",
							owner: "acme",
							repo: "app",
							issueNumber: 11,
							issueUrl: "https://github.com/acme/app/issues/11",
							issueUpdatedAt: "2026-01-01T00:00:00Z",
							issueState: "open",
						},
						status: "completed",
						sessionId: "/repo/sess-1.jsonl",
						createdAt: 1,
						updatedAt: 1,
					},
				],
				issueNextPage: null,
				lastFetch: { owner: "acme", repo: "app" },
			},
			issues: [
				{
					number: 12,
					title: "Still open",
					html_url: "https://github.com/acme/app/issues/12",
					body: "Keep this one.",
					updated_at: "2026-03-01T00:00:00Z",
				},
			],
		});
		plugin.activate(ctx);
		const view = boardView(registered);
		render(<view.component pluginId="github-issue-board" viewId="board" />);

		expect(await screen.findByRole("cell", { name: "#10 Old leftover" })).toBeTruthy();
		expect(screen.getByRole("cell", { name: "#11 Finished locally" })).toBeTruthy();
		await fetchIssues();
		expect(screen.queryByRole("cell", { name: "#10 Old leftover" })).toBeNull();
		expect(screen.getByRole("cell", { name: "#11 Finished locally" })).toBeTruthy();
		expect(
			within(taskRow("Finished locally")).getByRole("cell", {
				name: `${COPY["board.status.completed"]} ${COPY["board.issue.state.closed"]}`,
			}),
		).toBeTruthy();
		expect(screen.getByRole("cell", { name: "#12 Still open" })).toBeTruthy();
		expect(
			within(taskRow("Still open")).getByRole("cell", {
				name: `${COPY["board.status.pending"]} ${COPY["board.issue.state.open"]}`,
			}),
		).toBeTruthy();
	});

	it("does not hide issues missing from page 1 until the last open page arrives", async () => {
		const issueItem = (number: number, title: string) => ({
			number,
			title,
			html_url: `https://github.com/acme/app/issues/${number}`,
			body: `Body ${number}`,
			updated_at: "2026-01-02T03:04:05Z",
		});
		const { ctx, registered } = fakeContext({
			gitRemote: githubRemote("acme", "app"),
			initialState: {
				repoTarget: { owner: "acme", repo: "app" },
				workspace: { kind: "conversation" },
				tasks: [
					{
						id: "later",
						title: "Not on this page",
						promptText: "Not on this page",
						source: {
							kind: "issue",
							owner: "acme",
							repo: "app",
							issueNumber: 200,
							issueUrl: "https://github.com/acme/app/issues/200",
							issueUpdatedAt: "2026-01-01T00:00:00Z",
							issueState: "open",
						},
						status: "pending",
						createdAt: 1,
						updatedAt: 1,
					},
				],
				issueNextPage: null,
				lastFetch: { owner: "acme", repo: "app" },
			},
			issuesByPage: {
				1: Array.from({ length: 100 }, (_, index) => issueItem(index + 1, `Issue ${index + 1}`)),
				2: [issueItem(101, "Issue 101")],
			},
		});
		plugin.activate(ctx);
		const view = boardView(registered);
		render(<view.component pluginId="github-issue-board" viewId="board" />);

		expect(await screen.findByRole("cell", { name: "#200 Not on this page" })).toBeTruthy();
		await fetchIssues();
		expect(screen.getByRole("cell", { name: "#1 Issue 1" })).toBeTruthy();
		expect(screen.getByRole("cell", { name: "#200 Not on this page" })).toBeTruthy();
		const loadMore = screen.getByRole("button", { name: COPY["board.fetch.loadMore"] });
		await act(async () => {
			fireEvent.click(loadMore);
		});
		expect(await screen.findByRole("cell", { name: "#101 Issue 101" })).toBeTruthy();
		expect(screen.queryByRole("cell", { name: "#200 Not on this page" })).toBeNull();
	});

	it("shows labels, assignee, body and comments when an issue is expanded", async () => {
		const { ctx, registered, requests } = fakeContext({
			gitRemote: githubRemote("acme", "app"),
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
		await selectWorkspace("web");
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

		await selectWorkspace("web");
		expect(await screen.findByRole("cell", { name: "本地修复" })).toBeTruthy();
		expect(screen.getByRole("cell", { name: "legacy" })).toBeTruthy();
	});

	it("keeps the board in view when a task starts running and only opens the session on demand", async () => {
		const { ctx, registered, openSession } = fakeContext({ hangSend: true });
		plugin.activate(ctx);
		const view = boardView(registered);
		render(<view.component pluginId="github-issue-board" viewId="board" />);

		await addTask("Fix the login button");
		await runDirectly("Fix the login button");
		await waitFor(() => {
			expect(
				within(taskRow("Fix the login button")).getByRole("cell", { name: COPY["board.status.running"] }),
			).toBeTruthy();
		});
		expect(screen.getByRole("heading", { name: COPY["board.title"] })).toBeTruthy();
		expect(openSession).not.toHaveBeenCalled();
		expect(within(taskRow("Fix the login button")).getByRole("button", { name: COPY["board.stop"] })).toBeTruthy();

		await act(async () => {
			fireEvent.click(within(taskRow("Fix the login button")).getByRole("button", { name: COPY["board.openSession"] }));
		});
		expect(openSession).toHaveBeenCalledWith({ cwd: "/repo", sessionPath: "/repo/sess-1.jsonl" });
	});

	it("keeps a live running issue when the host still reports that session", async () => {
		const { ctx, registered } = fakeContext({
			gitRemote: githubRemote("acme", "app"),
			runningSessionPaths: ["/repo/sess-1.jsonl"],
			initialState: {
				repoTarget: { owner: "acme", repo: "app" },
				workspace: { kind: "conversation" },
				tasks: [
					{
						id: "run",
						title: "Fix login",
						promptText: "Fix login",
						source: {
							kind: "issue",
							owner: "acme",
							repo: "app",
							issueNumber: 10,
							issueUrl: "https://github.com/acme/app/issues/10",
							issueUpdatedAt: "2026-01-01T00:00:00Z",
							issueState: "open",
						},
						status: "running",
						sessionId: "/repo/sess-1.jsonl",
						createdAt: 1,
						updatedAt: 1,
					},
				],
				issueNextPage: null,
				lastFetch: { owner: "acme", repo: "app" },
			},
		});
		plugin.activate(ctx);
		const view = boardView(registered);
		render(<view.component pluginId="github-issue-board" viewId="board" />);

		expect(
			await screen.findByRole("cell", {
				name: `${COPY["board.status.running"]} ${COPY["board.issue.state.open"]}`,
			}),
		).toBeTruthy();
		expect(screen.queryByText(COPY["board.error.interrupted"] ?? "")).toBeNull();
		expect(within(taskRow("Fix login")).getByRole("button", { name: COPY["board.stop"] })).toBeTruthy();
	});

	it("filters the queue by title search, status, and label, and shows a distinct empty message", async () => {
		const { ctx, registered } = fakeContext({
			gitRemote: githubRemote("acme", "app"),
			initialState: {
				repoTarget: { owner: "acme", repo: "app" },
				workspace: { kind: "conversation" },
				tasks: [
					{
						id: "login",
						title: "Fix login",
						promptText: "Fix login",
						source: {
							kind: "issue",
							owner: "acme",
							repo: "app",
							issueNumber: 10,
							issueUrl: "https://github.com/acme/app/issues/10",
							issueUpdatedAt: "2026-01-01T00:00:00Z",
							issueState: "open",
						},
						status: "pending",
						labels: ["bug"],
						createdAt: 1,
						updatedAt: 1,
					},
					{
						id: "docs",
						title: "Add docs",
						promptText: "Add docs",
						source: {
							kind: "issue",
							owner: "acme",
							repo: "app",
							issueNumber: 11,
							issueUrl: "https://github.com/acme/app/issues/11",
							issueUpdatedAt: "2026-01-01T00:00:00Z",
							issueState: "open",
						},
						status: "failed",
						error: "boom",
						labels: ["docs"],
						createdAt: 1,
						updatedAt: 1,
					},
				],
				issueNextPage: null,
				lastFetch: { owner: "acme", repo: "app" },
			},
		});
		plugin.activate(ctx);
		const view = boardView(registered);
		render(<view.component pluginId="github-issue-board" viewId="board" />);

		expect(await screen.findByRole("cell", { name: "#10 Fix login" })).toBeTruthy();
		expect(screen.getByRole("cell", { name: "#11 Add docs" })).toBeTruthy();

		fireEvent.change(screen.getByPlaceholderText(COPY["board.filter.search"] ?? ""), {
			target: { value: "login" },
		});
		expect(screen.getByRole("cell", { name: "#10 Fix login" })).toBeTruthy();
		expect(screen.queryByRole("cell", { name: "#11 Add docs" })).toBeNull();

		fireEvent.change(screen.getByPlaceholderText(COPY["board.filter.search"] ?? ""), { target: { value: "" } });
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: COPY["board.filter.status"] }));
		});
		expect(screen.getByRole("menuitem", { name: COPY["board.filter.status.all"] })).toBeTruthy();
		expect(screen.getByRole("menuitem", { name: COPY["board.status.pending"] })).toBeTruthy();
		expect(screen.getByRole("menuitem", { name: COPY["board.status.failed"] })).toBeTruthy();
		await selectFilterOption(COPY["board.filter.status"] ?? "", COPY["board.status.failed"] ?? "");
		expect(screen.getByRole("button", { name: COPY["board.filter.status"] }).textContent).toContain(
			COPY["board.status.failed"],
		);
		expect(screen.getByRole("cell", { name: "#11 Add docs" })).toBeTruthy();
		expect(screen.queryByRole("cell", { name: "#10 Fix login" })).toBeNull();

		await selectFilterOption(COPY["board.filter.status"] ?? "", COPY["board.filter.status.all"] ?? "");
		await selectFilterOption(COPY["board.filter.label"] ?? "", "bug");
		expect(screen.getByRole("button", { name: COPY["board.filter.label"] }).textContent).toContain("bug");
		expect(screen.getByRole("cell", { name: "#10 Fix login" })).toBeTruthy();
		expect(screen.queryByRole("cell", { name: "#11 Add docs" })).toBeNull();

		await selectFilterOption(COPY["board.filter.label"] ?? "", COPY["board.filter.label.all"] ?? "");
		fireEvent.change(screen.getByPlaceholderText(COPY["board.filter.search"] ?? ""), {
			target: { value: "zzzzz" },
		});
		expect(screen.getByText(COPY["board.empty.filtered"] ?? "")).toBeTruthy();
		expect(screen.queryByText(COPY["board.empty.notFetched"] ?? "")).toBeNull();
		expect(screen.getByPlaceholderText(COPY["board.filter.search"] ?? "")).toBeTruthy();
		expect(screen.getByRole("button", { name: COPY["board.filter.status"] })).toBeTruthy();
		expect(screen.getByRole("button", { name: COPY["board.filter.label"] })).toBeTruthy();
	});

	it("fetches assigned issues through gh after the user picks assigned to me", async () => {
		const issue = {
			number: 10,
			title: "Fix login",
			html_url: "https://github.com/acme/app/issues/10",
			body: "The button does nothing.",
			updated_at: "2026-01-02T03:04:05Z",
		};
		const { ctx, registered, requests, runCommand } = fakeContext({
			gitRemote: githubRemote("acme", "app"),
			ghApi: { stdout: JSON.stringify([issue]), exitCode: 0 },
		});
		plugin.activate(ctx);
		const view = boardView(registered);
		render(<view.component pluginId="github-issue-board" viewId="board" />);

		await readyFetchButton();
		await selectFilterOption(COPY["board.fetch.assignee"] ?? "", COPY["board.fetch.assignee.me"] ?? "");
		await fetchIssues();

		expect(runCommand).toHaveBeenCalledWith(
			"gh",
			["api", "repos/acme/app/issues?state=open&per_page=100&assignee=@me"],
			{
				timeoutMs: 20_000,
				env: { GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1" },
			},
		);
		expect(requests).toHaveLength(0);
		expect(screen.getByRole("cell", { name: "#10 Fix login" })).toBeTruthy();
	});

	it("notifies and leaves the queue unchanged when assigned-to-me fetch has no GitHub CLI login", async () => {
		const { ctx, registered, notifications, requests } = fakeContext({
			gitRemote: githubRemote("acme", "app"),
			initialState: {
				repoTarget: { owner: "acme", repo: "app" },
				workspace: { kind: "conversation" },
				tasks: [
					{
						id: "queued",
						title: "Already queued",
						promptText: "Already queued",
						source: {
							kind: "issue",
							owner: "acme",
							repo: "app",
							issueNumber: 10,
							issueUrl: "https://github.com/acme/app/issues/10",
							issueUpdatedAt: "2026-01-01T00:00:00Z",
							issueState: "open",
						},
						status: "pending",
						createdAt: 1,
						updatedAt: 1,
					},
				],
				issueNextPage: null,
				lastFetch: { owner: "acme", repo: "app" },
			},
			issues: [
				{
					number: 11,
					title: "Should not import",
					html_url: "https://github.com/acme/app/issues/11",
					body: "Leftover public payload.",
					updated_at: "2026-01-03T00:00:00Z",
				},
			],
		});
		plugin.activate(ctx);
		const view = boardView(registered);
		render(<view.component pluginId="github-issue-board" viewId="board" />);

		expect(await screen.findByRole("cell", { name: "#10 Already queued" })).toBeTruthy();
		await selectFilterOption(COPY["board.fetch.assignee"] ?? "", COPY["board.fetch.assignee.me"] ?? "");
		await fetchIssues();

		expect(notifications).toContain(COPY["board.error.assigneeNeedsGh"]);
		expect(requests).toHaveLength(0);
		expect(screen.getByRole("cell", { name: "#10 Already queued" })).toBeTruthy();
		expect(screen.queryByRole("cell", { name: "#11 Should not import" })).toBeNull();
	});

	it("includes an encoded label in the public fetch URL and keeps unmatched queued issues", async () => {
		const { ctx, registered, requests } = fakeContext({
			gitRemote: githubRemote("acme", "app"),
			initialState: {
				repoTarget: { owner: "acme", repo: "app" },
				workspace: { kind: "conversation" },
				tasks: [
					{
						id: "other",
						title: "Unlabeled leftover",
						promptText: "Unlabeled leftover",
						source: {
							kind: "issue",
							owner: "acme",
							repo: "app",
							issueNumber: 10,
							issueUrl: "https://github.com/acme/app/issues/10",
							issueUpdatedAt: "2026-01-01T00:00:00Z",
							issueState: "open",
						},
						status: "pending",
						createdAt: 1,
						updatedAt: 1,
					},
				],
				issueNextPage: null,
				lastFetch: { owner: "acme", repo: "app" },
			},
			issues: [
				{
					number: 12,
					title: "Labeled bug",
					html_url: "https://github.com/acme/app/issues/12",
					body: "A bug.",
					updated_at: "2026-03-01T00:00:00Z",
					labels: [{ name: "needs:help" }],
				},
			],
		});
		plugin.activate(ctx);
		const view = boardView(registered);
		render(<view.component pluginId="github-issue-board" viewId="board" />);

		expect(await screen.findByRole("cell", { name: "#10 Unlabeled leftover" })).toBeTruthy();
		const labelInput = await screen.findByRole("textbox", { name: COPY["board.fetch.label"] });
		fireEvent.change(labelInput, { target: { value: "needs:help" } });
		expect(requests).toHaveLength(0);
		await fetchIssues();

		expect(requests[0]?.url).toBe(
			"https://api.github.com/repos/acme/app/issues?state=open&per_page=100&labels=needs%3Ahelp",
		);
		expect(screen.getByRole("cell", { name: "#12 Labeled bug" })).toBeTruthy();
		expect(screen.getByRole("cell", { name: "#10 Unlabeled leftover" })).toBeTruthy();
	});

	it("uses the persisted fetch filter for the automatic first page after switching project", async () => {
		const issue = {
			number: 11,
			title: "Ship web",
			html_url: "https://github.com/acme/web/issues/11",
			body: "The landing page.",
			updated_at: "2026-01-03T00:00:00Z",
		};
		const { ctx, registered, runCommand } = fakeContext({
			cwd: null,
			projects: [{ path: "/apps/web", name: "web" }],
			gitRemoteByCwd: {
				"/apps/web": {
					stdout: "origin\tgit@github.com:acme/web.git (fetch)\n",
					exitCode: 0,
				},
			},
			ghApi: { stdout: JSON.stringify([issue]), exitCode: 0 },
			initialState: {
				repoTarget: null,
				workspace: { kind: "conversation" },
				tasks: [],
				issueNextPage: null,
				lastFetch: null,
				fetchFilter: { assignee: "me", label: "area" },
			},
		});
		plugin.activate(ctx);
		const view = boardView(registered);
		render(<view.component pluginId="github-issue-board" viewId="board" />);

		expect(await screen.findByDisplayValue("area")).toBeTruthy();
		expect(screen.getByRole("button", { name: COPY["board.fetch.assignee"] }).textContent).toContain(
			COPY["board.fetch.assignee.me"],
		);
		await selectWorkspace("web");
		expect(runCommand).toHaveBeenCalledWith(
			"gh",
			["api", "repos/acme/web/issues?state=open&per_page=100&assignee=@me&labels=area"],
			{
				timeoutMs: 20_000,
				env: { GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1" },
			},
		);
		expect(await screen.findByRole("cell", { name: "#11 Ship web" })).toBeTruthy();
	});
});
