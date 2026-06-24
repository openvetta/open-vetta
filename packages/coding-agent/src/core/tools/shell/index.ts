import {
	type BashOperations,
	type BashSpawnContext,
	type BashSpawnHook,
	type BashToolDetails,
	type BashToolInput,
	type BashToolOptions,
	createBashTool,
} from "../bash/index.js";
import { loadToolDescription } from "../description.js";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES } from "../truncate.js";

export type ShellToolInput = BashToolInput;
export type ShellToolDetails = BashToolDetails;
export type ShellOperations = BashOperations;
export type ShellSpawnContext = BashSpawnContext;
export type ShellSpawnHook = BashSpawnHook;
export type ShellToolOptions = BashToolOptions;

export function createShellTool(cwd: string, options?: ShellToolOptions): ReturnType<typeof createBashTool> {
	const base = createBashTool(cwd, options);
	const fallbackDescription = `Execute a shell command in the current working directory. Returns stdout and stderr. Output is truncated to last ${DEFAULT_MAX_LINES} lines or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first). If truncated, full output is saved to a temp file. Optionally provide a timeout in seconds.`;
	const description = loadToolDescription(import.meta.url, fallbackDescription);

	return {
		...base,
		name: "shell",
		label: "shell",
		scope_use: ["im-claw", "conversation", "project", "batch", "automation", "kb-processing", "cli"],
		category: "core",
		description,
	};
}

/** Default shell tool using process.cwd() - for backwards compatibility */
export const shellTool = createShellTool(process.cwd());
