import type {
	InstructionBlock,
	ModelCallFrame,
	ModelCallFrameComposer,
	ModelCallFrameCompositionContext,
} from "@vetta/runtime-core/kernel";
import {
	type BuildSystemPromptOptions,
	buildSystemPromptDraft,
	renderSystemPromptDraft,
	type SystemPromptDraft,
} from "../../core/system-prompt.js";

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
		const activeToolNames = [...context.frame.tools.keys()];
		const promptOptions = await this.options.resolveSystemPromptOptions({
			...context,
			activeToolNames,
		});
		context.signal.throwIfAborted();
		const mcpPromptState = this.options.readMcpPromptState?.();
		const draft = buildSystemPromptDraft({
			...promptOptions,
			selectedTools: activeToolNames,
			...(mcpPromptState
				? {
						mcpTools: mcpPromptState.tools.map(({ name, description }) => ({ name, description })),
						mcpDeferred: mcpPromptState.deferred,
					}
				: {}),
		});
		appendFeatureInstructions(draft, context.frame.instructions);
		return {
			instructions: [
				{
					id: "coding-agent.system-prompt",
					content: renderSystemPromptDraft(draft),
					priority: 0,
				},
			],
			tools: context.frame.tools,
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
