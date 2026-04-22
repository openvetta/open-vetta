import type { AgentTool, AgentToolUpdateCallback } from "@mariozechner/pi-agent-core";
import type { ToolDefinition } from "@vetta/coding-agent";
import { assertWorkspacePathAllowed } from "./workspace-guard.js";

const PATH_ID_REGEX = /^@PATH_\d{4}$/i;

// AgentTool parameter types are intentionally tool-specific and not covariant.
// Keep this bridge narrow so runtime-core can wrap built-in tools without
// duplicating per-tool adapters.
export function toToolDefinition(tool: AgentTool<any, any>): ToolDefinition {
	return {
		name: tool.name,
		label: tool.label,
		description: tool.description,
		parameters: tool.parameters,
		execute: async (
			toolCallId: string,
			params: unknown,
			signal: AbortSignal | undefined,
			onUpdate: AgentToolUpdateCallback<unknown> | undefined,
		) => {
			return tool.execute(toolCallId, params as never, signal, onUpdate as never);
		},
	};
}

function extractPathFromParams(params: unknown): string | undefined {
	if (!params || typeof params !== "object") return undefined;
	if (!("path" in params)) return undefined;
	const pathValue = (params as { path?: unknown }).path;
	return typeof pathValue === "string" ? pathValue : undefined;
}

export function wrapWorkspaceGuard(tool: AgentTool<any, any>, cwd: string): ToolDefinition {
	const definition = toToolDefinition(tool);
	return {
		...definition,
		execute: async (toolCallId, params, signal, onUpdate, ctx) => {
			const requestedPath = extractPathFromParams(params);
			if (requestedPath && !PATH_ID_REGEX.test(requestedPath.trim())) {
				await assertWorkspacePathAllowed(requestedPath, cwd, definition.name);
			}
			return definition.execute(toolCallId, params, signal, onUpdate, ctx);
		},
	};
}
