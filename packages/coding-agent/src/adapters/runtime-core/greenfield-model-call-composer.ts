import type { EcosystemHookRuntime } from "@vetta/ecosystem-adapter/hooks";
import type {
	InstructionBlock,
	ModelCallFrame,
	ModelCallFrameComposer,
	ModelCallFrameCompositionContext,
	RuntimeToolDefinition,
} from "@vetta/runtime-core/kernel";
import {
	type BuildSystemPromptOptions,
	buildSystemPromptDraft,
	renderSystemPromptDraft,
	type SystemPromptDraft,
} from "../../core/system-prompt.js";
import { wrapRuntimeToolsWithEcosystemHooks } from "./greenfield-hook-tool-wrapper.js";
import type { CodingAgentPluginRunOrchestrator } from "./greenfield-plugin-run-orchestrator.js";
import type { CodingAgentPluginToolRuntime } from "./greenfield-plugin-tool-runtime.js";

export type CodingAgentSystemPromptOptions = Omit<BuildSystemPromptOptions, "selectedTools">;

export interface CodingAgentModelCallPromptContext extends ModelCallFrameCompositionContext {
	readonly activeToolNames: readonly string[];
}

export type CodingAgentSystemPromptOptionsResolver = (
	context: CodingAgentModelCallPromptContext,
) => Promise<CodingAgentSystemPromptOptions> | CodingAgentSystemPromptOptions;

export interface CodingAgentModelCallFrameComposerOptions {
	readonly resolveSystemPromptOptions: CodingAgentSystemPromptOptionsResolver;
	readonly readMcpPromptState?: () => CodingAgentMcpPromptState;
	readonly readAvailableTools?: () => ReadonlyMap<string, RuntimeToolDefinition>;
	readonly pluginRunOrchestrator?: CodingAgentPluginRunOrchestrator;
	readonly pluginToolRuntime?: CodingAgentPluginToolRuntime;
	readonly hookRuntime?: EcosystemHookRuntime;
}

export interface CodingAgentMcpPromptState {
	readonly tools: readonly {
		readonly name: string;
		readonly description: string;
	}[];
	readonly deferred: boolean;
}

/**
 * 在 Coding Agent 产品边界内把调用级资源编译成最终系统提示词。
 *
 * Runtime Core 只看到最终 InstructionBlock；Legacy 的 Prompt block、Plugin 静态操作、
 * Skill、Mode 与 Persona 等产品语义继续由既有结构化 Prompt 编译器解释。
 */
export class CodingAgentModelCallFrameComposer implements ModelCallFrameComposer {
	constructor(private readonly options: CodingAgentModelCallFrameComposerOptions) {}

	async compose(context: ModelCallFrameCompositionContext): Promise<ModelCallFrame> {
		context.signal.throwIfAborted();
		const baseAvailableTools = new Map(this.options.readAvailableTools?.() ?? context.frame.tools);
		for (const [name, tool] of context.frame.tools) {
			baseAvailableTools.set(name, tool);
		}
		const pluginToolSurface = this.options.pluginToolRuntime?.compose(context, baseAvailableTools);
		const effectiveContext: ModelCallFrameCompositionContext = pluginToolSurface
			? { ...context, frame: pluginToolSurface.frame }
			: context;
		const availableTools = pluginToolSurface?.availableTools ?? baseAvailableTools;
		const activeToolNames = [...effectiveContext.frame.tools.keys()];
		const promptOptions = await this.options.resolveSystemPromptOptions({
			...effectiveContext,
			activeToolNames,
		});
		context.signal.throwIfAborted();
		const mcpPromptState = this.options.readMcpPromptState?.();
		const createDraft = (selectedTools: readonly string[]): SystemPromptDraft => {
			const draft = buildSystemPromptDraft({
				...promptOptions,
				selectedTools: [...selectedTools],
				...(mcpPromptState
					? {
							mcpTools: mcpPromptState.tools.map(({ name, description }) => ({ name, description })),
							mcpDeferred: mcpPromptState.deferred,
						}
					: {}),
			});
			appendFeatureInstructions(draft, effectiveContext.frame.instructions);
			return draft;
		};
		const pluginFrame = await this.options.pluginRunOrchestrator?.compose({
			context: effectiveContext,
			availableTools,
			createDraft,
		});
		const draft = pluginFrame?.draft ?? createDraft(activeToolNames);
		const tools = pluginFrame?.tools ?? effectiveContext.frame.tools;
		return {
			instructions: [
				{
					id: "coding-agent.system-prompt",
					content: renderSystemPromptDraft(draft),
					priority: 0,
				},
			],
			tools: this.options.hookRuntime ? wrapRuntimeToolsWithEcosystemHooks(tools, this.options.hookRuntime) : tools,
		};
	}
}

function appendFeatureInstructions(draft: SystemPromptDraft, instructions: readonly InstructionBlock[]): void {
	const blockIds = new Set(draft.blocks.map(({ id }) => id));
	for (const instruction of instructions) {
		if (blockIds.has(instruction.id)) {
			throw new Error(`Duplicate Coding Agent system prompt block id: ${instruction.id}`);
		}
		blockIds.add(instruction.id);
		draft.blocks.push({
			id: instruction.id,
			type: "plugin",
			source: { kind: "plugin", pluginId: `feature:${instruction.id}` },
			content: instruction.content,
			priority: instruction.priority,
			enabled: instruction.content.length > 0,
		});
	}
}
