import type {
	ModelCallFrame,
	ModelCallFrameComposer,
	ModelCallFrameCompositionContext,
} from "@vetta/runtime-core/kernel";
import { type BuildSystemPromptOptions, buildSystemPrompt } from "../../core/system-prompt.js";

export type CodingAgentSystemPromptOptions = Omit<BuildSystemPromptOptions, "selectedTools">;

export interface CodingAgentModelCallPromptContext extends ModelCallFrameCompositionContext {
	readonly activeToolNames: readonly string[];
}

export type CodingAgentSystemPromptOptionsResolver = (
	context: CodingAgentModelCallPromptContext,
) => Promise<CodingAgentSystemPromptOptions> | CodingAgentSystemPromptOptions;

export interface CodingAgentModelCallFrameComposerOptions {
	readonly resolveSystemPromptOptions: CodingAgentSystemPromptOptionsResolver;
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
		const systemPrompt = buildSystemPrompt({
			...promptOptions,
			selectedTools: activeToolNames,
		});
		return {
			instructions: [
				{
					id: "coding-agent.system-prompt",
					content: systemPrompt,
					priority: 0,
				},
			],
			tools: context.frame.tools,
		};
	}
}
