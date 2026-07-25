import { describe, expect, it } from "vitest";
import type {
	AuthorizedCapabilityClient,
	CapabilityAccessHandle,
	CapabilityAccessSessionFactory,
	CapabilityAccessSessionOptions,
	CapabilityInvokeOptions,
} from "../src/access.js";
import { CAPABILITY_CONSTRAINT_KINDS } from "../src/access.js";
import { PLUGIN_CAPABILITY_PERMISSIONS, PluginCapabilityAdapter } from "../src/adapters/plugin/index.js";
import { CAPABILITY_ERROR_CODES, type CapabilityId, type CapabilityToken } from "../src/contracts.js";
import {
	DOMAIN_AGENT_SETTINGS_CAPABILITIES,
	DOMAIN_BATCH_TASK_CAPABILITIES,
	DOMAIN_DOWNLOAD_CAPABILITIES,
	DOMAIN_GENERAL_SETTINGS_CAPABILITIES,
	DOMAIN_IM_CAPABILITIES,
	DOMAIN_KNOWLEDGE_CAPABILITIES,
	DOMAIN_MCP_CAPABILITIES,
	DOMAIN_MODEL_CAPABILITIES,
	DOMAIN_PROJECT_CAPABILITIES,
	DOMAIN_QUICK_PANEL_CAPABILITIES,
	DOMAIN_SCHEDULER_CAPABILITIES,
	DOMAIN_SESSION_CAPABILITIES,
	DOMAIN_SHORTCUT_CAPABILITIES,
	DOMAIN_SKILL_CAPABILITIES,
	DOMAIN_UPDATER_CAPABILITIES,
	DOMAIN_WEBHOOK_CAPABILITIES,
} from "../src/domain.js";
import {
	FOUNDATION_FILESYSTEM_CAPABILITIES,
	FOUNDATION_NETWORK_CAPABILITIES,
	FOUNDATION_STORAGE_CAPABILITIES,
} from "../src/foundation.js";

class RecordingAccessFactory implements CapabilityAccessSessionFactory {
	readonly invocations: Array<{ readonly capabilityId: CapabilityId; readonly input: unknown }> = [];
	readonly sessions: CapabilityAccessSessionOptions[] = [];

	createSession(options: CapabilityAccessSessionOptions): CapabilityAccessHandle {
		this.sessions.push(options);
		let revoked = false;
		const grants = new Set(options.grants.map((grant) => grant.capabilityId));
		const client: AuthorizedCapabilityClient = {
			invoke: async <Input, Output>(
				capability: CapabilityToken<Input, Output>,
				input: Input,
				_options?: CapabilityInvokeOptions,
			): Promise<Output> => {
				if (revoked) throw new Error("revoked");
				if (!grants.has(capability.id)) throw new Error(`missing grant: ${capability.id}`);
				this.invocations.push({ capabilityId: capability.id, input });
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
	if (capabilityId === FOUNDATION_NETWORK_CAPABILITIES.REQUEST.id) {
		return { status: 200, headers: {}, body: { ok: true } };
	}
	if (capabilityId === FOUNDATION_STORAGE_CAPABILITIES.READ_JSON.id) return { ok: true };
	if (capabilityId === FOUNDATION_STORAGE_CAPABILITIES.LIST.id) return ["records/item.json"];
	if (capabilityId === FOUNDATION_STORAGE_CAPABILITIES.READ_FILE.id) return "ZGF0YQ==";
	if (
		capabilityId === FOUNDATION_STORAGE_CAPABILITIES.PUT_BLOB.id ||
		capabilityId === FOUNDATION_STORAGE_CAPABILITIES.GET_BLOB_REF.id
	) {
		return { id: "blob", url: "vetta-media://local/blob", mimeType: "image/png" };
	}
	if (capabilityId === FOUNDATION_STORAGE_CAPABILITIES.READ_BLOB.id) {
		return { data: "ZGF0YQ==", mimeType: "image/png" };
	}
	if (
		capabilityId === DOMAIN_AGENT_SETTINGS_CAPABILITIES.GET_EXPERIMENTAL.id ||
		capabilityId === DOMAIN_AGENT_SETTINGS_CAPABILITIES.SET_EXPERIMENTAL.id
	) {
		return { vettaCli: true, promptPrediction: false, agentSkills: true };
	}
	if (capabilityId === DOMAIN_GENERAL_SETTINGS_CAPABILITIES.GET.id) {
		return {
			workspacePath: "C:/workspace",
			defaultExecutionMode: "full-access",
			notificationsEnabled: true,
			debugMode: false,
			sandbox: { status: "available", backend: "windows-host", platform: "win32" },
		};
	}
	if (capabilityId === DOMAIN_GENERAL_SETTINGS_CAPABILITIES.SET_NOTIFICATIONS.id) return { enabled: false };
	if (capabilityId === DOMAIN_GENERAL_SETTINGS_CAPABILITIES.SET_DEFAULT_EXECUTION_MODE.id) {
		return { mode: "sandbox" };
	}
	if (capabilityId === DOMAIN_GENERAL_SETTINGS_CAPABILITIES.SET_WORKSPACE.id) return { path: "C:/next" };
	const imRuntime = { transport: "online", activeSessions: 1, consecutiveStartFailures: 0 };
	if (capabilityId === DOMAIN_IM_CAPABILITIES.GET_STATUS.id) {
		return {
			enabled: true,
			transport: "feishu",
			agentModel: { provider: "openai", model: "gpt-5" },
			wechatBound: false,
			feishuAppId: "app-id",
			runtime: imRuntime,
		};
	}
	if (capabilityId === DOMAIN_IM_CAPABILITIES.LIST_LOGS.id) {
		return [{ level: "info", msg: "started", time: "2026-07-24T00:00:00.000Z" }];
	}
	if (
		capabilityId === DOMAIN_IM_CAPABILITIES.SET_ENABLED.id ||
		capabilityId === DOMAIN_IM_CAPABILITIES.RESTART.id ||
		capabilityId === DOMAIN_IM_CAPABILITIES.SET_AGENT_MODEL.id
	) {
		return imRuntime;
	}
	if (capabilityId === DOMAIN_MODEL_CAPABILITIES.LIST.id) {
		return {
			defaultModel: "openai/gpt-5",
			providers: [
				{
					id: "openai",
					displayName: "OpenAI",
					hasApiKey: true,
					modelCount: 1,
					models: [{ id: "gpt-5", reasoning: true }],
				},
			],
		};
	}
	if (capabilityId === DOMAIN_MODEL_CAPABILITIES.GET_CONFIG.id) {
		return {
			defaultModel: "openai/gpt-5",
			providers: { openai: { apiKey: "***", models: [{ id: "gpt-5" }] } },
		};
	}
	if (capabilityId === DOMAIN_MODEL_CAPABILITIES.GET_PROVIDER.id) {
		return { provider: "openai", apiKey: "***", models: [{ id: "gpt-5" }] };
	}
	if (capabilityId === DOMAIN_MODEL_CAPABILITIES.PROBE.id) return { ok: true };
	if (capabilityId === DOMAIN_MODEL_CAPABILITIES.SET_DEFAULT.id) return { defaultModel: "openai/gpt-5" };
	if (capabilityId === DOMAIN_MODEL_CAPABILITIES.UPSERT_PROVIDER.id) {
		return { apiKey: "***", models: [{ id: "gpt-5" }] };
	}
	if (capabilityId === DOMAIN_MCP_CAPABILITIES.LIST_SERVERS.id) {
		return [{ name: "web", type: "http", disabled: false, url: "https://mcp.example.com" }];
	}
	if (
		capabilityId === DOMAIN_MCP_CAPABILITIES.GET_SERVER.id ||
		capabilityId === DOMAIN_MCP_CAPABILITIES.UPSERT_SERVER.id
	) {
		return {
			name: "web",
			type: "http",
			disabled: false,
			url: "https://mcp.example.com",
			headers: { Authorization: "***" },
		};
	}
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
	if (capabilityId === DOMAIN_SKILL_CAPABILITIES.LIST.id) {
		return [{ name: "review", description: "Review changes", source: "market", type: "skill" }];
	}
	if (capabilityId === DOMAIN_SKILL_CAPABILITIES.LIST_INSTALLED.id) {
		return {
			review: {
				name: "review",
				version: "1.0.0",
				installedAt: "2026-01-01T00:00:00.000Z",
				source: "market",
				enabled: true,
				type: "skill",
			},
		};
	}
	if (capabilityId === DOMAIN_SKILL_CAPABILITIES.SET_ENABLED.id) return { name: "review", enabled: false };
	if (capabilityId === DOMAIN_SHORTCUT_CAPABILITIES.GET_SETTINGS.id) {
		return {
			bindings: [
				{
					id: "new-session",
					defaultShortcut: "mod+n",
					shortcut: "mod+n",
					isDefault: true,
				},
			],
			quickPanel: { trigger: "none", postSendBehavior: "foreground" },
		};
	}
	if (
		capabilityId === DOMAIN_SHORTCUT_CAPABILITIES.SET_BINDING.id ||
		capabilityId === DOMAIN_SHORTCUT_CAPABILITIES.RESET_ALL_BINDINGS.id
	) {
		return { bindings: [] };
	}
	if (capabilityId === DOMAIN_SHORTCUT_CAPABILITIES.RESET_BINDING.id) {
		return { bindings: [], shortcut: "mod+n" };
	}
	if (Object.values(DOMAIN_QUICK_PANEL_CAPABILITIES).some((capability) => capability.id === capabilityId)) {
		return { trigger: "mod", postSendBehavior: "foreground" };
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
			FOUNDATION_FILESYSTEM_CAPABILITIES.READ_BINARY_FILE.id,
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

	it("maps network and namespaced storage permissions to exact capability grants", async () => {
		const access = new RecordingAccessFactory();
		let permissions: readonly string[] = [
			PLUGIN_CAPABILITY_PERMISSIONS.NETWORK_FETCH,
			PLUGIN_CAPABILITY_PERMISSIONS.STORAGE_READ,
			PLUGIN_CAPABILITY_PERMISSIONS.STORAGE_WRITE,
		];
		const adapter = new PluginCapabilityAdapter(access, {
			isOfficialPlugin: () => false,
			resolvePermissions: () => permissions,
		});

		const sessionId = adapter.openSession("storage-user");
		const namespaceConstraint = {
			kind: CAPABILITY_CONSTRAINT_KINDS.NAMESPACE,
			value: "storage-user",
		};

		expect(access.sessions[0]?.grants).toEqual([
			{ capabilityId: FOUNDATION_NETWORK_CAPABILITIES.REQUEST.id },
			{
				capabilityId: FOUNDATION_STORAGE_CAPABILITIES.READ_JSON.id,
				constraints: [namespaceConstraint],
			},
			{
				capabilityId: FOUNDATION_STORAGE_CAPABILITIES.LIST.id,
				constraints: [namespaceConstraint],
			},
			{
				capabilityId: FOUNDATION_STORAGE_CAPABILITIES.READ_FILE.id,
				constraints: [namespaceConstraint],
			},
			{
				capabilityId: FOUNDATION_STORAGE_CAPABILITIES.READ_BLOB.id,
				constraints: [namespaceConstraint],
			},
			{
				capabilityId: FOUNDATION_STORAGE_CAPABILITIES.GET_BLOB_REF.id,
				constraints: [namespaceConstraint],
			},
			{
				capabilityId: FOUNDATION_STORAGE_CAPABILITIES.WRITE_JSON.id,
				constraints: [namespaceConstraint],
			},
			{
				capabilityId: FOUNDATION_STORAGE_CAPABILITIES.WRITE_FILE.id,
				constraints: [namespaceConstraint],
			},
			{
				capabilityId: FOUNDATION_STORAGE_CAPABILITIES.PUT_BLOB.id,
				constraints: [namespaceConstraint],
			},
		]);

		await expect(adapter.requestNetwork(sessionId, { url: "https://example.com" })).resolves.toHaveProperty(
			"status",
			200,
		);
		await expect(adapter.readStorageJson(sessionId, "records/item.json")).resolves.toEqual({ ok: true });
		await expect(adapter.writeStorageJson(sessionId, "records/item.json", { ok: true })).resolves.toBeUndefined();
		await expect(
			adapter.putStorageBlob(sessionId, { id: "blob", data: "ZGF0YQ==", mimeType: "image/png" }),
		).resolves.toHaveProperty("id", "blob");

		expect(access.invocations).toEqual([
			{
				capabilityId: FOUNDATION_NETWORK_CAPABILITIES.REQUEST.id,
				input: { request: { url: "https://example.com" } },
			},
			{
				capabilityId: FOUNDATION_STORAGE_CAPABILITIES.READ_JSON.id,
				input: { namespace: "storage-user", key: "records/item.json" },
			},
			{
				capabilityId: FOUNDATION_STORAGE_CAPABILITIES.WRITE_JSON.id,
				input: { namespace: "storage-user", key: "records/item.json", value: { ok: true } },
			},
			{
				capabilityId: FOUNDATION_STORAGE_CAPABILITIES.PUT_BLOB.id,
				input: {
					namespace: "storage-user",
					blob: { id: "blob", data: "ZGF0YQ==", mimeType: "image/png" },
				},
			},
		]);

		permissions = [];
		expect(() => adapter.readStorageJson(sessionId, "records/item.json")).toThrowError(
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

		expect(() => adapter.assertOfficialSession(sessionId)).not.toThrow();
		expect(access.sessions[0]?.grants.map((grant) => grant.capabilityId)).toEqual([
			...Object.values(DOMAIN_AGENT_SETTINGS_CAPABILITIES).map((capability) => capability.id),
			...Object.values(DOMAIN_GENERAL_SETTINGS_CAPABILITIES).map((capability) => capability.id),
			...Object.values(DOMAIN_IM_CAPABILITIES).map((capability) => capability.id),
			...Object.values(DOMAIN_MODEL_CAPABILITIES).map((capability) => capability.id),
			...Object.values(DOMAIN_MCP_CAPABILITIES).map((capability) => capability.id),
			...Object.values(DOMAIN_BATCH_TASK_CAPABILITIES).map((capability) => capability.id),
			...Object.values(DOMAIN_DOWNLOAD_CAPABILITIES).map((capability) => capability.id),
			...Object.values(DOMAIN_UPDATER_CAPABILITIES).map((capability) => capability.id),
			...Object.values(DOMAIN_KNOWLEDGE_CAPABILITIES).map((capability) => capability.id),
			...Object.values(DOMAIN_PROJECT_CAPABILITIES).map((capability) => capability.id),
			...Object.values(DOMAIN_SESSION_CAPABILITIES).map((capability) => capability.id),
			...Object.values(DOMAIN_SKILL_CAPABILITIES).map((capability) => capability.id),
			...Object.values(DOMAIN_SHORTCUT_CAPABILITIES).map((capability) => capability.id),
			...Object.values(DOMAIN_QUICK_PANEL_CAPABILITIES).map((capability) => capability.id),
			...Object.values(DOMAIN_SCHEDULER_CAPABILITIES).map((capability) => capability.id),
			...Object.values(DOMAIN_WEBHOOK_CAPABILITIES).map((capability) => capability.id),
		]);
		await expect(adapter.getAgentExperimental(sessionId)).resolves.toEqual({
			vettaCli: true,
			promptPrediction: false,
			agentSkills: true,
		});
		await expect(adapter.setAgentExperimental(sessionId, { promptPrediction: true })).resolves.toEqual({
			vettaCli: true,
			promptPrediction: false,
			agentSkills: true,
		});
		await expect(adapter.getGeneralSettings(sessionId)).resolves.toHaveProperty("workspacePath", "C:/workspace");
		await expect(adapter.setNotifications(sessionId, false)).resolves.toEqual({ enabled: false });
		await expect(adapter.setDefaultExecutionMode(sessionId, "sandbox")).resolves.toEqual({ mode: "sandbox" });
		await expect(adapter.setWorkspace(sessionId, "C:/next")).resolves.toEqual({ path: "C:/next" });
		await expect(adapter.getImStatus(sessionId)).resolves.toHaveProperty("transport", "feishu");
		await expect(adapter.listImLogs(sessionId, 50)).resolves.toHaveLength(1);
		await expect(adapter.setImEnabled(sessionId, true)).resolves.toEqual({
			transport: "online",
			activeSessions: 1,
			consecutiveStartFailures: 0,
		});
		await expect(adapter.restartIm(sessionId)).resolves.toHaveProperty("transport", "online");
		await expect(adapter.setImAgentModel(sessionId, "openai/gpt-5", "high")).resolves.toHaveProperty(
			"transport",
			"online",
		);
		expect(() => adapter.setImAgentModel(sessionId, "invalid", "high")).toThrowError(
			"IM agent model key must use the provider/model format",
		);
		await expect(adapter.listModels(sessionId)).resolves.toHaveProperty("defaultModel", "openai/gpt-5");
		await expect(adapter.getModelProvider(sessionId, "openai")).resolves.toHaveProperty("apiKey", "***");
		await expect(adapter.validateModelKey(sessionId, "openai/gpt-5")).resolves.toBeUndefined();
		await expect(adapter.setDefaultModel(sessionId, "openai/gpt-5")).resolves.toEqual({
			defaultModel: "openai/gpt-5",
		});
		await expect(adapter.listMcpServers(sessionId)).resolves.toEqual([
			{ name: "web", type: "http", disabled: false, url: "https://mcp.example.com" },
		]);
		await expect(adapter.getMcpServer(sessionId, "web")).resolves.toHaveProperty("headers.Authorization", "***");
		await expect(
			adapter.upsertMcpServer(sessionId, "web", { type: "http", url: "https://mcp.example.com" }),
		).resolves.toHaveProperty("name", "web");
		await expect(adapter.setMcpServerEnabled(sessionId, "web", true)).resolves.toBeUndefined();
		await expect(adapter.removeMcpServer(sessionId, "web")).resolves.toBeUndefined();
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
		await expect(adapter.listSkills(sessionId, "C:/workspace")).resolves.toHaveLength(1);
		await expect(adapter.setSkillEnabled(sessionId, "review", false)).resolves.toEqual({
			name: "review",
			enabled: false,
		});
		await expect(adapter.uninstallSkill(sessionId, "review")).resolves.toBeUndefined();
		await expect(adapter.getShortcutSettings(sessionId)).resolves.toHaveProperty(
			"quickPanel.postSendBehavior",
			"foreground",
		);
		await expect(adapter.setShortcutBinding(sessionId, "new-session", "mod+shift+n")).resolves.toEqual({
			bindings: [],
		});
		await expect(adapter.resetShortcutBinding(sessionId, "new-session")).resolves.toEqual({
			bindings: [],
			shortcut: "mod+n",
		});
		await expect(adapter.resetAllShortcutBindings(sessionId)).resolves.toEqual({ bindings: [] });
		await expect(adapter.setQuickPanelTrigger(sessionId, "mod")).resolves.toEqual({
			trigger: "mod",
			postSendBehavior: "foreground",
		});
		await expect(adapter.setQuickPanelPostSendBehavior(sessionId, "background")).resolves.toEqual({
			trigger: "mod",
			postSendBehavior: "foreground",
		});
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
		expect(() => adapter.assertOfficialSession(sessionId)).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.ACCESS_DENIED }),
		);
		expect(() => adapter.getAgentExperimental(sessionId)).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.ACCESS_DENIED }),
		);
		expect(() => adapter.getGeneralSettings(sessionId)).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.ACCESS_DENIED }),
		);
		expect(() => adapter.getImStatus(sessionId)).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.ACCESS_DENIED }),
		);
		expect(() => adapter.listModels(sessionId)).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.ACCESS_DENIED }),
		);
		expect(() => adapter.listMcpServers(sessionId)).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.ACCESS_DENIED }),
		);
		expect(() => adapter.listBatchProjects(sessionId)).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.ACCESS_DENIED }),
		);
		expect(() => adapter.listProjects(sessionId)).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.ACCESS_DENIED }),
		);
		expect(() => adapter.listRuntimeProjects(sessionId)).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.ACCESS_DENIED }),
		);
		expect(() => adapter.listSkills(sessionId)).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.ACCESS_DENIED }),
		);
		expect(() => adapter.getShortcutSettings(sessionId)).toThrowError(
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
		expect(() => adapter.assertOfficialSession(sessionId)).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.ACCESS_DENIED }),
		);
		expect(() => adapter.getAgentExperimental(sessionId)).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.ACCESS_DENIED }),
		);
		expect(() => adapter.getGeneralSettings(sessionId)).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.ACCESS_DENIED }),
		);
		expect(() => adapter.getImStatus(sessionId)).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.ACCESS_DENIED }),
		);
		expect(() => adapter.listModels(sessionId)).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.ACCESS_DENIED }),
		);
		expect(() => adapter.listMcpServers(sessionId)).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.ACCESS_DENIED }),
		);
		expect(() => adapter.listBatchProjects(sessionId)).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.ACCESS_DENIED }),
		);
		expect(() => adapter.listProjects(sessionId)).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.ACCESS_DENIED }),
		);
		expect(() => adapter.listSessions(sessionId, "C:/workspace")).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.ACCESS_DENIED }),
		);
		expect(() => adapter.listSkills(sessionId)).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.ACCESS_DENIED }),
		);
		expect(() => adapter.getShortcutSettings(sessionId)).toThrowError(
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
