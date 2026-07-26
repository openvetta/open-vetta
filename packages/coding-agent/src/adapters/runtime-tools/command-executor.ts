import type { ImageContent, TextContent } from "@vetta/ai";
import { type BashToolInput, type BashToolOptions, createBashTool } from "../../core/tools/bash/index.js";
import { createShellTool } from "../../core/tools/shell/index.js";

export type RuntimeCommandToolName = "bash" | "shell";

export interface RuntimeCommandToolResult {
	readonly content: readonly (TextContent | ImageContent)[];
	readonly details?: unknown;
}

export interface RuntimeCommandToolExecutorRequest {
	readonly toolName: RuntimeCommandToolName;
	readonly cwd: string;
	readonly toolCallId: string;
	readonly input: Readonly<BashToolInput>;
	readonly signal: AbortSignal;
	readonly onUpdate?: (result: RuntimeCommandToolResult) => void;
	readonly reportPhase?: (label: string) => void;
}

export interface RuntimeCommandToolExecutor {
	execute(request: RuntimeCommandToolExecutorRequest): Promise<RuntimeCommandToolResult>;
}

export interface LegacyCommandToolExecutorOptions {
	readonly toolOptions?: BashToolOptions;
}

type LegacyCommandTool = ReturnType<typeof createBashTool>;

/**
 * Anti-corruption adapter for the greenfield Runtime command-tool Port.
 * It preserves the complete legacy command behavior while registration,
 * activation, and Tool Loop ownership move to the new Runtime.
 */
export function createLegacyCommandToolExecutor(
	options: LegacyCommandToolExecutorOptions = {},
): RuntimeCommandToolExecutor {
	const tools = new Map<string, LegacyCommandTool>();

	return {
		async execute(request) {
			const tool = resolveLegacyTool(tools, request.toolName, request.cwd, options.toolOptions);
			const result = await tool.execute(
				request.toolCallId,
				request.input,
				request.signal,
				request.onUpdate
					? (update) => request.onUpdate?.({ content: update.content, details: update.details })
					: undefined,
				request.reportPhase ? { phase: request.reportPhase } : undefined,
			);
			return { content: result.content, details: result.details };
		},
	};
}

function resolveLegacyTool(
	tools: Map<string, LegacyCommandTool>,
	toolName: RuntimeCommandToolName,
	cwd: string,
	toolOptions: BashToolOptions | undefined,
): LegacyCommandTool {
	const key = `${toolName}\0${cwd}`;
	const existing = tools.get(key);
	if (existing) return existing;

	const tool = toolName === "shell" ? createShellTool(cwd, toolOptions) : createBashTool(cwd, toolOptions);
	tools.set(key, tool);
	return tool;
}
