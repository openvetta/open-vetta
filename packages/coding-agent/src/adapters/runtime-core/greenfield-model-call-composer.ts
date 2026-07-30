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
import type { CodingAgentPluginMcpRuntime } from "./greenfield-plugin-mcp-runtime.js";
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
	readonly pluginMcpRuntime?: CodingAgentPluginMcpRuntime;
	readonly readAgentMode?: () => string | undefined;
	readonly isMcpToolVisible?: (toolName: string) => boolean;
	readonly pluginRunOrchestrator?: CodingAgentPluginRunOrchestrator;
	readonly pluginToolRuntime?: CodingAgentPluginToolRuntime;
	/** 系统提示词额外公布、但不加入可执行 Tool Frame 的既有宿主工具名称。 */
	readonly systemPromptAdvertisedToolNames?: readonly string[];
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
		const pluginMcpSurface = this.options.pluginMcpRuntime?.compose(context, baseAvailableTools, {
			agentMode: this.options.readAgentMode?.(),
			isToolVisible: this.options.isMcpToolVisible ?? (() => true),
		});
		const mcpContext: ModelCallFrameCompositionContext = pluginMcpSurface
			? { ...context, frame: pluginMcpSurface.frame }
			: context;
		const mcpAvailableTools = pluginMcpSurface?.availableTools ?? baseAvailableTools;
		const pluginToolSurface = this.options.pluginToolRuntime?.compose(mcpContext, mcpAvailableTools);
		const effectiveContext: ModelCallFrameCompositionContext = pluginToolSurface
			? { ...mcpContext, frame: pluginToolSurface.frame }
			: mcpContext;
		const availableTools = pluginToolSurface?.availableTools ?? mcpAvailableTools;
		const activeToolNames = [...effectiveContext.frame.tools.keys()];
		const promptOptions = await this.options.resolveSystemPromptOptions({
			...effectiveContext,
			activeToolNames,
		});
		context.signal.throwIfAborted();
		const mcpPromptState = this.options.readMcpPromptState?.();
		const createDraft = (selectedTools: readonly string[]): SystemPromptDraft => {
			const advertisedTools = [
				...new Set([...selectedTools, ...(this.options.systemPromptAdvertisedToolNames ?? [])]),
			];
			const draft = buildSystemPromptDraft({
				...promptOptions,
				selectedTools: orderModelToolNames(advertisedTools, availableTools),
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
		const tools = orderModelTools(pluginFrame?.tools ?? effectiveContext.frame.tools);
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

function orderModelTools(
	tools: ReadonlyMap<string, RuntimeToolDefinition>,
): ReadonlyMap<string, RuntimeToolDefinition> {
	const entries = [...tools.entries()].map(([name, tool], sourceIndex) => ({ name, tool, sourceIndex }));
	entries.sort((left, right) => {
		const leftOrder = left.tool.modelOrder;
		const rightOrder = right.tool.modelOrder;
		if (leftOrder !== undefined && rightOrder !== undefined) return leftOrder - rightOrder;
		if (leftOrder !== undefined) return -1;
		if (rightOrder !== undefined) return 1;
		return left.sourceIndex - right.sourceIndex;
	});
	return new Map(entries.map(({ name, tool }) => [name, tool]));
}

function orderModelToolNames(
	names: readonly string[],
	availableTools: ReadonlyMap<string, RuntimeToolDefinition>,
): string[] {
	return [...names]
		.map((name, sourceIndex) => ({ name, sourceIndex, modelOrder: availableTools.get(name)?.modelOrder }))
		.sort((left, right) => {
			if (left.modelOrder !== undefined && right.modelOrder !== undefined) {
				return left.modelOrder - right.modelOrder;
			}
			if (left.modelOrder !== undefined) return -1;
			if (right.modelOrder !== undefined) return 1;
			return left.sourceIndex - right.sourceIndex;
		})
		.map(({ name }) => name);
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
