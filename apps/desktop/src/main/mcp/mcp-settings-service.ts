import { readFile, stat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { getVettaHomePath } from "@vetta/action-rpc";
import { CONFIG_DIR_NAME } from "@vetta/coding-agent/config";
import { FileMcpConfigSource } from "@vetta/runtime-node/mcp";
import { isSshProjectUri } from "@vetta/ssh-transport";
import { atomicWriteJSON } from "@vetta/toolkit/atomic-write";
import type { McpScope, McpServerDetail, McpServerSummary, McpServerUpsertData } from "@vetta-org/capability-sdk";
import type { AppMonitorEvent, AppMonitorResourceSource } from "../../preload/api-types/app-monitor.js";
import type {
	McpConfigData,
	McpHttpServerConfigData,
	McpServerConfigData,
	McpStdioServerConfigData,
} from "../../preload/api-types/mcp.js";
import { recordAbilityInstall, removeAbilityLedgerEntry } from "../abilities/ability-ledger.js";
import { stopOpenMarketplaceManagedMcpRuntime } from "../abilities/open-marketplace/open-marketplace-mcp-runtime-host.js";
import { recordAppMonitorEvent } from "../app-monitor/app-monitor-service.js";
import { validateMcpConfig } from "../mcp-config-validation.js";
import { ensureMcpFileMigrations } from "./migrations/index.js";

/** 配置落在哪个文件：全局 `agent/mcp.json`，或项目根下的 `.vetta/mcp.json`。 */
export type McpConfigTarget = { readonly scope: "global" } | { readonly scope: "project"; readonly cwd: string };

/** 调用方传入的目标：什么都不传是全局；只给 `cwd` 表示「也看看这个项目」，读操作按名字自动定位。 */
export interface McpTargetInput {
	readonly scope?: McpScope;
	readonly cwd?: string;
}

const GLOBAL_TARGET: McpConfigTarget = { scope: "global" };

export interface McpSettingsServiceOptions {
	readonly readConfig: (target: McpConfigTarget) => Promise<McpConfigData>;
	readonly writeConfig: (config: McpConfigData, target: McpConfigTarget) => Promise<void>;
	/** 项目根 `.mcp.json` 里的 server（只读，不属于任何可写目标）。 */
	readonly readCompatConfig?: (cwd: string) => Promise<McpConfigData>;
	readonly recordEvent?: (event: Extract<AppMonitorEvent, { type: "resource.lifecycle" }>) => void;
}

const MCP_CONFIG_PATH = join(getVettaHomePath(), "agent", "mcp.json");
const DEFAULT_MCP_CONFIG: McpConfigData = { mcpServers: {} };

/** 项目根必须是本机已存在的绝对路径目录；远程项目没有可写的本机文件。 */
async function assertLocalProjectRoot(cwd: string): Promise<void> {
	if (isSshProjectUri(cwd)) throw new Error("Project-level MCP config is not supported for remote projects.");
	if (!isAbsolute(cwd)) throw new Error(`Project root must be an absolute path: ${cwd}`);
	const info = await stat(cwd).catch(() => undefined);
	if (!info?.isDirectory()) throw new Error(`Project root is not a directory: ${cwd}`);
}

function projectConfigPath(cwd: string): string {
	return join(cwd, CONFIG_DIR_NAME, "mcp.json");
}

async function readConfigFile(path: string): Promise<McpConfigData> {
	try {
		return validateMcpConfig(JSON.parse(await readFile(path, "utf8")));
	} catch {
		return { ...DEFAULT_MCP_CONFIG };
	}
}

export async function readMcpConfig(target: McpConfigTarget = GLOBAL_TARGET): Promise<McpConfigData> {
	if (target.scope === "project") return readConfigFile(projectConfigPath(target.cwd));
	try {
		await ensureMcpFileMigrations();
	} catch {
		// Keep the existing tolerant read contract. A failed migration is retried on the next app launch.
	}
	return readConfigFile(MCP_CONFIG_PATH);
}

export async function writeMcpConfig(config: McpConfigData, target: McpConfigTarget = GLOBAL_TARGET): Promise<void> {
	const next = validateMcpConfig(config);
	if (target.scope === "project") {
		await assertLocalProjectRoot(target.cwd);
		atomicWriteJSON(projectConfigPath(target.cwd), next);
		return;
	}
	const previous = await readMcpConfig();
	atomicWriteJSON(MCP_CONFIG_PATH, next);
	await stopUnusedManagedMcpRuntimes(previous, next, stopOpenMarketplaceManagedMcpRuntime);
}

/** 只取 `.mcp.json` 一侧：把 `.vetta/mcp.json` 指向不存在的路径，加载器就只返回兼容文件的内容。 */
export async function readCompatMcpConfig(cwd: string): Promise<McpConfigData> {
	if (isSshProjectUri(cwd) || !isAbsolute(cwd)) return { ...DEFAULT_MCP_CONFIG };
	const source = new FileMcpConfigSource({
		globalConfigPath: "",
		projectConfigPath: "",
		compatProjectConfigPath: join(cwd, ".mcp.json"),
		projectRoot: cwd,
		environment: {},
	});
	const servers: McpConfigData["mcpServers"] = {};
	for (const [name, server] of Object.entries(source.loadProject()?.mcpServers ?? {})) {
		// 外部文件可能带有 Vetta 不认识的字段：逐个校验，认不出的只影响自己。
		try {
			Object.assign(servers, validateMcpConfig({ mcpServers: { [name]: server } }).mcpServers);
		} catch {
			// 与加载器一致：无法识别的条目不进入列表。
		}
	}
	return { mcpServers: servers };
}

export async function stopUnusedManagedMcpRuntimes(
	previous: McpConfigData,
	next: McpConfigData,
	stop: (runtimeId: string) => Promise<void>,
): Promise<void> {
	const activeIds = new Set(
		Object.values(next.mcpServers).flatMap((server) =>
			server.type === "http" && server.managedRuntimeId && !server.disabled ? [server.managedRuntimeId] : [],
		),
	);
	const previousIds = new Set(
		Object.values(previous.mcpServers).flatMap((server) =>
			server.type === "http" && server.managedRuntimeId ? [server.managedRuntimeId] : [],
		),
	);
	await Promise.all([...previousIds].filter((id) => !activeIds.has(id)).map(stop));
}

function redactRecordSecrets(
	record: Record<string, string> | undefined,
	secretKeys: readonly string[],
): Record<string, string> | undefined {
	if (!record) return undefined;
	const next: Record<string, string> = {};
	for (const [key, value] of Object.entries(record)) {
		const lower = key.toLowerCase();
		next[key] = secretKeys.some((secretKey) => lower.includes(secretKey)) ? "***" : value;
	}
	return next;
}

interface McpServerOrigin {
	readonly scope?: McpScope;
	readonly readOnly?: boolean;
}

function originFields(origin: McpServerOrigin | undefined): McpServerOrigin {
	return {
		...(origin?.scope === undefined ? {} : { scope: origin.scope }),
		...(origin?.readOnly ? { readOnly: true } : {}),
	};
}

function redactServer(name: string, server: McpServerConfigData, origin?: McpServerOrigin): McpServerDetail {
	const common = {
		name,
		disabled: Boolean(server.disabled),
		...originFields(origin),
		...(server.autoApprove === undefined ? {} : { autoApprove: [...server.autoApprove] }),
		...(server.startupTimeout === undefined ? {} : { startupTimeout: server.startupTimeout }),
		...(server.debug === undefined ? {} : { debug: server.debug }),
	};
	if (server.type === "http") {
		const headers = redactRecordSecrets(server.headers, [
			"authorization",
			"api-key",
			"apikey",
			"x-api-key",
			"token",
			"secret",
			"password",
		]);
		return {
			...common,
			type: "http",
			url: server.url,
			...(headers === undefined ? {} : { headers }),
		};
	}
	const env = redactRecordSecrets(server.env, ["token", "key", "secret", "password", "authorization"]);
	return {
		...common,
		type: "stdio",
		command: server.command,
		...(server.args === undefined ? {} : { args: [...server.args] }),
		...(env === undefined ? {} : { env }),
		...(server.cwd === undefined ? {} : { cwd: server.cwd }),
	};
}

function summarize(name: string, server: McpServerConfigData, origin?: McpServerOrigin): McpServerSummary {
	return {
		name,
		type: server.type === "http" ? "http" : "stdio",
		disabled: Boolean(server.disabled),
		...(server.type === "http" ? { url: server.url } : { command: server.command }),
		...originFields(origin),
	};
}

/** 只有显式 `scope` 才决定写到哪里；`scope: "project"` 缺少项目根时拒绝，不静默退回全局。 */
function explicitTarget(input: McpTargetInput | undefined): McpConfigTarget | undefined {
	if (input?.scope === "project") {
		if (!input.cwd) throw new Error('scope "project" requires cwd (the project root).');
		return { scope: "project", cwd: input.cwd };
	}
	if (input?.scope === "global") return GLOBAL_TARGET;
	return undefined;
}

const COMPAT_READ_ONLY_MESSAGE = (name: string) =>
	`MCP server "${name}" is defined in the project's .mcp.json, which Vetta does not modify. Edit that file directly.`;

export class McpSettingsService {
	private mutationQueue: Promise<void> = Promise.resolve();

	constructor(private readonly options: McpSettingsServiceOptions) {}

	async getConfig(target: McpConfigTarget = GLOBAL_TARGET): Promise<McpConfigData> {
		await this.mutationQueue;
		return this.options.readConfig(target);
	}

	async replaceConfig(config: unknown): Promise<void> {
		await this.runMutation(async () => {
			await this.options.writeConfig(validateMcpConfig(config), GLOBAL_TARGET);
		});
	}

	/**
	 * 不传目标只列全局（返回形状不变）；给出 `scope` 列该层；只给 `cwd` 则全局加项目一起列，
	 * 并标明每项的来源，项目根 `.mcp.json` 里的条目标为只读。
	 */
	async list(input?: McpTargetInput): Promise<McpServerSummary[]> {
		const explicit = explicitTarget(input);
		if (!explicit && !input?.cwd) {
			return Object.entries((await this.getConfig()).mcpServers).map(([name, server]) => summarize(name, server));
		}
		const targets: McpConfigTarget[] = explicit
			? [explicit]
			: [GLOBAL_TARGET, { scope: "project", cwd: input?.cwd as string }];
		const listed: McpServerSummary[] = [];
		const seenProject = new Set<string>();
		for (const target of targets) {
			const config = await this.getConfig(target);
			for (const [name, server] of Object.entries(config.mcpServers)) {
				listed.push(summarize(name, server, { scope: target.scope }));
				if (target.scope === "project") seenProject.add(name);
			}
			if (target.scope === "project") {
				const compat = await this.options.readCompatConfig?.(target.cwd);
				for (const [name, server] of Object.entries(compat?.mcpServers ?? {})) {
					if (!seenProject.has(name)) listed.push(summarize(name, server, { scope: "project", readOnly: true }));
				}
			}
		}
		return listed;
	}

	async get(name: string, input?: McpTargetInput): Promise<McpServerDetail> {
		await this.mutationQueue;
		const found = await this.locate(name, input);
		return redactServer(name, found.server, found.origin);
	}

	/**
	 * @param options.abilityVersion 市场能力的版本号；给出时写入能力安装台账（ADR-0049）。
	 * 用户手工添加的 server 不是市场能力，不传则不进台账。台账只记录全局安装，项目层不写。
	 */
	async upsert(
		name: string,
		data: McpServerUpsertData,
		options?: { abilityVersion?: string } & McpTargetInput,
	): Promise<McpServerDetail> {
		return this.runMutation(async () => {
			const target = explicitTarget(options) ?? GLOBAL_TARGET;
			const config = await this.options.readConfig(target);
			const existing = config.mcpServers[name];
			let next: McpServerConfigData;
			if (data.type === "http") {
				const previous = existing?.type === "http" ? existing : undefined;
				const url = data.url ?? previous?.url;
				if (!url) throw new Error("HTTP MCP server requires url.");
				next = {
					...(previous ?? {}),
					...data,
					type: "http",
					url,
					...(data.headers === undefined ? {} : { headers: { ...data.headers } }),
					...(data.autoApprove === undefined ? {} : { autoApprove: [...data.autoApprove] }),
				} satisfies McpHttpServerConfigData;
			} else {
				const previous = existing && existing.type !== "http" ? existing : undefined;
				const command = data.command ?? previous?.command;
				if (!command) throw new Error("stdio MCP server requires command.");
				next = {
					...(previous ?? {}),
					...data,
					type: data.type,
					command,
					...(data.args === undefined ? {} : { args: [...data.args] }),
					...(data.env === undefined ? {} : { env: { ...data.env } }),
					...(data.autoApprove === undefined ? {} : { autoApprove: [...data.autoApprove] }),
				} satisfies McpStdioServerConfigData;
			}
			await this.options.writeConfig(
				validateMcpConfig({
					mcpServers: { ...config.mcpServers, [name]: next },
				}),
				target,
			);
			if (options?.abilityVersion && target.scope === "global")
				recordAbilityInstall("mcp", name, options.abilityVersion);
			this.recordLifecycle(
				name,
				existing ? "updated" : "installed",
				options?.abilityVersion ? "market" : existing ? undefined : "custom",
			);
			return redactServer(name, next, explicitTarget(options) ? { scope: target.scope } : undefined);
		});
	}

	async setEnabled(name: string, enabled: boolean, input?: McpTargetInput): Promise<void> {
		await this.runMutation(async () => {
			const found = await this.locate(name, input, { forWrite: true });
			const wasEnabled = !found.server.disabled;
			await this.options.writeConfig(
				validateMcpConfig({
					mcpServers: {
						...found.config.mcpServers,
						[name]: { ...found.server, disabled: !enabled },
					},
				}),
				found.target,
			);
			if (wasEnabled !== enabled) this.recordLifecycle(name, enabled ? "enabled" : "disabled");
		});
	}

	async remove(name: string, input?: McpTargetInput): Promise<void> {
		await this.runMutation(async () => {
			const found = await this.locate(name, input, { forWrite: true });
			const mcpServers = { ...found.config.mcpServers };
			delete mcpServers[name];
			await this.options.writeConfig({ mcpServers }, found.target);
			if (found.target.scope === "global") removeAbilityLedgerEntry("mcp", name);
			this.recordLifecycle(name, "uninstalled");
		});
	}

	/**
	 * 按名字定位 server 所在的文件。显式 `scope` 只看那一层；只给 `cwd` 时先看项目再看全局，
	 * 两处同名则要求调用方指明，避免误改。项目根 `.mcp.json` 的条目只可读。
	 */
	private async locate(
		name: string,
		input: McpTargetInput | undefined,
		access: { readonly forWrite?: boolean } = {},
	): Promise<{
		readonly target: McpConfigTarget;
		readonly config: McpConfigData;
		readonly server: McpServerConfigData;
		readonly origin: McpServerOrigin | undefined;
	}> {
		const explicit = explicitTarget(input);
		const projectTarget: McpConfigTarget | undefined =
			explicit?.scope === "project"
				? explicit
				: !explicit && input?.cwd
					? { scope: "project", cwd: input.cwd }
					: undefined;
		const candidates: McpConfigTarget[] = explicit
			? [explicit]
			: projectTarget
				? [projectTarget, GLOBAL_TARGET]
				: [GLOBAL_TARGET];
		const hits: { target: McpConfigTarget; config: McpConfigData; server: McpServerConfigData }[] = [];
		for (const target of candidates) {
			// 写操作在互斥队列里调用本方法，这里不能再经 getConfig 等待队列。
			const config = await this.options.readConfig(target);
			const server = config.mcpServers[name];
			if (server) hits.push({ target, config, server });
		}
		if (hits.length > 1) {
			throw new Error(`MCP server "${name}" exists in both global and project config; pass scope to choose one.`);
		}
		const hit = hits[0];
		if (hit) return { ...hit, origin: explicit || projectTarget ? { scope: hit.target.scope } : undefined };
		if (projectTarget?.scope === "project") {
			const compat = await this.options.readCompatConfig?.(projectTarget.cwd);
			const server = compat?.mcpServers[name];
			if (server) {
				if (access.forWrite) throw new Error(COMPAT_READ_ONLY_MESSAGE(name));
				return {
					target: projectTarget,
					config: compat as McpConfigData,
					server,
					origin: { scope: "project", readOnly: true },
				};
			}
		}
		throw new Error(`MCP server not found: ${name}`);
	}

	private recordLifecycle(
		resourceId: string,
		operation: "installed" | "updated" | "uninstalled" | "enabled" | "disabled",
		source?: AppMonitorResourceSource,
	): void {
		try {
			this.options.recordEvent?.({
				type: "resource.lifecycle",
				resourceKind: "mcp",
				resourceId,
				operation,
				...(source ? { source } : {}),
			});
		} catch {
			// Monitoring and logging must not affect MCP configuration changes.
		}
	}

	private runMutation<Result>(mutation: () => Promise<Result>): Promise<Result> {
		const result = this.mutationQueue.then(mutation, mutation);
		this.mutationQueue = result.then(
			() => undefined,
			() => undefined,
		);
		return result;
	}
}

let desktopMcpSettingsService: McpSettingsService | undefined;

export function getDesktopMcpSettingsService(): McpSettingsService {
	desktopMcpSettingsService ??= new McpSettingsService({
		readConfig: readMcpConfig,
		writeConfig: writeMcpConfig,
		readCompatConfig: readCompatMcpConfig,
		recordEvent: recordAppMonitorEvent,
	});
	return desktopMcpSettingsService;
}
