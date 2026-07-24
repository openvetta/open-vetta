import { describe, expect, it } from "vitest";
import type {
	AuthorizedCapabilityClient,
	CapabilityAccessHandle,
	CapabilityAccessSessionFactory,
	CapabilityAccessSessionOptions,
	CapabilityInvokeOptions,
} from "../src/access.js";
import { PLUGIN_CAPABILITY_PERMISSIONS, PluginCapabilityAdapter } from "../src/adapters/plugin.js";
import { CAPABILITY_ERROR_CODES, type CapabilityId, type CapabilityToken } from "../src/contracts.js";
import {
	DOMAIN_BATCH_TASK_CAPABILITIES,
	DOMAIN_DOWNLOAD_CAPABILITIES,
	DOMAIN_KNOWLEDGE_CAPABILITIES,
	DOMAIN_PROJECT_CAPABILITIES,
	DOMAIN_SCHEDULER_CAPABILITIES,
	DOMAIN_SESSION_CAPABILITIES,
	DOMAIN_UPDATER_CAPABILITIES,
	DOMAIN_WEBHOOK_CAPABILITIES,
} from "../src/domain.js";
import { FOUNDATION_FILESYSTEM_CAPABILITIES } from "../src/foundation.js";

class RecordingAccessFactory implements CapabilityAccessSessionFactory {
	readonly sessions: CapabilityAccessSessionOptions[] = [];

	createSession(options: CapabilityAccessSessionOptions): CapabilityAccessHandle {
		this.sessions.push(options);
		let revoked = false;
		const grants = new Set(options.grants.map((grant) => grant.capabilityId));
		const client: AuthorizedCapabilityClient = {
			invoke: async <Input, Output>(
				capability: CapabilityToken<Input, Output>,
				_input: Input,
				_options?: CapabilityInvokeOptions,
			): Promise<Output> => {
				if (revoked) throw new Error("revoked");
				if (!grants.has(capability.id)) throw new Error(`missing grant: ${capability.id}`);
				return capability.parseOutput(outputFor(capability.id));
			},
		};
		return {
			client,
			subject: options.subject,
			isRevoked: () => revoked,
			revoke: () => {
				revoked = true;
			},
		};
	}
}

function outputFor(capabilityId: CapabilityId): unknown {
	if (capabilityId === FOUNDATION_FILESYSTEM_CAPABILITIES.READ_DIRECTORY.id) return [];
	if (capabilityId === FOUNDATION_FILESYSTEM_CAPABILITIES.READ_FILE.id) {
		return { content: "data", encoding: "utf8" };
	}
	if (capabilityId === FOUNDATION_FILESYSTEM_CAPABILITIES.STAT.id) return null;
	if (capabilityId === FOUNDATION_FILESYSTEM_CAPABILITIES.LIST_FILES_RECURSIVE.id) return [];
	if (
		capabilityId === DOMAIN_BATCH_TASK_CAPABILITIES.LIST_PROJECTS.id ||
		capabilityId === DOMAIN_BATCH_TASK_CAPABILITIES.GET_PROJECT.id ||
		capabilityId === DOMAIN_BATCH_TASK_CAPABILITIES.CREATE_PROJECT.id ||
		capabilityId === DOMAIN_BATCH_TASK_CAPABILITIES.UPDATE_PROJECT.id
	) {
		const project = {
			id: "C:/workspace/Batch",
			name: "Batch",
			prompt: "Process",
			executionMode: "full-access",
			concurrency: 2,
			notifyEnabled: false,
			timeoutMinutes: 60,
			tasks: [],
			createdAt: 1,
			updatedAt: 1,
		};
		return capabilityId === DOMAIN_BATCH_TASK_CAPABILITIES.LIST_PROJECTS.id ? [project] : project;
	}
	if (Object.values(DOMAIN_BATCH_TASK_CAPABILITIES).some((capability) => capability.id === capabilityId)) {
		return {
			status: "accepted",
			projectId: "C:/workspace/Batch",
			affectedTaskIds: ["task"],
			queuedTaskIds: [],
		};
	}
	if (capabilityId === DOMAIN_PROJECT_CAPABILITIES.LIST.id) {
		return { workspacePath: "C:/workspace", projects: [], archivedProjects: [] };
	}
	if (capabilityId === DOMAIN_SESSION_CAPABILITIES.LIST.id) {
		return [
			{
				id: "session",
				path: "C:/workspace/.vetta/sessions/session.jsonl",
				cwd: "C:/workspace",
				firstMessage: "hello",
				modifiedAt: 1,
			},
		];
	}
	if (capabilityId === DOMAIN_SESSION_CAPABILITIES.LIST_RUNTIME_PROJECTS.id) {
		return [{ cwd: "C:/workspace", sessionCount: 1 }];
	}
	if (capabilityId === DOMAIN_DOWNLOAD_CAPABILITIES.LIST.id) {
		return [
			{
				id: "download",
				url: "https://example.com/file",
				filename: "file",
				path: "C:/downloads/file",
				totalBytes: 10,
				receivedBytes: 10,
				status: "completed",
				createdAt: 1,
				completedAt: 2,
			},
		];
	}
	if (capabilityId === DOMAIN_UPDATER_CAPABILITIES.GET_CURRENT_VERSION.id) return "1.0.0";
	if (
		capabilityId === DOMAIN_UPDATER_CAPABILITIES.GET_STATE.id ||
		capabilityId === DOMAIN_UPDATER_CAPABILITIES.CHECK.id ||
		capabilityId === DOMAIN_UPDATER_CAPABILITIES.DOWNLOAD.id
	) {
		return { phase: "idle", currentVersion: "1.0.0", pendingInstall: false };
	}
	if (capabilityId === DOMAIN_KNOWLEDGE_CAPABILITIES.LIST_BASES.id) {
		return [
			{
				id: "default_kb",
				name: "default_kb",
				updatedAt: 1,
				isDefault: true,
				nodes: [],
			},
		];
	}
	if (capabilityId === DOMAIN_KNOWLEDGE_CAPABILITIES.LIST_FILE_STATUSES.id) return {};
	if (capabilityId === DOMAIN_KNOWLEDGE_CAPABILITIES.GET_PROCESSING_STATUS.id) return false;
	if (
		capabilityId === DOMAIN_KNOWLEDGE_CAPABILITIES.GET_PROCESSING_SETTINGS.id ||
		capabilityId === DOMAIN_KNOWLEDGE_CAPABILITIES.SET_PROCESSING_SETTINGS.id
	) {
		return { enabled: true, pollIntervalMinutes: 5, agentConcurrency: 3, ocrConcurrency: 1 };
	}
	if (
		capabilityId === DOMAIN_KNOWLEDGE_CAPABILITIES.SCAN_NOW.id ||
		capabilityId === DOMAIN_KNOWLEDGE_CAPABILITIES.RETRY_FAILED.id
	) {
		return { skipped: true, reason: "no-model" };
	}
	if (
		capabilityId === DOMAIN_SCHEDULER_CAPABILITIES.LIST_TASKS.id ||
		capabilityId === DOMAIN_SCHEDULER_CAPABILITIES.GET_TASK.id ||
		capabilityId === DOMAIN_SCHEDULER_CAPABILITIES.CREATE_TASK.id ||
		capabilityId === DOMAIN_SCHEDULER_CAPABILITIES.UPDATE_TASK.id ||
		capabilityId === DOMAIN_SCHEDULER_CAPABILITIES.SET_ENABLED.id
	) {
		const task = {
			id: "task",
			name: "Daily",
			prompt: "Run",
			cron: "0 9 * * *",
			isOnce: false,
			enabled: true,
			cwd: "C:/workspace",
			createdAt: 1,
			updatedAt: 1,
			lastRunAt: null,
			lastRunStatus: null,
		};
		return capabilityId === DOMAIN_SCHEDULER_CAPABILITIES.LIST_TASKS.id ? [task] : task;
	}
	if (capabilityId === DOMAIN_SCHEDULER_CAPABILITIES.LIST_HISTORY.id) return [];
	if (
		capabilityId === DOMAIN_SCHEDULER_CAPABILITIES.DELETE_TASK.id ||
		capabilityId === DOMAIN_SCHEDULER_CAPABILITIES.RUN_TASK.id ||
		capabilityId === DOMAIN_SCHEDULER_CAPABILITIES.ABORT_TASK.id
	) {
		return { status: "accepted", taskId: "task" };
	}
	if (
		capabilityId === DOMAIN_PROJECT_CAPABILITIES.CREATE.id ||
		capabilityId === DOMAIN_PROJECT_CAPABILITIES.OPEN.id ||
		capabilityId === DOMAIN_PROJECT_CAPABILITIES.RENAME.id
	) {
		return { path: "C:/workspace/demo", name: "demo" };
	}
	if (capabilityId === DOMAIN_WEBHOOK_CAPABILITIES.LIST_ENDPOINTS.id) {
		return [
			{
				id: "endpoint",
				kind: "feishu",
				name: "Release",
				enabled: true,
				createdAt: "2026-01-01T00:00:00.000Z",
				updatedAt: "2026-01-01T00:00:00.000Z",
			},
		];
	}
	if (capabilityId === DOMAIN_WEBHOOK_CAPABILITIES.LIST_PROVIDERS.id) {
		return [{ kind: "feishu", displayName: "Feishu" }];
	}
	if (
		capabilityId === DOMAIN_WEBHOOK_CAPABILITIES.CREATE_ENDPOINT.id ||
		capabilityId === DOMAIN_WEBHOOK_CAPABILITIES.UPDATE_ENDPOINT.id ||
		capabilityId === DOMAIN_WEBHOOK_CAPABILITIES.SET_ENABLED.id
	) {
		return {
			id: "endpoint",
			kind: "feishu",
			name: "Release",
			enabled: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		};
	}
	if (
		capabilityId === DOMAIN_WEBHOOK_CAPABILITIES.TEST_ENDPOINT.id ||
		capabilityId === DOMAIN_WEBHOOK_CAPABILITIES.SEND_MESSAGE.id
	) {
		return { ok: true };
	}
	return undefined;
}

describe("PluginCapabilityAdapter", () => {
	it("maps plugin permissions to exact filesystem capability grants", async () => {
		const access = new RecordingAccessFactory();
		const adapter = new PluginCapabilityAdapter(access, {
			isOfficialPlugin: () => false,
			resolvePermissions: () => [PLUGIN_CAPABILITY_PERMISSIONS.FILESYSTEM_READ],
		});

		const sessionId = adapter.openSession("reader");
		const grantedIds = access.sessions[0]?.grants.map((grant) => grant.capabilityId);

		expect(grantedIds).toEqual([
			FOUNDATION_FILESYSTEM_CAPABILITIES.READ_DIRECTORY.id,
			FOUNDATION_FILESYSTEM_CAPABILITIES.READ_FILE.id,
			FOUNDATION_FILESYSTEM_CAPABILITIES.STAT.id,
			FOUNDATION_FILESYSTEM_CAPABILITIES.LIST_FILES_RECURSIVE.id,
		]);
		await expect(adapter.readFile(sessionId, "C:/project/file.txt")).resolves.toEqual({
			content: "data",
			encoding: "utf8",
		});
		expect(() => adapter.writeFile(sessionId, "C:/project/file.txt", "data")).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.ACCESS_DENIED }),
		);
	});

	it("checks current permissions on every invocation", () => {
		const access = new RecordingAccessFactory();
		let permissions: readonly string[] = [PLUGIN_CAPABILITY_PERMISSIONS.FILESYSTEM_READ];
		const adapter = new PluginCapabilityAdapter(access, {
			isOfficialPlugin: () => false,
			resolvePermissions: () => permissions,
		});
		const sessionId = adapter.openSession("revocable");

		permissions = [];

		expect(() => adapter.readFile(sessionId, "C:/project/file.txt")).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.ACCESS_DENIED }),
		);
	});

	it("revokes the previous session when the same plugin is opened again", () => {
		const access = new RecordingAccessFactory();
		const adapter = new PluginCapabilityAdapter(access, {
			isOfficialPlugin: () => false,
			resolvePermissions: () => [PLUGIN_CAPABILITY_PERMISSIONS.FILESYSTEM_READ],
		});
		const firstSessionId = adapter.openSession("reloadable");
		const secondSessionId = adapter.openSession("reloadable");

		expect(() => adapter.readFile(firstSessionId, "C:/project/file.txt")).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.SESSION_REVOKED }),
		);
		expect(() => adapter.readFile(secondSessionId, "C:/project/file.txt")).not.toThrow();

		adapter.closeSession(secondSessionId);
		expect(() => adapter.readFile(secondSessionId, "C:/project/file.txt")).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.SESSION_REVOKED }),
		);
	});

	it("allows empty file content", async () => {
		const access = new RecordingAccessFactory();
		const adapter = new PluginCapabilityAdapter(access, {
			isOfficialPlugin: () => false,
			resolvePermissions: () => [PLUGIN_CAPABILITY_PERMISSIONS.FILESYSTEM_WRITE],
		});
		const sessionId = adapter.openSession("writer");

		await expect(adapter.writeFile(sessionId, "C:/project/empty.txt", "")).resolves.toBeUndefined();
	});

	it("grants official domain capabilities only to official plugins and rechecks trust", async () => {
		const access = new RecordingAccessFactory();
		let official = true;
		const adapter = new PluginCapabilityAdapter(access, {
			isOfficialPlugin: () => official,
			resolvePermissions: () => [],
		});
		const sessionId = adapter.openSession("official");

		expect(access.sessions[0]?.grants.map((grant) => grant.capabilityId)).toEqual([
			...Object.values(DOMAIN_BATCH_TASK_CAPABILITIES).map((capability) => capability.id),
			...Object.values(DOMAIN_DOWNLOAD_CAPABILITIES).map((capability) => capability.id),
			...Object.values(DOMAIN_UPDATER_CAPABILITIES).map((capability) => capability.id),
			...Object.values(DOMAIN_KNOWLEDGE_CAPABILITIES).map((capability) => capability.id),
			...Object.values(DOMAIN_PROJECT_CAPABILITIES).map((capability) => capability.id),
			...Object.values(DOMAIN_SESSION_CAPABILITIES).map((capability) => capability.id),
			...Object.values(DOMAIN_SCHEDULER_CAPABILITIES).map((capability) => capability.id),
			...Object.values(DOMAIN_WEBHOOK_CAPABILITIES).map((capability) => capability.id),
		]);
		await expect(adapter.listBatchProjects(sessionId)).resolves.toHaveLength(1);
		await expect(adapter.resumeBatchTask(sessionId, "C:/workspace/Batch", "task")).resolves.toEqual({
			status: "accepted",
			projectId: "C:/workspace/Batch",
			affectedTaskIds: ["task"],
			queuedTaskIds: [],
		});
		await expect(adapter.listProjects(sessionId)).resolves.toEqual({
			workspacePath: "C:/workspace",
			projects: [],
			archivedProjects: [],
		});
		await expect(adapter.listSessions(sessionId, "C:/workspace")).resolves.toEqual([
			{
				id: "session",
				path: "C:/workspace/.vetta/sessions/session.jsonl",
				cwd: "C:/workspace",
				firstMessage: "hello",
				modifiedAt: 1,
			},
		]);
		await expect(adapter.listDownloads(sessionId)).resolves.toEqual([
			{
				id: "download",
				url: "https://example.com/file",
				filename: "file",
				path: "C:/downloads/file",
				totalBytes: 10,
				receivedBytes: 10,
				status: "completed",
				createdAt: 1,
				completedAt: 2,
			},
		]);
		await expect(adapter.cancelDownload(sessionId, "download")).resolves.toBeUndefined();
		await expect(adapter.getUpdaterState(sessionId)).resolves.toEqual({
			phase: "idle",
			currentVersion: "1.0.0",
			pendingInstall: false,
		});
		await expect(adapter.installUpdater(sessionId)).resolves.toBeUndefined();
		await expect(adapter.listKnowledgeBases(sessionId)).resolves.toHaveLength(1);
		await expect(adapter.setKnowledgeProcessing(sessionId, { processingModelKey: null })).resolves.toEqual({
			enabled: true,
			pollIntervalMinutes: 5,
			agentConcurrency: 3,
			ocrConcurrency: 1,
		});
		await expect(adapter.listScheduledTasks(sessionId)).resolves.toHaveLength(1);
		await expect(adapter.runScheduledTask(sessionId, "task")).resolves.toEqual({
			status: "accepted",
			taskId: "task",
		});
		await expect(adapter.listWebhookEndpoints(sessionId)).resolves.toHaveLength(1);
		await expect(adapter.sendWebhookMessage(sessionId, "endpoint", { text: "hello" })).resolves.toEqual({
			ok: true,
		});

		official = false;
		expect(() => adapter.listBatchProjects(sessionId)).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.ACCESS_DENIED }),
		);
		expect(() => adapter.listProjects(sessionId)).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.ACCESS_DENIED }),
		);
		expect(() => adapter.listRuntimeProjects(sessionId)).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.ACCESS_DENIED }),
		);
		expect(() => adapter.listKnowledgeBases(sessionId)).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.ACCESS_DENIED }),
		);
		expect(() => adapter.getUpdaterState(sessionId)).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.ACCESS_DENIED }),
		);
		expect(() => adapter.listScheduledTasks(sessionId)).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.ACCESS_DENIED }),
		);
		expect(() => adapter.listWebhookEndpoints(sessionId)).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.ACCESS_DENIED }),
		);
	});

	it("does not grant official domain capabilities to non-official plugins", () => {
		const access = new RecordingAccessFactory();
		const adapter = new PluginCapabilityAdapter(access, {
			isOfficialPlugin: () => false,
			resolvePermissions: () => [],
		});
		const sessionId = adapter.openSession("community");

		expect(access.sessions[0]?.grants).toEqual([]);
		expect(() => adapter.listBatchProjects(sessionId)).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.ACCESS_DENIED }),
		);
		expect(() => adapter.listProjects(sessionId)).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.ACCESS_DENIED }),
		);
		expect(() => adapter.listSessions(sessionId, "C:/workspace")).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.ACCESS_DENIED }),
		);
		expect(() => adapter.listDownloads(sessionId)).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.ACCESS_DENIED }),
		);
		expect(() => adapter.listKnowledgeBases(sessionId)).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.ACCESS_DENIED }),
		);
		expect(() => adapter.getUpdaterState(sessionId)).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.ACCESS_DENIED }),
		);
		expect(() => adapter.listScheduledTasks(sessionId)).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.ACCESS_DENIED }),
		);
		expect(() => adapter.listWebhookEndpoints(sessionId)).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.ACCESS_DENIED }),
		);
	});
});
