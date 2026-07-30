import type { Static, TSchema } from "@sinclair/typebox";
import type { RuntimeToolDefinition } from "@vetta/runtime-core/kernel";
import type { EcosystemHookAwareTool } from "../../core/hooks/tool-wrapper.js";
import type { CodingAgentTool, ConversationScenario, ToolCategory } from "../../core/session/tool-scope.js";
import type { EcosystemHookAwareRuntimeTool } from "./greenfield-hook-tool-wrapper.js";

export interface CodingAgentRuntimeToolRegistration {
	readonly tool: RuntimeToolDefinition;
	readonly scopeUse: readonly ConversationScenario[];
	readonly requires?: readonly string[];
	readonly agentModes?: readonly string[];
	readonly modelOrder?: number;
	readonly category: ToolCategory;
}

export interface AdaptCodingAgentToolRegistrationOptions {
	readonly modelOrder?: number;
}

/**
 * 将旧 AgentTool 调用协议适配到 Greenfield RuntimeToolDefinition。
 *
 * 可用范围和 capability 元数据留在注册项上，工具定义只负责执行协议转换。
 */
export function adaptCodingAgentToolRegistration<TParameters extends TSchema, TDetails>(
	tool: CodingAgentTool<TParameters, TDetails>,
	options: AdaptCodingAgentToolRegistrationOptions = {},
): CodingAgentRuntimeToolRegistration {
	const hookMetadata = (tool as CodingAgentTool<TParameters, TDetails> & EcosystemHookAwareTool).ecosystemHook;
	const runtimeTool: EcosystemHookAwareRuntimeTool = {
		name: tool.name,
		label: tool.label,
		description: tool.description,
		inputSchema: tool.parameters,
		modelOrder: options.modelOrder,
		ecosystemHook: hookMetadata,
		async execute(request) {
			return tool.execute(
				request.toolCallId,
				request.input as Static<TParameters>,
				request.signal,
				request.onUpdate,
				request.reportPhase ? { phase: request.reportPhase } : undefined,
			);
		},
	};
	return {
		tool: runtimeTool,
		scopeUse: tool.scope_use ?? [],
		requires: tool.requires,
		agentModes: tool.agent_mode,
		modelOrder: options.modelOrder,
		category: isToolCategory(tool.category) ? tool.category : "external",
	};
}

function isToolCategory(value: string | undefined): value is ToolCategory {
	return (
		value === "core" ||
		value === "doc" ||
		value === "kb-write" ||
		value === "kb-read" ||
		value === "agent-control" ||
		value === "media" ||
		value === "im" ||
		value === "memory" ||
		value === "external"
	);
}
