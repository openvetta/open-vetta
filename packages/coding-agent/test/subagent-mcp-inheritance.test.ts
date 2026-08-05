import type { AgentTool } from "@vetta/agent-core";
import { describe, expect, it } from "vitest";
import { SubagentCoordinator } from "../src/core/subagents/coordinator.js";
import { createDefaultSubagentTypeRegistry } from "../src/core/subagents/index.js";
import type { SubagentChildHandle, SubagentParentContext } from "../src/core/subagents/types.js";

describe("Subagent MCP inheritance", () => {
	it("reads the parent binding set at each child creation boundary", async () => {
		const firstTool = tool("mcp_search_first");
		const secondTool = tool("mcp_search_second");
		let currentTools: readonly AgentTool[] = [firstTool];
		const received: Array<SubagentParentContext["parentMcpTools"]> = [];
		const coordinator = new SubagentCoordinator({
			factory: {
				create: async (_request, parent) => {
					received.push(parent.parentMcpTools);
					return childHandle(`child-${received.length}`);
				},
			},
			typeRegistry: createDefaultSubagentTypeRegistry(),
			parentSessionId: "parent",
			cwd: ".",
			scenario: "cli",
			getModel: () => ({ id: "model", provider: "test", name: "Model" }) as never,
			getThinkingLevel: () => "off",
			getParentMcpTools: () => currentTools,
		});

		await coordinator.spawn({
			taskName: "first",
			message: "inspect first",
			agentType: "explorer",
		});
		currentTools = [secondTool];
		await coordinator.spawn({
			taskName: "second",
			message: "inspect second",
			agentType: "explorer",
		});

		expect(received).toEqual([[firstTool], [secondTool]]);
		await coordinator.dispose();
	});
});

function tool(name: string): AgentTool {
	return {
		name,
		label: name,
		description: name,
		parameters: { type: "object", properties: {} } as never,
		execute: async () => ({ content: [{ type: "text", text: name }], details: {} }),
	};
}

function childHandle(sessionId: string): SubagentChildHandle {
	return {
		sessionId,
		prompt: async () => {},
		sendMessage: async () => {},
		followUp: async () => {},
		abort() {},
		waitForIdle: async () => {},
		isStreaming: () => false,
		getLastAssistantText: () => "done",
		dispose() {},
		subscribe: () => () => {},
	};
}
