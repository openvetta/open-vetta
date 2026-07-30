import type { AgentFeatureDefinition } from "@vetta/runtime-core/kernel";
import { matchesAgentMode } from "../../core/agent-mode.js";
import type { Skill } from "../../core/skills.js";
import { createInvokeSkillTool } from "../../core/tools/invoke-skill/index.js";
import { CODING_AGENT_MODEL_TOOL_ORDER } from "./greenfield-model-tool-order.js";
import type { CodingAgentPromptResourceSource } from "./greenfield-prompt-runtime.js";
import { adaptCodingAgentToolRegistration } from "./greenfield-tool-adapter.js";

export interface CodingAgentInvokeSkillRuntimeFeatureOptions {
	readonly resourceSource: CodingAgentPromptResourceSource;
	readonly readAgentMode?: () => string | undefined;
}

/**
 * Session 级动态 Skill 能力。
 *
 * 每个模型调用边界重新刷新资源；执行时再次解析当前可见 Skill，避免把已删除或已切换模式的
 * 本地 Skill 固化在 Session/Turn 之外的快照中。
 */
export function createCodingAgentInvokeSkillRuntimeFeature(
	options: CodingAgentInvokeSkillRuntimeFeatureOptions,
): AgentFeatureDefinition {
	const readVisibleSkills = (): Skill[] => {
		options.resourceSource.refreshSkillsIfChanged();
		const mode = options.readAgentMode?.();
		return options.resourceSource
			.getSkills()
			.skills.filter(
				(skill) =>
					!skill.disableModelInvocation && skill.type !== "scene" && matchesAgentMode(skill.agentMode, mode),
			);
	};
	const registration = adaptCodingAgentToolRegistration(
		createInvokeSkillTool({
			getSkills: readVisibleSkills,
		}),
		{ modelOrder: CODING_AGENT_MODEL_TOOL_ORDER.invokeSkill },
	);

	return {
		id: "coding-agent.invoke-skill",
		async prepare(context) {
			context.signal.throwIfAborted();
			return {
				async contribute(contributionContext) {
					contributionContext.signal.throwIfAborted();
					return readVisibleSkills().length > 0 ? { tools: [registration.tool] } : {};
				},
				async dispose() {},
			};
		},
	};
}
