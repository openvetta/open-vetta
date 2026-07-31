import { join } from "node:path";
import { getAgentDir } from "@vetta/coding-agent/config";
import {
	createCodingAgentMcpRuntimeToolSource,
	createCodingAgentPluginMcpRuntime,
} from "@vetta/coding-agent/runtime-host";
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
	type RuntimeHostSessionBackendRouteDecision,
} from "../../../../runtime-core/src/index.js";
import { getBuiltinSkillPaths } from "../builtin-skills.js";
import {
	DEFAULT_CONVERSATION_CWD,
	DEFAULT_CONVERSATION_SESSION_DIR,
	DEFAULT_IM_CONVERSATION_CWD,
	DEFAULT_IM_CONVERSATION_SESSION_DIR,
	KB_PROCESSING_CWD,
	KB_PROCESSING_SESSION_DIR,
	readConfigSync,
	readDesktopConfig,
} from "../config/desktop-config-store.js";
import { DEFAULT_SERVER_URL } from "../constants.js";
import { getDesktopUserQuestionBroker } from "../conversations/user-question-broker.js";
import { getAppLogger } from "../logger.js";
import { getAvailableLinuxBubblewrapPath, getAvailableMacosSandboxExecPath } from "../sandbox/capability.js";
import { resolveWindowsSandboxHostBinary } from "../sandbox/windows-binary-resolver.js";
import { getOrCreateSharedModelRegistry, readDesktopMcpDebug } from "./desktop-coding-agent-host-services.js";
import { DesktopGreenfieldRuntimeBackendPool } from "./desktop-greenfield-runtime-backend-pool.js";
import {
	DesktopGreenfieldRuntimeSessionCatalog,
	isSessionPathInDirectory,
	PathFilteredRuntimeSessionCatalog,
} from "./desktop-greenfield-session-catalog.js";
import { createDesktopLegacyRuntimeCompatibility } from "./desktop-legacy-runtime-compatibility.js";
import { desktopAgentRuntimeDecision } from "./desktop-runtime-decision.js";

const log = getAppLogger("runtime");

export interface DesktopRuntimeComposition {
	readonly runtime: RuntimeHost;
	readonly greenfieldBackendPool: DesktopGreenfieldRuntimeBackendPool;
}

export function createDesktopRuntimeComposition(): DesktopRuntimeComposition {
	const modelRegistry = getOrCreateSharedModelRegistry();
	const getDefaultExecutionMode = async () => (await readDesktopConfig()).defaultExecutionMode;
	const sandboxHostPath = resolveWindowsSandboxHostBinary()?.path;
	const linuxBubblewrapPath = getAvailableLinuxBubblewrapPath();
	const macosSandboxExecPath = getAvailableMacosSandboxExecPath();
	const userQuestionHandler = getDesktopUserQuestionBroker().handle;
	const additionalSkillPaths = getBuiltinSkillPaths();
	const legacy = createDesktopLegacyRuntimeCompatibility({
		additionalSkillPaths,
		getDefaultExecutionMode,
		linuxBubblewrapPath,
		macosSandboxExecPath,
		modelRegistry,
		sandboxHostPath,
		serverUrl: DEFAULT_SERVER_URL,
		userQuestionHandler,
	});
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
			modelRegistry,
			createPluginMcpRuntime: ({ cwd, agentDir }) => {
				const resolvedAgentDir = agentDir ?? getAgentDir();
				return createCodingAgentPluginMcpRuntime({
					agentDir: resolvedAgentDir,
					debug: readDesktopMcpDebug(cwd, resolvedAgentDir),
				});
			},
		},
		createMcpRuntimeSource: async ({ cwd, agentDir }) => {
			const resolvedAgentDir = agentDir ?? getAgentDir();
			return await createCodingAgentMcpRuntimeToolSource({
				projectRoot: cwd,
				agentDir: resolvedAgentDir,
				debug: readDesktopMcpDebug(cwd, resolvedAgentDir),
				enabled: true,
			});
		},
	});
	const defaultBackend =
		desktopAgentRuntimeDecision.effectiveBackend === "greenfield" ? greenfieldBackendPool : legacy.sessionBackend;
	const sessionBackend = new CatalogRoutedRuntimeHostSessionBackend({
		defaultBackend,
		defaultRouteId: desktopAgentRuntimeDecision.effectiveBackend,
		routes: [
			{ id: "legacy", catalog: legacy.sessionCatalog, backend: legacy.sessionBackend },
			{ id: "greenfield", catalog: desktopGreenfieldCatalog, backend: greenfieldBackendPool },
		],
		onRoute: logSessionRoute,
	});
	log.info(
		`[agent-runtime] requested=${desktopAgentRuntimeDecision.requestedBackend} effective=${desktopAgentRuntimeDecision.effectiveBackend} source=${desktopAgentRuntimeDecision.source}`,
	);
	return {
		greenfieldBackendPool,
		runtime: new RuntimeHost({
			additionalSkillPaths,
			getDefaultExecutionMode,
			linuxBubblewrapPath,
			macosSandboxExecPath,
			sandboxHostPath,
			serverUrl: DEFAULT_SERVER_URL,
			sessionBackend,
			sessionCatalog: new CompositeRuntimeSessionCatalog([legacy.sessionCatalog, conversationCatalog]),
			sessionFileHistoryReader: new CompositeRuntimeSessionFileHistoryReader([
				legacy.sessionFileHistoryReader,
				new FileConversationRuntimeSessionFileHistoryReader(),
			]),
			sessionAccessResolver: new CatalogRoutedRuntimeSessionAccessResolver([
				{
					catalog: legacy.sessionCatalog,
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
			sharedModelController: legacy.sharedModelController,
			userQuestionHandler,
		}),
	};
}

function logSessionRoute(decision: RuntimeHostSessionBackendRouteDecision): void {
	if (decision.source === "default") {
		log.info(`[agent-runtime] session-route backend=${decision.routeId ?? "unknown"} reason=new-session-default`);
		return;
	}
	const reason =
		decision.routeId === "legacy"
			? "legacy-catalog"
			: decision.routeId === "greenfield"
				? "conversation-v2-catalog"
				: "unknown-catalog";
	log.info(`[agent-runtime] session-route backend=${decision.routeId ?? "unknown"} reason=${reason}`);
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
