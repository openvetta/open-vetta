import { describe, expect, it } from "vitest";
import { CAPABILITY_ERROR_CODES, CAPABILITY_PREFIXES } from "../src/contracts.js";
import {
	BATCH_EXECUTION_MODES,
	DOMAIN_BATCH_TASK_CAPABILITIES,
	DOMAIN_DOWNLOAD_CAPABILITIES,
	DOMAIN_GENERAL_SETTINGS_CAPABILITIES,
	DOMAIN_KNOWLEDGE_CAPABILITIES,
	DOMAIN_PROJECT_CAPABILITIES,
	DOMAIN_QUICK_PANEL_CAPABILITIES,
	DOMAIN_SCHEDULER_CAPABILITIES,
	DOMAIN_SESSION_CAPABILITIES,
	DOMAIN_SHORTCUT_CAPABILITIES,
	DOMAIN_SKILL_CAPABILITIES,
	DOMAIN_UPDATER_CAPABILITIES,
	DOMAIN_WEBHOOK_CAPABILITIES,
	DOWNLOAD_STATUSES,
	GENERAL_EXECUTION_MODES,
	QUICK_PANEL_POST_SEND_BEHAVIORS,
	QUICK_PANEL_TRIGGERS,
	SCHEDULER_EXECUTION_MODES,
	SKILL_TYPES,
	UPDATER_PHASES,
	WEBHOOK_KINDS,
} from "../src/domain.js";

describe("general settings domain capabilities", () => {
	it("uses one stable id per general settings operation", () => {
		expect(Object.values(DOMAIN_GENERAL_SETTINGS_CAPABILITIES).map((capability) => capability.id)).toEqual([
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}general-settings.get`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}general-settings.notifications.set`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}general-settings.default-execution-mode.set`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}general-settings.workspace.set`,
		]);
	});

	it("validates settings snapshots and mutations", () => {
		expect(
			DOMAIN_GENERAL_SETTINGS_CAPABILITIES.GET.parseOutput({
				workspacePath: "C:/workspace",
				defaultExecutionMode: GENERAL_EXECUTION_MODES.FULL_ACCESS,
				notificationsEnabled: true,
				debugMode: false,
				sandbox: { status: "available", backend: "windows-host", platform: "win32" },
			}),
		).toHaveProperty("sandbox.backend", "windows-host");
		expect(DOMAIN_GENERAL_SETTINGS_CAPABILITIES.SET_DEFAULT_EXECUTION_MODE.parseInput({ mode: "sandbox" })).toEqual({
			mode: "sandbox",
		});
		expect(() =>
			DOMAIN_GENERAL_SETTINGS_CAPABILITIES.SET_DEFAULT_EXECUTION_MODE.parseInput({ mode: "inherit" }),
		).toThrowError(expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_INPUT }));
		expect(() =>
			DOMAIN_GENERAL_SETTINGS_CAPABILITIES.GET.parseOutput({
				workspacePath: "C:/workspace",
				defaultExecutionMode: "full-access",
				notificationsEnabled: true,
				debugMode: false,
				sandbox: { status: "ready", backend: null, platform: "win32" },
			}),
		).toThrowError(expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_OUTPUT }));
	});
});

describe("batch task domain capabilities", () => {
	it("uses one stable id per batch task operation", () => {
		expect(Object.values(DOMAIN_BATCH_TASK_CAPABILITIES).map((capability) => capability.id)).toEqual([
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}batch-task.project.list`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}batch-task.project.get`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}batch-task.project.create`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}batch-task.project.update`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}batch-task.project.delete`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}batch-task.task.run`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}batch-task.task.retry`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}batch-task.task.stop`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}batch-task.task.delete`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}batch-task.task.resume`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}batch-task.task.resume-with-text`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}batch-task.task.session.delete`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}batch-task.project.task.delete-all`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}batch-task.project.start`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}batch-task.project.stop`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}batch-task.project.reset`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}batch-task.project.failed-task.reset`,
		]);
	});

	it("validates batch project data and preserves skill clearing", () => {
		expect(
			DOMAIN_BATCH_TASK_CAPABILITIES.CREATE_PROJECT.parseInput({
				data: {
					name: "Batch",
					prompt: "Process",
					folders: ["C:/source"],
					concurrency: 2,
					executionMode: BATCH_EXECUTION_MODES.SANDBOX,
				},
			}),
		).toEqual({
			data: {
				name: "Batch",
				prompt: "Process",
				folders: ["C:/source"],
				concurrency: 2,
				executionMode: BATCH_EXECUTION_MODES.SANDBOX,
			},
		});
		const update = DOMAIN_BATCH_TASK_CAPABILITIES.UPDATE_PROJECT.parseInput({
			projectId: "C:/workspace/Batch",
			data: { skill: null },
		});
		expect(update.data).toEqual({ skill: null });
		expect(() =>
			DOMAIN_BATCH_TASK_CAPABILITIES.CREATE_PROJECT.parseInput({
				data: { name: "Batch", prompt: "Process", folders: [], concurrency: 2 },
			}),
		).toThrowError(expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_INPUT }));
	});
});

describe("project domain capabilities", () => {
	it("uses one stable capability id per project operation", () => {
		expect(Object.values(DOMAIN_PROJECT_CAPABILITIES).map((capability) => capability.id)).toEqual([
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}project.list`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}project.create`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}project.open`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}project.rename`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}project.archive`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}project.unarchive`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}project.remove`,
		]);
	});

	it("validates project inputs and outputs at the contract boundary", () => {
		expect(() => DOMAIN_PROJECT_CAPABILITIES.CREATE.parseInput({ name: "../escape" })).not.toThrow();
		expect(() => DOMAIN_PROJECT_CAPABILITIES.CREATE.parseInput({ name: "" })).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_INPUT }),
		);
		expect(() => DOMAIN_PROJECT_CAPABILITIES.LIST.parseOutput({ workspacePath: "C:/workspace" })).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_OUTPUT }),
		);
	});
});

describe("session domain capabilities", () => {
	it("uses stable ids for session history and runtime project queries", () => {
		expect(Object.values(DOMAIN_SESSION_CAPABILITIES).map((capability) => capability.id)).toEqual([
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}session.list`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}session.runtime-project.list`,
		]);
	});

	it("validates session query inputs and outputs", () => {
		expect(DOMAIN_SESSION_CAPABILITIES.LIST.parseInput({ cwd: "C:/workspace" })).toEqual({
			cwd: "C:/workspace",
		});
		expect(() => DOMAIN_SESSION_CAPABILITIES.LIST.parseInput({ cwd: "" })).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_INPUT }),
		);
		expect(() =>
			DOMAIN_SESSION_CAPABILITIES.LIST_RUNTIME_PROJECTS.parseOutput([{ cwd: "C:/workspace", sessionCount: -1 }]),
		).toThrowError(expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_OUTPUT }));
		expect(() =>
			DOMAIN_SESSION_CAPABILITIES.LIST.parseOutput([
				{ id: "session", path: "C:/session.jsonl", cwd: "C:/workspace", firstMessage: "hello" },
			]),
		).toThrowError(expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_OUTPUT }));
	});
});

describe("skill domain capabilities", () => {
	it("uses one stable id per skill operation", () => {
		expect(Object.values(DOMAIN_SKILL_CAPABILITIES).map((capability) => capability.id)).toEqual([
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}skill.list`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}skill.installed.list`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}skill.installed.set-enabled`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}skill.installed.uninstall`,
		]);
	});

	it("validates skill queries, installed records, and mutations", () => {
		expect(DOMAIN_SKILL_CAPABILITIES.LIST.parseInput({ cwd: "C:/workspace" })).toEqual({ cwd: "C:/workspace" });
		expect(
			DOMAIN_SKILL_CAPABILITIES.LIST_INSTALLED.parseOutput({
				review: {
					name: "review",
					version: "1.0.0",
					installedAt: "2026-01-01T00:00:00.000Z",
					source: "market",
					enabled: true,
					type: SKILL_TYPES.SKILL,
				},
			}),
		).toHaveProperty("review.enabled", true);
		expect(() => DOMAIN_SKILL_CAPABILITIES.SET_ENABLED.parseInput({ name: "review", enabled: "yes" })).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_INPUT }),
		);
		expect(() => DOMAIN_SKILL_CAPABILITIES.UNINSTALL.parseInput({ name: "review", type: "other" })).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_INPUT }),
		);
	});
});

describe("shortcut and quick panel domain capabilities", () => {
	it("uses one stable id per shortcut and quick panel operation", () => {
		expect(Object.values(DOMAIN_SHORTCUT_CAPABILITIES).map((capability) => capability.id)).toEqual([
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}shortcut.settings.get`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}shortcut.binding.set`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}shortcut.binding.reset`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}shortcut.binding.reset-all`,
		]);
		expect(Object.values(DOMAIN_QUICK_PANEL_CAPABILITIES).map((capability) => capability.id)).toEqual([
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}quick-panel.trigger.set`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}quick-panel.post-send-behavior.set`,
		]);
	});

	it("validates shortcut settings and quick panel mutations", () => {
		expect(
			DOMAIN_SHORTCUT_CAPABILITIES.GET_SETTINGS.parseOutput({
				bindings: [
					{
						id: "new-session",
						defaultShortcut: "mod+n",
						shortcut: "mod+shift+n",
						isDefault: false,
					},
				],
				quickPanel: {
					trigger: QUICK_PANEL_TRIGGERS.MOD,
					postSendBehavior: QUICK_PANEL_POST_SEND_BEHAVIORS.BACKGROUND,
				},
			}),
		).toHaveProperty("bindings.0.id", "new-session");
		expect(DOMAIN_SHORTCUT_CAPABILITIES.SET_BINDING.parseInput({ id: "new-session", shortcut: "" })).toEqual({
			id: "new-session",
			shortcut: "",
		});
		expect(() =>
			DOMAIN_SHORTCUT_CAPABILITIES.SET_BINDING.parseInput({ id: "new-session", shortcut: false }),
		).toThrowError(expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_INPUT }));
		expect(() => DOMAIN_QUICK_PANEL_CAPABILITIES.SET_TRIGGER.parseInput({ trigger: "control" })).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_INPUT }),
		);
		expect(() =>
			DOMAIN_QUICK_PANEL_CAPABILITIES.SET_POST_SEND_BEHAVIOR.parseOutput({
				trigger: "none",
				postSendBehavior: "hidden",
			}),
		).toThrowError(expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_OUTPUT }));
	});
});

describe("download domain capabilities", () => {
	it("uses stable ids for listing and canceling downloads", () => {
		expect(Object.values(DOMAIN_DOWNLOAD_CAPABILITIES).map((capability) => capability.id)).toEqual([
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}download.list`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}download.cancel`,
		]);
	});

	it("validates download inputs and outputs", () => {
		expect(DOMAIN_DOWNLOAD_CAPABILITIES.CANCEL.parseInput({ id: "download" })).toEqual({ id: "download" });
		expect(() => DOMAIN_DOWNLOAD_CAPABILITIES.CANCEL.parseInput({ id: "" })).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_INPUT }),
		);
		expect(
			DOMAIN_DOWNLOAD_CAPABILITIES.LIST.parseOutput([
				{
					id: "download",
					url: "https://example.com/file",
					filename: "file",
					path: "C:/downloads/file",
					totalBytes: 10,
					receivedBytes: 5,
					status: DOWNLOAD_STATUSES.DOWNLOADING,
					createdAt: 1,
				},
			]),
		).toHaveLength(1);
		expect(() =>
			DOMAIN_DOWNLOAD_CAPABILITIES.LIST.parseOutput([
				{
					id: "download",
					url: "https://example.com/file",
					filename: "file",
					path: "C:/downloads/file",
					totalBytes: 10,
					receivedBytes: 5,
					status: "unknown",
					createdAt: 1,
				},
			]),
		).toThrowError(expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_OUTPUT }));
	});
});

describe("updater domain capabilities", () => {
	it("uses one stable id per updater operation", () => {
		expect(Object.values(DOMAIN_UPDATER_CAPABILITIES).map((capability) => capability.id)).toEqual([
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}updater.state.get`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}updater.current-version.get`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}updater.check`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}updater.download`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}updater.install`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}updater.dismiss`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}updater.cancel`,
		]);
	});

	it("validates updater states at the contract boundary", () => {
		expect(
			DOMAIN_UPDATER_CAPABILITIES.GET_STATE.parseOutput({
				phase: UPDATER_PHASES.DOWNLOADING,
				currentVersion: "1.0.0",
				latestVersion: "1.1.0",
				progress: 0.5,
				downloadedBytes: 5,
				totalBytes: 10,
				pendingInstall: false,
			}),
		).toEqual({
			phase: UPDATER_PHASES.DOWNLOADING,
			currentVersion: "1.0.0",
			latestVersion: "1.1.0",
			progress: 0.5,
			downloadedBytes: 5,
			totalBytes: 10,
			pendingInstall: false,
		});
		expect(() =>
			DOMAIN_UPDATER_CAPABILITIES.GET_STATE.parseOutput({
				phase: UPDATER_PHASES.DOWNLOADING,
				currentVersion: "1.0.0",
				progress: 2,
				pendingInstall: false,
			}),
		).toThrowError(expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_OUTPUT }));
	});
});

describe("knowledge domain capabilities", () => {
	it("uses one stable id per knowledge operation", () => {
		expect(Object.values(DOMAIN_KNOWLEDGE_CAPABILITIES).map((capability) => capability.id)).toEqual([
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}knowledge.base.list`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}knowledge.file-status.list`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}knowledge.processing.status.get`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}knowledge.processing.settings.get`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}knowledge.base.create`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}knowledge.base.rename`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}knowledge.base.delete`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}knowledge.entry.add-files`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}knowledge.entry.delete`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}knowledge.processing.scan`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}knowledge.processing.retry-failed`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}knowledge.processing.settings.set`,
		]);
	});

	it("validates knowledge mutations and preserves explicit model clearing", () => {
		const update = DOMAIN_KNOWLEDGE_CAPABILITIES.SET_PROCESSING_SETTINGS.parseInput({
			data: {
				processingModelKey: null,
				processingModelReasoningLevel: null,
				agentConcurrency: 4,
			},
		});
		expect(update.data).toEqual({
			processingModelKey: null,
			processingModelReasoningLevel: null,
			agentConcurrency: 4,
		});
		expect(() =>
			DOMAIN_KNOWLEDGE_CAPABILITIES.ADD_FILES.parseInput({ kbId: "default_kb", paths: [], move: false }),
		).not.toThrow();
		expect(() =>
			DOMAIN_KNOWLEDGE_CAPABILITIES.SET_PROCESSING_SETTINGS.parseInput({ data: { agentConcurrency: 0 } }),
		).toThrowError(expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_INPUT }));
	});
});

describe("scheduler domain capabilities", () => {
	it("uses one stable id per scheduler operation", () => {
		expect(Object.values(DOMAIN_SCHEDULER_CAPABILITIES).map((capability) => capability.id)).toEqual([
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}scheduler.task.list`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}scheduler.task.get`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}scheduler.task.history.list`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}scheduler.task.create`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}scheduler.task.update`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}scheduler.task.delete`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}scheduler.task.set-enabled`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}scheduler.task.run`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}scheduler.task.abort`,
		]);
	});

	it("validates scheduler inputs and preserves explicit optional-field clearing", () => {
		expect(
			DOMAIN_SCHEDULER_CAPABILITIES.CREATE_TASK.parseInput({
				data: {
					name: "Daily",
					prompt: "Run",
					cron: "0 9 * * *",
					isOnce: false,
					enabled: true,
					cwd: "C:/workspace",
					executionMode: SCHEDULER_EXECUTION_MODES.SANDBOX,
				},
			}),
		).toEqual({
			data: {
				name: "Daily",
				prompt: "Run",
				cron: "0 9 * * *",
				isOnce: false,
				enabled: true,
				cwd: "C:/workspace",
				executionMode: SCHEDULER_EXECUTION_MODES.SANDBOX,
			},
		});
		const update = DOMAIN_SCHEDULER_CAPABILITIES.UPDATE_TASK.parseInput({
			taskId: "task",
			data: { modelKey: undefined, skill: undefined },
		});
		expect(update.data).toHaveProperty("modelKey", undefined);
		expect(update.data).toHaveProperty("skill", undefined);
		expect(() => DOMAIN_SCHEDULER_CAPABILITIES.UPDATE_TASK.parseInput({ taskId: "task", data: {} })).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_INPUT }),
		);
	});
});

describe("webhook domain capabilities", () => {
	it("uses one stable id per webhook operation", () => {
		expect(Object.values(DOMAIN_WEBHOOK_CAPABILITIES).map((capability) => capability.id)).toEqual([
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}webhook.endpoint.list`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}webhook.provider.list`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}webhook.endpoint.create`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}webhook.endpoint.update`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}webhook.endpoint.delete`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}webhook.endpoint.set-enabled`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}webhook.endpoint.test`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}webhook.endpoint.send`,
		]);
	});

	it("validates webhook input and preserves an explicit secret clear", () => {
		expect(
			DOMAIN_WEBHOOK_CAPABILITIES.CREATE_ENDPOINT.parseInput({
				data: {
					kind: WEBHOOK_KINDS.FEISHU,
					name: "",
					webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/example",
				},
			}),
		).toEqual({
			data: {
				kind: WEBHOOK_KINDS.FEISHU,
				name: "",
				webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/example",
			},
		});
		const update = DOMAIN_WEBHOOK_CAPABILITIES.UPDATE_ENDPOINT.parseInput({
			id: "endpoint",
			data: { name: undefined, signSecret: "" },
		});
		expect(update.data).not.toHaveProperty("name");
		expect(update.data).toHaveProperty("signSecret", "");
		expect(() =>
			DOMAIN_WEBHOOK_CAPABILITIES.SEND_MESSAGE.parseInput({
				id: "endpoint",
				message: { text: "hello", level: "unknown" },
			}),
		).toThrowError(expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_INPUT }));
	});
});
