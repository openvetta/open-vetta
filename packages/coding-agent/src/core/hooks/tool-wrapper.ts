import type { TSchema } from "@sinclair/typebox";
import type { AgentTool } from "@vetta/agent-core";
import type { EcosystemHookRuntime, EcosystemToolDescriptor } from "@vetta/ecosystem-adapter/hooks";

export type EcosystemHookAwareTool = AgentTool & { ecosystemHook?: EcosystemToolDescriptor };

export function wrapToolsWithEcosystemHooks(tools: AgentTool[], hooks: EcosystemHookRuntime): AgentTool[] {
	return tools.map((tool) => wrapTool(tool, hooks));
}

function wrapTool<TParameters extends TSchema, TDetails>(
	tool: AgentTool<TParameters, TDetails>,
	hooks: EcosystemHookRuntime,
): AgentTool<TParameters, TDetails> {
	return {
		...tool,
		execute: async (toolCallId, params, signal, onUpdate, context) => {
			const descriptor = toolDescriptor(tool);
			const pre = await hooks.runPreToolUse(toolCallId, descriptor, params, signal);
			await hooks.recordAdditionalContexts(pre.additionalContexts);
			if (pre.shouldStop || pre.shouldBlock) {
				throw new Error(pre.stopReason ?? pre.blockReason ?? "Tool execution blocked by ecosystem hook");
			}
			const executionParams = (pre.updatedToolInput ?? params) as typeof params;

			const result = await tool.execute(toolCallId, executionParams, signal, onUpdate, context);
			const post = await hooks.runPostToolUse(toolCallId, descriptor, executionParams, result, signal);
			await hooks.recordAdditionalContexts(post.additionalContexts);
			if (post.shouldStop || post.shouldBlock) {
				throw new Error(
					post.stopReason ?? post.blockReason ?? post.feedbackMessage ?? "Tool result blocked by ecosystem hook",
				);
			}
			return post.feedbackMessage === undefined
				? result
				: {
						...result,
						content: [{ type: "text", text: post.feedbackMessage }],
					};
		},
	};
}

function toolDescriptor(tool: { name: string; ecosystemHook?: EcosystemToolDescriptor }): EcosystemToolDescriptor {
	const metadata = tool.ecosystemHook;
	if (metadata) return metadata;
	const hostName = tool.name;
	if (hostName === "bash" || hostName === "shell") return { hostName, kind: "shell" };
	if (hostName === "edit" || hostName === "write") return { hostName, kind: "file-edit" };
	if (hostName === "spawn_agent") return { hostName, kind: "agent" };
	if (hostName.startsWith("mcp_")) return { hostName, kind: "mcp" };
	return { hostName, kind: "function" };
}
