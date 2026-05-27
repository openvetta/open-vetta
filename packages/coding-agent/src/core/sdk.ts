import { join } from "node:path";
import { Agent, type AgentMessage, type ThinkingLevel } from "@mariozechner/pi-agent-core";
import type { Message, Model } from "@mariozechner/pi-ai";
import { DEFAULT_SERVER_URL, getAgentDir, getDocsPath } from "../config.js";
import { AgentSession } from "./agent-session.js";
import { AuthStorage } from "./auth-storage.js";
import { DEFAULT_THINKING_LEVEL } from "./defaults.js";
import type { ExtensionRunner, LoadExtensionsResult, ToolDefinition } from "./extensions/index.js";
import { applyImageBudget } from "./image-budget.js";
import { convertToLlm } from "./messages.js";
import { ModelRegistry } from "./model-registry.js";
import { findInitialModel } from "./model-resolver.js";
import type { ResourceLoader } from "./resource-loader.js";
import { DefaultResourceLoader } from "./resource-loader.js";
import { SessionManager } from "./session-manager.js";
import { SettingsManager } from "./settings-manager.js";
import { time } from "./timings.js";
import {
	allTools,
	bashTool,
	codingTools,
	createBashTool,
	createCodingTools,
	createEditTool,
	createExtractTextFromImgTool,
	createExtractTextFromPdfTool,
	createFindTool,
	createGlobTool,
	createGrepTool,
	createHtmlToPdfTool,
	createLsTool,
	createReadOnlyTools,
	createReadTool,
	createShellTool,
	createTreeTool,
	createWriteTool,
	editTool,
	extractTextFromImgTool,
	extractTextFromPdfTool,
	findTool,
	getDefaultCodingToolNames,
	globTool,
	grepTool,
	htmlToPdfTool,
	lsTool,
	readOnlyTools,
	readTool,
	shellTool,
	type Tool,
	type ToolName,
	treeTool,
	writeTool,
} from "./tools/index.js";

export interface CreateAgentSessionOptions {
	/** Working directory for project-local discovery. Default: process.cwd() */
	cwd?: string;
	/** Global config directory. Default: ~/.pi/agent */
	agentDir?: string;

	/** Auth storage for credentials. Default: AuthStorage.create(agentDir/auth.json) */
	authStorage?: AuthStorage;
	/** Model registry. Default: new ModelRegistry(authStorage, agentDir/models.json) */
	modelRegistry?: ModelRegistry;

	/** Model to use. Default: from settings, else first available */
	model?: Model<any>;
	/** Thinking level. Default: from settings, else 'medium' (clamped to model capabilities) */
	thinkingLevel?: ThinkingLevel;
	/** Models available for cycling (Ctrl+P in interactive mode) */
	scopedModels?: Array<{ model: Model<any>; thinkingLevel: ThinkingLevel }>;

	/** Built-in tools to use. Default: codingTools [read, command-tool, edit, write, dir_tree, doc_to_pdf, html_to_pdf, extract_text_from_pdf, extract_text_from_img] */
	tools?: Tool[];
	/** Custom tools to register (in addition to built-in tools). */
	customTools?: ToolDefinition[];

	/** Resource loader. When omitted, DefaultResourceLoader is used. */
	resourceLoader?: ResourceLoader;

	/** Session manager. Default: SessionManager.create(cwd) */
	sessionManager?: SessionManager;

	/** Settings manager. Default: SettingsManager.create(cwd, agentDir) */
	settingsManager?: SettingsManager;

	/** 追加到 system prompt 末尾的文本，不会被上下文压缩 */
	appendSystemPrompt?: string;

	/**
	 * 注入到 bash/shell 工具子进程的环境变量覆盖层。仅对该 session 内的命令执行生效；
	 * 不传则行为等同旧版。常用于将 TMPDIR/TEMP/TMP 重定向到 session 私有目录。
	 */
	env?: Record<string, string>;

	/**
	 * Vetta 远端服务 URL（拉取 remote models / providers）。当宿主进程已经从环境
	 * 变量解析出权威值（例如 desktop-app 的 VETTA_SERVER_URL）时显式传入，避免
	 * SDK 退回到内置的 LAN 默认值并把它持久化到 settings.json，造成 desktop-app
	 * 与 coding-agent SDK 各自指向不同 server 的"半边大脑"问题。
	 * 不传则保留旧行为：先读 settings.json，再回退到内置 DEFAULT_SERVER_URL，
	 * 并把内置值写入 settings.json 以便下次复用。
	 */
	serverUrl?: string;
}

/** Result from createAgentSession */
export interface CreateAgentSessionResult {
	/** The created session */
	session: AgentSession;
	/** Extensions result (for UI context setup in interactive mode) */
	extensionsResult: LoadExtensionsResult;
	/** Warning if session was restored with a different model than saved */
	modelFallbackMessage?: string;
}

// Re-exports

export type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
	ExtensionFactory,
	SlashCommandInfo,
	SlashCommandLocation,
	SlashCommandSource,
	ToolDefinition,
} from "./extensions/index.js";
export type { PromptTemplate } from "./prompt-templates.js";
export type { Skill, SkillType } from "./skills.js";
export type { Tool } from "./tools/index.js";

export {
	allTools as allBuiltInTools,
	bashTool,
	shellTool,
	codingTools,
	createBashTool,
	createShellTool,
	// Tool factories (for custom cwd)
	createCodingTools,
	createEditTool,
	createExtractTextFromImgTool,
	createExtractTextFromPdfTool,
	createFindTool,
	createGlobTool,
	createGrepTool,
	createHtmlToPdfTool,
	createLsTool,
	createReadOnlyTools,
	createReadTool,
	createTreeTool,
	createWriteTool,
	editTool,
	extractTextFromImgTool,
	extractTextFromPdfTool,
	findTool,
	globTool,
	grepTool,
	htmlToPdfTool,
	lsTool,
	readOnlyTools,
	// Pre-built tools (use process.cwd())
	readTool,
	treeTool,
	writeTool,
};

// Helper Functions

function getDefaultAgentDir(): string {
	return getAgentDir();
}

/**
 * Create an AgentSession with the specified options.
 *
 * @example
 * ```typescript
 * // Minimal - uses defaults
 * const { session } = await createAgentSession();
 *
 * // With explicit model
 * import { getModel } from '@mariozechner/pi-ai';
 * const { session } = await createAgentSession({
 *   model: getModel('anthropic', 'claude-opus-4-5'),
 *   thinkingLevel: 'high',
 * });
 *
 * // Continue previous session
 * const { session, modelFallbackMessage } = await createAgentSession({
 *   continueSession: true,
 * });
 *
 * // Full control
 * const loader = new DefaultResourceLoader({
 *   cwd: process.cwd(),
 *   agentDir: getAgentDir(),
 *   settingsManager: SettingsManager.create(),
 * });
 * await loader.reload();
 * const { session } = await createAgentSession({
 *   model: myModel,
 *   tools: [readTool, bashTool],
 *   resourceLoader: loader,
 *   sessionManager: SessionManager.inMemory(),
 * });
 * ```
 */
export async function createAgentSession(options: CreateAgentSessionOptions = {}): Promise<CreateAgentSessionResult> {
	const __perfStart = Date.now();
	const __perfMark = (label: string) => {
		// stderr, not stdout: in rpc mode stdout carries the NDJSON wire
		// protocol and any non-JSON line would be parsed as a malformed
		// event by clients like im-gateway (which then surfaces it as an
		// "(agent error)" card).
		console.error(`[perf][createAgentSession] ${label} +${Date.now() - __perfStart}ms`);
	};
	__perfMark("enter");
	const cwd = options.cwd ?? process.cwd();
	const agentDir = options.agentDir ?? getDefaultAgentDir();
	let resourceLoader = options.resourceLoader;

	// Use provided or create AuthStorage and ModelRegistry
	const authPath = options.agentDir ? join(agentDir, "auth.json") : undefined;
	const modelsPath = options.agentDir ? join(agentDir, "models.json") : undefined;
	const authStorage = options.authStorage ?? AuthStorage.create(authPath);
	const modelRegistry = options.modelRegistry ?? new ModelRegistry(authStorage, modelsPath);

	const settingsManager = options.settingsManager ?? SettingsManager.create(cwd, agentDir);
	__perfMark("before loadRemoteModels");

	// Ensure serverUrl has a default value, then load remote models.
	// 优先级：调用方显式传入 > settings.json > 内置 DEFAULT_SERVER_URL。
	// 调用方传入的 URL 不写入 settings.json——宿主进程（如 desktop-app）才是
	// 权威来源，settings 里的残留值由宿主自行清理（参考 desktop-app
	// registerSettingsIpc 启动时的 scrub 逻辑）。
	if (!options.modelRegistry) {
		let serverUrl = options.serverUrl ?? settingsManager.getServerUrl();
		let writeBackDefault = false;
		if (!serverUrl) {
			serverUrl = DEFAULT_SERVER_URL;
			writeBackDefault = options.serverUrl === undefined;
		}
		if (writeBackDefault) {
			settingsManager.setServerUrl(serverUrl);
		}
		modelRegistry.setServerUrl(serverUrl);
		modelRegistry.setServerToken(settingsManager.getServerToken());
		modelRegistry.setServerTokenGetter(() => settingsManager.getServerTokenFresh());
		await modelRegistry.loadRemoteModels();
	}
	__perfMark("after loadRemoteModels");
	const sessionManager = options.sessionManager ?? SessionManager.create(cwd);
	__perfMark("after SessionManager.create");

	if (!resourceLoader) {
		resourceLoader = new DefaultResourceLoader({
			cwd,
			agentDir,
			settingsManager,
			appendSystemPrompt: options.appendSystemPrompt,
		});
		await resourceLoader.reload();
		time("resourceLoader.reload");
	}
	__perfMark("after resourceLoader.reload");

	// Check if session has existing data to restore
	const existingSession = sessionManager.buildSessionContext();
	const hasExistingSession = existingSession.messages.length > 0;
	const hasThinkingEntry = sessionManager.getBranch().some((entry) => entry.type === "thinking_level_change");

	let model = options.model;
	let modelFallbackMessage: string | undefined;

	// If session has data, try to restore model from it
	if (!model && hasExistingSession && existingSession.model) {
		const restoredModel = modelRegistry.find(existingSession.model.provider, existingSession.model.modelId);
		if (restoredModel && (await modelRegistry.getApiKey(restoredModel))) {
			model = restoredModel;
		}
		if (!model) {
			modelFallbackMessage = `Could not restore model ${existingSession.model.provider}/${existingSession.model.modelId}`;
		}
	}

	// If still no model, use findInitialModel (checks settings default, then provider defaults)
	if (!model) {
		const result = await findInitialModel({
			scopedModels: [],
			isContinuing: hasExistingSession,
			defaultProvider: settingsManager.getDefaultProvider(),
			defaultModelId: settingsManager.getDefaultModel(),
			defaultThinkingLevel: settingsManager.getDefaultThinkingLevel(),
			modelRegistry,
		});
		model = result.model;
		if (!model) {
			modelFallbackMessage = `No models available. Use /login or set an API key environment variable. See ${join(getDocsPath(), "providers.md")}. Then use /model to select a model.`;
		} else if (modelFallbackMessage) {
			modelFallbackMessage += `. Using ${model.provider}/${model.id}`;
		}
	}

	let thinkingLevel = options.thinkingLevel;

	// If session has data, restore thinking level from it
	if (thinkingLevel === undefined && hasExistingSession) {
		thinkingLevel = hasThinkingEntry
			? (existingSession.thinkingLevel as ThinkingLevel)
			: (settingsManager.getDefaultThinkingLevel() ?? DEFAULT_THINKING_LEVEL);
	}

	// Fall back to settings default
	if (thinkingLevel === undefined) {
		thinkingLevel = settingsManager.getDefaultThinkingLevel() ?? DEFAULT_THINKING_LEVEL;
	}

	// Clamp to model capabilities
	if (!model?.reasoning) {
		thinkingLevel = "off";
	}

	const platformDefaultToolNames = getDefaultCodingToolNames();
	const initialActiveToolNames: ToolName[] = options.tools
		? options.tools.map((t) => t.name).filter((n): n is ToolName => n in allTools)
		: (platformDefaultToolNames as ToolName[]);

	let agent: Agent;

	// Create convertToLlm wrapper that filters images if blockImages is enabled (defense-in-depth)
	const convertToLlmWithBlockImages = (messages: AgentMessage[]): Message[] => {
		const converted = convertToLlm(messages);
		// Check setting dynamically so mid-session changes take effect
		if (!settingsManager.getBlockImages()) {
			return converted;
		}
		// Filter out ImageContent from all messages, replacing with text placeholder
		return converted.map((msg) => {
			if (msg.role === "user" || msg.role === "toolResult") {
				const content = msg.content;
				if (Array.isArray(content)) {
					const hasImages = content.some((c) => c.type === "image");
					if (hasImages) {
						const filteredContent = content
							.map((c) =>
								c.type === "image" ? { type: "text" as const, text: "Image reading is disabled." } : c,
							)
							.filter(
								(c, i, arr) =>
									// Dedupe consecutive "Image reading is disabled." texts
									!(
										c.type === "text" &&
										c.text === "Image reading is disabled." &&
										i > 0 &&
										arr[i - 1].type === "text" &&
										(arr[i - 1] as { type: "text"; text: string }).text === "Image reading is disabled."
									),
							);
						return { ...msg, content: filteredContent };
					}
				}
			}
			return msg;
		});
	};

	const extensionRunnerRef: { current?: ExtensionRunner } = {};
	const agentSessionRef: { current?: AgentSession } = {};

	agent = new Agent({
		initialState: {
			systemPrompt: "",
			model,
			thinkingLevel,
			tools: [],
		},
		convertToLlm: convertToLlmWithBlockImages,
		sessionId: sessionManager.getSessionId(),
		transformContext: async (messages, signal) => {
			const runner = extensionRunnerRef.current;
			if (runner) {
				messages = await runner.emitContext(messages);
			}
			const session = agentSessionRef.current;
			if (session) {
				messages = await session.preCallCompaction(messages, signal);
			}
			// Cap session-wide image count to bound visual-token cost for VL models.
			// Read setting dynamically so mid-session changes take effect.
			messages = applyImageBudget(messages, settingsManager.getMaxRecentImages());
			return messages;
		},
		steeringMode: settingsManager.getSteeringMode(),
		followUpMode: settingsManager.getFollowUpMode(),
		transport: settingsManager.getTransport(),
		thinkingBudgets: settingsManager.getThinkingBudgets(),
		maxRetryDelayMs: settingsManager.getRetrySettings().maxDelayMs,
		getApiKey: async (provider) => {
			// Use the provider argument from the in-flight request;
			// agent.state.model may already be switched mid-turn.
			const resolvedProvider = provider || agent.state.model?.provider;
			if (!resolvedProvider) {
				throw new Error("No model selected");
			}
			const key = await modelRegistry.getApiKeyForProvider(resolvedProvider);
			if (!key) {
				const model = agent.state.model;
				const isOAuth = model && modelRegistry.isUsingOAuth(model);
				if (isOAuth) {
					throw new Error(
						`Authentication failed for "${resolvedProvider}". ` +
							`Credentials may have expired or network is unavailable. ` +
							`Run '/login ${resolvedProvider}' to re-authenticate.`,
					);
				}
				throw new Error(
					`No API key found for "${resolvedProvider}". ` +
						`Set an API key environment variable or run '/login ${resolvedProvider}'.`,
				);
			}
			return key;
		},
	});

	// Restore messages if session has existing data
	if (hasExistingSession) {
		agent.replaceMessages(existingSession.messages);
		if (!hasThinkingEntry) {
			sessionManager.appendThinkingLevelChange(thinkingLevel);
		}
	} else {
		// Save initial model and thinking level for new sessions so they can be restored on resume
		if (model) {
			sessionManager.appendModelChange(model.provider, model.id);
		}
		sessionManager.appendThinkingLevelChange(thinkingLevel);
	}

	const session = new AgentSession({
		agent,
		sessionManager,
		settingsManager,
		cwd,
		scopedModels: options.scopedModels,
		resourceLoader,
		customTools: options.customTools,
		modelRegistry,
		initialActiveToolNames,
		extensionRunnerRef,
		envOverlay: options.env,
	});
	agentSessionRef.current = session;
	const extensionsResult = resourceLoader.getExtensions();
	__perfMark("exit");

	return {
		session,
		extensionsResult,
		modelFallbackMessage,
	};
}
