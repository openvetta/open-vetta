import type { AgentTool, AgentToolUpdateCallback } from "@mariozechner/pi-agent-core";
import type { ToolDefinition } from "@vetta/coding-agent";
import {
	collectShellWritePermissionRequests,
	confirmSandboxPermission,
	runWithSandboxShellGrant,
} from "./sandbox-permissions.js";
import { assertWorkspacePathAllowed, resolveWorkspacePathAccess } from "./workspace-guard.js";

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

function extractCommandFromParams(params: unknown): string | undefined {
	if (!params || typeof params !== "object") return undefined;
	if (!("command" in params)) return undefined;
	const commandValue = (params as { command?: unknown }).command;
	return typeof commandValue === "string" ? commandValue : undefined;
}

export function wrapWorkspaceGuard(tool: AgentTool<any, any>, cwd: string): ToolDefinition {
	const definition = toToolDefinition(tool);
	return {
		...definition,
		execute: async (toolCallId, params, signal, onUpdate, ctx) => {
			const requestedPath = extractPathFromParams(params);
			if (requestedPath && !PATH_ID_REGEX.test(requestedPath.trim())) {
				const access = await resolveWorkspacePathAccess(requestedPath, cwd);
				if (!access.allowed) {
					const capability = definition.name === "read" ? "file.read" : "file.write";
					const confirmed = await confirmSandboxPermission(ctx, {
						capability,
						toolName: definition.name,
						target: requestedPath,
						resolvedTarget: access.targetBoundary,
						grantRoot: access.targetBoundary,
						reason: `${definition.name} target is outside the workspace sandbox`,
					});
					if (!confirmed) {
						await assertWorkspacePathAllowed(requestedPath, cwd, definition.name);
					}
				}
			}
			return definition.execute(toolCallId, params, signal, onUpdate, ctx);
		},
	};
}

export function wrapShellPermissionGuard(tool: AgentTool<any, any>, cwd: string): ToolDefinition {
	const definition = toToolDefinition(tool);
	return {
		...definition,
		execute: async (toolCallId, params, signal, onUpdate, ctx) => {
			const command = extractCommandFromParams(params);
			const requests = command ? collectShellWritePermissionRequests(command, cwd) : [];
			const allowWriteRoots: string[] = [];
			for (const request of requests) {
				const confirmed = await confirmSandboxPermission(ctx, request);
				if (!confirmed) {
					throw new Error(
						`Access denied by sandbox: shell command requires write permission outside workspace.` +
							`\ntarget=${request.target}` +
							`\nresolved=${request.resolvedTarget}` +
							(request.grantRoot ? `\ngrantRoot=${request.grantRoot}` : ""),
					);
				}
				if (request.grantRoot) allowWriteRoots.push(request.grantRoot);
			}

			if (allowWriteRoots.length === 0) return definition.execute(toolCallId, params, signal, onUpdate, ctx);
			return runWithSandboxShellGrant(cwd, { allowWriteRoots: Array.from(new Set(allowWriteRoots)) }, () =>
				definition.execute(toolCallId, params, signal, onUpdate, ctx),
			);
		},
	};
}
