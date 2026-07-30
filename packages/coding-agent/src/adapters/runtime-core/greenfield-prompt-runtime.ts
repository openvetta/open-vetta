import {
	DefaultResourceLoader,
	type DefaultResourceLoaderOptions,
	type ResourceLoader,
} from "../../core/resource-loader.js";
import {
	type PersonalizationSettingsSource,
	resolveSystemPromptOptionsFromSources,
} from "../../core/session/system-prompt-builder.js";
import type { ConversationScenario } from "../../core/session/tool-scope.js";
import { SettingsManager } from "../../core/settings-manager.js";
import type { AgentPluginRuntimeConfig } from "../../core/system-prompt.js";
import type {
	CodingAgentModelCallPromptContext,
	CodingAgentSystemPromptOptions,
	CodingAgentSystemPromptOptionsResolver,
} from "./greenfield-model-call-composer.js";

export interface CodingAgentPromptSettingsSource extends PersonalizationSettingsSource {
	reloadPersonalizationSettings(): void;
}

export type CodingAgentPromptResourceSource = Pick<
	ResourceLoader,
	"getAgentsFiles" | "getAppendSystemPrompt" | "getSkills" | "getSystemPrompt" | "refreshSkillsIfChanged"
>;

export interface CodingAgentPromptMemoryState {
	readonly enabled: boolean;
	readonly file: string | undefined;
	readonly snapshot: string;
	readonly charLimit: number;
}

export interface CodingAgentPromptRuntimeOptions {
	readonly cwd: string;
	readonly resourceLoader: CodingAgentPromptResourceSource;
	readonly settingsManager: CodingAgentPromptSettingsSource;
	readonly scenario?: ConversationScenario;
	readonly readAgentMode?: () => string | undefined;
	readonly readMemory?: () => CodingAgentPromptMemoryState | undefined;
	readonly readAgentPlugins?: () => AgentPluginRuntimeConfig | undefined;
}

export interface CreateCodingAgentPromptRuntimeOptions
	extends Omit<CodingAgentPromptRuntimeOptions, "resourceLoader" | "settingsManager"> {
	readonly agentDir?: string;
	readonly resourceLoader?: ResourceLoader;
	readonly settingsManager?: SettingsManager;
	readonly resourceLoaderOptions?: Omit<
		DefaultResourceLoaderOptions,
		"agentDir" | "cwd" | "noExtensions" | "noPromptTemplates" | "noThemes" | "settingsManager"
	>;
}

/**
 * Coding Agent 的 Session 级 Prompt 事实源。
 *
 * 它只读取当前调用需要的产品状态；Runtime Core 仍只接收最终的模型调用 Frame。
 */
export class CodingAgentPromptRuntime {
	readonly resolveSystemPromptOptions: CodingAgentSystemPromptOptionsResolver;

	constructor(private readonly options: CodingAgentPromptRuntimeOptions) {
		this.resolveSystemPromptOptions = (context) => this.resolve(context);
	}

	resolve(context: CodingAgentModelCallPromptContext): CodingAgentSystemPromptOptions {
		context.signal.throwIfAborted();
		this.options.resourceLoader.refreshSkillsIfChanged();
		this.options.settingsManager.reloadPersonalizationSettings();
		const memory = this.options.readMemory?.();
		const promptOptions = resolveSystemPromptOptionsFromSources({
			toolNames: context.activeToolNames,
			resourceLoader: this.options.resourceLoader,
			mcpManager: undefined,
			cwd: this.options.cwd,
			settingsManager: this.options.settingsManager,
			memoryMode: memory?.enabled ?? false,
			memoryFile: memory?.file,
			memorySnapshot: memory?.snapshot ?? "",
			memoryCharLimit: memory?.charLimit ?? 0,
			agentMode: this.options.readAgentMode?.(),
			agentPlugins: this.options.readAgentPlugins?.(),
			scenario: this.options.scenario,
		});
		const { selectedTools: _selectedTools, ...options } = promptOptions;
		return options;
	}

	readResourceSource(): CodingAgentPromptResourceSource {
		return this.options.resourceLoader;
	}
}

export async function createCodingAgentPromptRuntime(
	options: CreateCodingAgentPromptRuntimeOptions,
): Promise<CodingAgentPromptRuntime> {
	const settingsManager = options.settingsManager ?? SettingsManager.create(options.cwd, options.agentDir);
	const resourceLoader =
		options.resourceLoader ??
		new DefaultResourceLoader({
			...options.resourceLoaderOptions,
			cwd: options.cwd,
			agentDir: options.agentDir,
			settingsManager,
			noExtensions: true,
			noPromptTemplates: true,
			noThemes: true,
		});
	await resourceLoader.reload();
	return new CodingAgentPromptRuntime({
		cwd: options.cwd,
		resourceLoader,
		settingsManager,
		scenario: options.scenario,
		readAgentMode: options.readAgentMode,
		readMemory: options.readMemory,
		readAgentPlugins: options.readAgentPlugins,
	});
}
