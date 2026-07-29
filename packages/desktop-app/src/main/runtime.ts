import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { AuthStorage, getAgentDir, ModelRegistry } from "@vetta/coding-agent";
import { createLegacyRuntimeHostOptions } from "@vetta/coding-agent/runtime-host";
import {
	FileConversationRuntimeSessionFileHistoryReader,
	type RuntimeConversationSessionRoot,
} from "@vetta/runtime-storage/conversation";
import {
	CatalogRoutedRuntimeHostSessionBackend,
	CatalogRoutedRuntimeSessionAccessResolver,
	CompositeRuntimeSessionCatalog,
	CompositeRuntimeSessionFileHistoryReader,
	RuntimeHost,
} from "../../../runtime-core/src/index.js";
import { getBuiltinSkillPaths } from "./builtin-skills.js";
import {
	DEFAULT_CONVERSATION_CWD,
	DEFAULT_CONVERSATION_SESSION_DIR,
	DEFAULT_IM_CONVERSATION_CWD,
	DEFAULT_IM_CONVERSATION_SESSION_DIR,
	KB_PROCESSING_CWD,
	KB_PROCESSING_SESSION_DIR,
	readConfigSync,
	readDesktopConfig,
} from "./config/desktop-config-store.js";
import { DEFAULT_SERVER_URL } from "./constants.js";
import { getDesktopUserQuestionBroker } from "./conversations/user-question-broker.js";
import { DesktopGreenfieldRuntimeBackendPool } from "./greenfield-runtime/desktop-greenfield-runtime-backend-pool.js";
import {
	DesktopGreenfieldRuntimeSessionCatalog,
	isSessionPathInDirectory,
	PathFilteredRuntimeSessionCatalog,
} from "./greenfield-runtime/desktop-greenfield-session-catalog.js";
import {
	DESKTOP_AGENT_RUNTIME_ENV,
	resolveDesktopAgentRuntimeBackend,
} from "./greenfield-runtime/desktop-runtime-selector.js";
import { getAvailableLinuxBubblewrapPath, getAvailableMacosSandboxExecPath } from "./sandbox/capability.js";
import { resolveWindowsSandboxHostBinary } from "./sandbox/windows-binary-resolver.js";

// 进程级共享 RuntimeHost：session IPC、定时任务 (scheduler) 与批量任务
// (batch-tasks) 必须复用同一实例，否则任一模块 createSession 后没 dispose
// 时，其它模块再次 open 同一 sessionPath 会在同进程里撞 SessionLockError，
// 导致点击跳转走向 Welcome 页（见定时任务历史跳转 bug）。
let sharedRuntime: RuntimeHost | null = null;
let sharedModelRegistry: ModelRegistry | null = null;
let sharedGreenfieldBackendPool: DesktopGreenfieldRuntimeBackendPool | null = null;

/**
 * 直接从 settings.json 读 serverToken。
 *
 * 不复用 `ipc/settings.ts` 的 `readSettings()` 是为了避免 settings.ts ↔
 * runtime.ts 的循环 import（settings.ts 已经 import `peekSharedRuntime`）。
 * 内容只有 5 行，inline 比拉公共文件更省心。
 */
function readServerTokenFromDisk(): string | undefined {
	const path = join(getAgentDir(), "settings.json");
	if (!existsSync(path)) return undefined;
	try {
		const settings = JSON.parse(readFileSync(path, "utf-8")) as { serverToken?: string };
		return settings.serverToken;
	} catch {
		return undefined;
	}
}

/**
 * 进程级共享 ModelRegistry：所有 session 共用，避免每次 createSession 都重新
 * `fetch('/providers/models.json')`（线上实测一次 5 秒，是 Welcome 页发消息卡
 * 顿的主因）。
 *
 * 刷新策略（stale-while-revalidate）：
 *  - 启动时如果已登录，后台预热一次（非阻塞）；未登录则跳过，由登录回调触发。
 *  - 每次 createSession 完成后，RuntimeHost 顺手 fire-and-forget 一次刷新。
 *  - 登录/登出由 `ipc/settings.ts` 的 set-server-token handler 调
 *    `runtime.reloadServerAuth(token)`，命中本 registry 的同步刷新分支。
 *  - tokenGetter 每次从磁盘读 settings.json，保证多窗口/多进程也能拿到最新 token。
 */
export function getOrCreateSharedModelRegistry(): ModelRegistry {
	if (sharedModelRegistry) return sharedModelRegistry;
	const agentDir = getAgentDir();
	const authStorage = AuthStorage.create(join(agentDir, "auth.json"));
	const modelsPath = join(agentDir, "models.json");
	const registry = new ModelRegistry(authStorage, modelsPath);
	registry.setServerUrl(DEFAULT_SERVER_URL);
	registry.setServerToken(readServerTokenFromDisk());
	registry.setServerTokenGetter(() => readServerTokenFromDisk());
	// 启动预热：未登录时 loadRemoteModels 内部早退（见 model-registry.ts），
	// 已登录则后台拉一次，期间 createSession 直接用 built-in + 上次磁盘缓存。
	void registry.loadRemoteModels();
	sharedModelRegistry = registry;
	return registry;
}

/** Return the shared RuntimeHost if one has been created, otherwise null. */
export function peekSharedRuntime(): RuntimeHost | null {
	return sharedRuntime;
}

export function getSharedRuntime(): RuntimeHost {
	if (!sharedRuntime) {
		const legacyOptions = createLegacyRuntimeHostOptions({
			additionalSkillPaths: getBuiltinSkillPaths(),
			getDefaultExecutionMode: async () => {
				const config = await readDesktopConfig();
				return config.defaultExecutionMode;
			},
			sandboxHostPath: resolveWindowsSandboxHostBinary()?.path,
			linuxBubblewrapPath: getAvailableLinuxBubblewrapPath(),
			macosSandboxExecPath: getAvailableMacosSandboxExecPath(),
			// 把 desktop-app 编译期注入的 VETTA_SERVER_URL 显式喂给 SDK，
			// 防止 coding-agent 退回到自己 config.ts 里硬编码的 LAN 默认值，
			// 并把它静默写入 settings.json 污染 prod 用户的配置。
			serverUrl: DEFAULT_SERVER_URL,
			// 共享 ModelRegistry：去掉 createSession 的 5s 远程 fetch 阻塞。
			modelRegistry: getOrCreateSharedModelRegistry(),
			userQuestionHandler: getDesktopUserQuestionBroker().handle,
		});
		if (!legacyOptions.sessionCatalog || !legacyOptions.sessionFileHistoryReader) {
			throw new Error("Legacy RuntimeHost composition must provide session services");
		}
		if (!legacyOptions.sessionBackend) {
			throw new Error("Legacy RuntimeHost composition must provide a session backend");
		}
		const legacyCatalog = legacyOptions.sessionCatalog;
		const conversationCatalog = new DesktopGreenfieldRuntimeSessionCatalog({
			resolveRoots: resolveDesktopGreenfieldSessionRoots,
		});
		const imConversationCatalog = new PathFilteredRuntimeSessionCatalog(conversationCatalog, (sessionPath) =>
			isSessionPathInDirectory(sessionPath, DEFAULT_IM_CONVERSATION_SESSION_DIR),
		);
		const desktopGreenfieldCatalog = new PathFilteredRuntimeSessionCatalog(
			conversationCatalog,
			(sessionPath) => !isSessionPathInDirectory(sessionPath, DEFAULT_IM_CONVERSATION_SESSION_DIR),
		);
		const greenfieldBackendPool = new DesktopGreenfieldRuntimeBackendPool({
			compositionDefaults: {
				modelRegistry: getOrCreateSharedModelRegistry(),
			},
		});
		const selectedBackend = resolveDesktopAgentRuntimeBackend(process.env[DESKTOP_AGENT_RUNTIME_ENV]);
		const sessionBackend = new CatalogRoutedRuntimeHostSessionBackend({
			defaultBackend: selectedBackend === "greenfield" ? greenfieldBackendPool : legacyOptions.sessionBackend,
			routes: [
				{ catalog: legacyCatalog, backend: legacyOptions.sessionBackend },
				{ catalog: desktopGreenfieldCatalog, backend: greenfieldBackendPool },
			],
		});
		sharedRuntime = new RuntimeHost({
			...legacyOptions,
			sessionBackend,
			sessionCatalog: new CompositeRuntimeSessionCatalog([legacyCatalog, conversationCatalog]),
			sessionFileHistoryReader: new CompositeRuntimeSessionFileHistoryReader([
				legacyOptions.sessionFileHistoryReader,
				new FileConversationRuntimeSessionFileHistoryReader(),
			]),
			sessionAccessResolver: new CatalogRoutedRuntimeSessionAccessResolver([
				{
					catalog: legacyCatalog,
					access: {
						readHistory: true,
						interactiveResume: true,
						rename: true,
						delete: true,
					},
				},
				{
					catalog: imConversationCatalog,
					access: {
						readHistory: true,
						interactiveResume: false,
						rename: true,
						delete: true,
					},
				},
				{
					catalog: desktopGreenfieldCatalog,
					access: {
						readHistory: true,
						interactiveResume: true,
						rename: true,
						delete: true,
					},
				},
			]),
		});
		sharedGreenfieldBackendPool = greenfieldBackendPool;
	}
	return sharedRuntime;
}

export async function disposeSharedRuntime(): Promise<void> {
	const runtime = sharedRuntime;
	const greenfieldBackendPool = sharedGreenfieldBackendPool;
	if (!runtime && !greenfieldBackendPool) return;
	sharedRuntime = null;
	sharedGreenfieldBackendPool = null;
	try {
		await runtime?.disposeAllSessions();
	} finally {
		await greenfieldBackendPool?.dispose();
	}
}

function resolveDesktopGreenfieldSessionRoots(): RuntimeConversationSessionRoot[] {
	const config = readConfigSync();
	const projectRoots = [...config.projects, ...config.archivedProjects].map(({ path }) => ({
		cwd: path,
		sessionDir: join(path, ".vetta", "sessions"),
	}));
	return [
		{
			cwd: DEFAULT_CONVERSATION_CWD,
			sessionDir: DEFAULT_CONVERSATION_SESSION_DIR,
		},
		{
			cwd: DEFAULT_IM_CONVERSATION_CWD,
			sessionDir: DEFAULT_IM_CONVERSATION_SESSION_DIR,
		},
		{
			cwd: KB_PROCESSING_CWD,
			sessionDir: KB_PROCESSING_SESSION_DIR,
		},
		...projectRoots,
	];
}
