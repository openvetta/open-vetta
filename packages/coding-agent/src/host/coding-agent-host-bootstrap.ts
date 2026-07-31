import { join } from "node:path";
import type { ThinkingLevel } from "@vetta/agent-core";
import { type Api, type Model, supportsXhigh } from "@vetta/ai";
import { type Args, parseArgs } from "../cli/args.js";
import { DEFAULT_SERVER_URL, ENV_SERVER_URL, getAgentDir } from "../config.js";
import { AuthStorage } from "../core/auth-storage.js";
import { DEFAULT_THINKING_LEVEL } from "../core/defaults.js";
import type { LoadExtensionsResult } from "../core/extensions/index.js";
import { ModelRegistry } from "../core/model-registry.js";
import { findInitialModel, resolveCliModel, resolveModelScope, type ScopedModel } from "../core/model-resolver.js";
import { DefaultResourceLoader } from "../core/resource-loader.js";
import { type SettingsError, SettingsManager } from "../core/settings-manager.js";
import { time } from "../core/timings.js";
import { runMigrations } from "../migrations.js";
import {
	assessCodingAgentExtensionCompatibility,
	type CodingAgentExtensionCompatibilityAssessment,
} from "./coding-agent-extension-compatibility.js";

export interface CodingAgentHostBootstrapDiagnostics {
	readonly onSettingsError?: (error: SettingsError) => void;
	readonly onExtensionError?: (error: LoadExtensionsResult["errors"][number]) => void;
}

export interface CodingAgentHostBootstrapOptions extends CodingAgentHostBootstrapDiagnostics {
	readonly args: string[];
	readonly cwd?: string;
	readonly agentDir?: string;
}

export interface CodingAgentHostBootstrap {
	readonly cwd: string;
	readonly agentDir: string;
	readonly parsed: Args;
	readonly settingsManager: SettingsManager;
	readonly authStorage: AuthStorage;
	readonly modelRegistry: ModelRegistry;
	readonly resourceLoader: DefaultResourceLoader;
	readonly extensionsResult: LoadExtensionsResult;
	readonly extensionCompatibility: CodingAgentExtensionCompatibilityAssessment;
}

export interface CodingAgentInitialModelResolution {
	readonly model: Model<Api> | undefined;
	readonly thinkingLevel: ThinkingLevel;
	readonly scopedModels: readonly ScopedModel[];
	readonly warning: string | undefined;
	readonly error: string | undefined;
}

/**
 * Legacy 与 Greenfield 宿主共享的进程级启动资源。
 *
 * 这里只负责参数、设置、凭据、模型目录和动态资源加载；Session/Runtime 的选择仍由
 * 外层 Composition Root 决定。
 */
export async function createCodingAgentHostBootstrap(
	options: CodingAgentHostBootstrapOptions,
): Promise<CodingAgentHostBootstrap> {
	if (options.args.includes("--offline")) {
		process.env.PI_OFFLINE = "1";
		process.env.PI_SKIP_VERSION_CHECK = "1";
	}
	const cwd = options.cwd ?? process.cwd();
	const agentDir = options.agentDir ?? getAgentDir();
	runMigrations(cwd);

	const firstPass = parseArgs(options.args);
	const settingsManager = SettingsManager.create(cwd, agentDir);
	for (const error of settingsManager.drainErrors()) options.onSettingsError?.(error);

	const authStorage = AuthStorage.create(join(agentDir, "auth.json"));
	const modelRegistry = new ModelRegistry(authStorage, join(agentDir, "models.json"));
	const envServerUrl = process.env[ENV_SERVER_URL];
	let serverUrl = envServerUrl || settingsManager.getServerUrl();
	if (!serverUrl) {
		settingsManager.setServerUrl(DEFAULT_SERVER_URL);
		serverUrl = DEFAULT_SERVER_URL;
	}
	modelRegistry.setServerUrl(serverUrl);
	modelRegistry.setServerToken(settingsManager.getServerToken());
	modelRegistry.setServerTokenGetter(() => settingsManager.getServerTokenFresh());
	await modelRegistry.loadRemoteModels();

	const resourceLoader = new DefaultResourceLoader({
		cwd,
		agentDir,
		settingsManager,
		additionalExtensionPaths: firstPass.extensions,
		additionalSkillPaths: firstPass.skills,
		additionalPromptTemplatePaths: firstPass.promptTemplates,
		additionalThemePaths: firstPass.themes,
		noExtensions: firstPass.noExtensions,
		noSkills: firstPass.noSkills,
		noPromptTemplates: firstPass.noPromptTemplates,
		noThemes: firstPass.noThemes,
		systemPrompt: firstPass.systemPrompt,
		appendSystemPrompt: firstPass.appendSystemPrompt,
	});
	await resourceLoader.reload();
	time("resourceLoader.reload");

	const extensionsResult = resourceLoader.getExtensions();
	for (const error of extensionsResult.errors) options.onExtensionError?.(error);
	const extensionCompatibility = assessCodingAgentExtensionCompatibility({
		extensions: extensionsResult.extensions,
		pendingProviderNames: extensionsResult.runtime.pendingProviderRegistrations.map(({ name }) => name),
	});
	for (const { name, config } of extensionsResult.runtime.pendingProviderRegistrations) {
		modelRegistry.registerProvider(name, config);
	}
	extensionsResult.runtime.pendingProviderRegistrations = [];

	const extensionFlags = new Map<string, { type: "boolean" | "string" }>();
	for (const extension of extensionsResult.extensions) {
		for (const [name, flag] of extension.flags) extensionFlags.set(name, { type: flag.type });
	}
	const parsed = parseArgs(options.args, extensionFlags);
	for (const [name, value] of parsed.unknownFlags) {
		extensionsResult.runtime.flagValues.set(name, value);
	}

	return {
		cwd,
		agentDir,
		parsed,
		settingsManager,
		authStorage,
		modelRegistry,
		resourceLoader,
		extensionsResult,
		extensionCompatibility,
	};
}

export async function resolveCodingAgentInitialModel(
	bootstrap: CodingAgentHostBootstrap,
): Promise<CodingAgentInitialModelResolution> {
	const { parsed, modelRegistry, settingsManager } = bootstrap;
	const modelPatterns = parsed.models ?? settingsManager.getEnabledModels();
	const scopedModels =
		modelPatterns && modelPatterns.length > 0 ? await resolveModelScope(modelPatterns, modelRegistry) : [];
	let warning: string | undefined;
	let error: string | undefined;
	let model: Model<Api> | undefined;
	let thinkingLevel = settingsManager.getDefaultThinkingLevel() ?? DEFAULT_THINKING_LEVEL;

	if (parsed.model) {
		const resolved = resolveCliModel({
			cliProvider: parsed.provider,
			cliModel: parsed.model,
			modelRegistry,
		});
		model = resolved.model;
		warning = resolved.warning;
		error = resolved.error;
		if (!parsed.thinking && resolved.thinkingLevel) thinkingLevel = resolved.thinkingLevel;
	}

	if (!model && !error) {
		const initial = await findInitialModel({
			scopedModels,
			isContinuing: parsed.continue === true || parsed.resume === true || parsed.session !== undefined,
			defaultProvider: settingsManager.getDefaultProvider(),
			defaultModelId: settingsManager.getDefaultModel(),
			defaultThinkingLevel: settingsManager.getDefaultThinkingLevel(),
			modelRegistry,
		});
		model = initial.model;
		thinkingLevel = initial.thinkingLevel;
	}

	if (parsed.thinking) thinkingLevel = parsed.thinking;
	if (model && !model.reasoning) thinkingLevel = "off";
	if (model && thinkingLevel === "xhigh" && !supportsXhigh(model)) thinkingLevel = "high";
	return { model, thinkingLevel, scopedModels, warning, error };
}
