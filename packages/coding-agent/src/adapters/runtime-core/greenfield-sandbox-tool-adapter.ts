import type { RuntimeSessionHostInteractionContext } from "@vetta/runtime-core";
import type { RuntimeToolDefinition } from "@vetta/runtime-core/kernel";
import type { ExtensionContext, ExtensionUIContext, ToolDefinition } from "../../core/extensions/types.js";
import { buildSandboxToolDefinitions } from "./execution-mode/sandbox-tools.js";
import type { CodingAgentRuntimeToolRegistration } from "./greenfield-tool-adapter.js";

export interface CodingAgentGreenfieldSandboxToolsOptions {
	readonly cwd: string;
	readonly hostInteraction: RuntimeSessionHostInteractionContext;
	readonly windowsSandboxHostPath?: string;
	readonly linuxBubblewrapPath?: string;
	readonly macosSandboxExecPath?: string;
	readonly getSessionId?: () => string | undefined;
}

/**
 * 迁移期仅复用既有平台 sandbox 实现，并把旧 Extension UI 调用收敛到 Runtime Host Interaction Port。
 */
export function createCodingAgentGreenfieldSandboxToolRegistrations(
	options: CodingAgentGreenfieldSandboxToolsOptions,
): readonly CodingAgentRuntimeToolRegistration[] {
	const definitions =
		buildSandboxToolDefinitions({
			cwd: options.cwd,
			windowsSandboxHostPath: options.windowsSandboxHostPath,
			linuxBubblewrapPath: options.linuxBubblewrapPath,
			macosSandboxExecPath: options.macosSandboxExecPath,
			getSessionId: options.getSessionId,
		}) ?? [];
	return definitions.map((definition) => adaptSandboxTool(definition, options));
}

function adaptSandboxTool(
	definition: ToolDefinition,
	options: CodingAgentGreenfieldSandboxToolsOptions,
): CodingAgentRuntimeToolRegistration {
	const runtimeTool: RuntimeToolDefinition = {
		name: definition.name,
		label: definition.label,
		description: definition.description,
		inputSchema: definition.parameters,
		execute: (request) =>
			definition.execute(
				request.toolCallId,
				request.input as never,
				request.signal,
				request.onUpdate as never,
				createSandboxExtensionContext(options, request.signal),
			),
	};
	return {
		tool: runtimeTool,
		scopeUse: definition.scope_use ?? [],
		requires: definition.requires,
		category: "core",
	};
}

function createSandboxExtensionContext(
	options: CodingAgentGreenfieldSandboxToolsOptions,
	signal: AbortSignal,
): ExtensionContext {
	const ui = {
		confirm: (title: string, message: string) => options.hostInteraction.confirm(title, message, signal),
		requestSandboxGrant: (request) => options.hostInteraction.requestSandboxGrant(request),
	} as ExtensionUIContext;
	return {
		hasUI: true,
		ui,
		cwd: options.cwd,
	} as ExtensionContext;
}
