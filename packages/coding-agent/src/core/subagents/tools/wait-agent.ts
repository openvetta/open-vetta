import { type Static, Type } from "@sinclair/typebox";
import type { CodingAgentTool } from "../../session/tool-scope.js";
import { toolCallDescriptionSchema } from "../../tools/tool-call-description.js";
import type { SubagentCoordinator } from "../coordinator.js";

const waitAgentSchema = Type.Object({
	description: toolCallDescriptionSchema,
	targets: Type.Optional(
		Type.Array(Type.String(), {
			description:
				"Child ids, task_names, or /root/<task_name> paths. Omit to wait on any undelivered/active child.",
		}),
	),
	timeout_ms: Type.Optional(
		Type.Number({
			description: "Wait timeout in ms (default 30000, clamp 1000..300000)",
		}),
	),
});

export type WaitAgentToolInput = Static<typeof waitAgentSchema>;

export function createWaitAgentTool(options: {
	getCoordinator: () => SubagentCoordinator | undefined;
}): CodingAgentTool<typeof waitAgentSchema> {
	return {
		name: "wait_agent",
		label: "wait_agent",
		scope_use: ["conversation", "project", "cli"],
		category: "agent-control",
		description:
			"Wait until one or more subagents reach a terminal state. Event-driven (no polling). Consumes the completion so a <subagent_notification> will not re-deliver the same result.",
		parameters: waitAgentSchema,
		execute: async (_toolCallId, input: WaitAgentToolInput) => {
			const coord = options.getCoordinator();
			if (!coord) throw new Error("Subagents are not enabled for this session.");
			const result = await coord.wait({
				targets: input.targets,
				timeoutMs: input.timeout_ms,
			});
			if (result.agents.length === 0) {
				const text = result.timedOut
					? "wait_agent timed out with no terminal subagent results."
					: "No matching subagents to wait on.";
				return {
					content: [{ type: "text" as const, text }],
					details: { timedOut: result.timedOut, agents: [] },
				};
			}
			const lines = result.agents.map((a) => {
				const parts = [`id=${a.id}`, `path=${a.path}`, `type=${a.agentType}`, `status=${a.status}`];
				if (a.errorMessage) parts.push(`error=${a.errorMessage}`);
				if (a.finalText) parts.push(`\nsummary:\n${a.finalText}`);
				return parts.join(" ");
			});
			const text = [
				result.timedOut ? "wait_agent finished (timeout with partial results):" : "wait_agent results:",
				...lines,
			].join("\n\n");
			return {
				content: [{ type: "text" as const, text }],
				details: { timedOut: result.timedOut, agents: result.agents },
			};
		},
	};
}
