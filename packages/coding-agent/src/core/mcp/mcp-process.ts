/** @deprecated The stdio process adapter now lives in @vetta/runtime-mcp. */
import { StdioMcpProcess, type StdioMcpProcessOptions } from "@vetta/runtime-mcp";

export type McpProcessOptions = StdioMcpProcessOptions;

export class McpProcess extends StdioMcpProcess {}
