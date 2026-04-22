import type { ToolDefinition } from "@vetta/coding-agent";
import { buildLinuxBubblewrapToolDefinitions, type LinuxBubblewrapToolOptions } from "./linux-bwrap-tools.js";
import { buildWindowsSandboxToolDefinitions, type WindowsSandboxToolOptions } from "./windows-sandbox-tools.js";

export interface SandboxToolOptions {
	cwd: string;
	platform?: NodeJS.Platform;
	windowsSandboxHostPath?: WindowsSandboxToolOptions["sandboxHostPath"];
	linuxBubblewrapPath?: LinuxBubblewrapToolOptions["bubblewrapPath"];
}

export function buildSandboxToolDefinitions(options: SandboxToolOptions): ToolDefinition[] | undefined {
	const platform = options.platform ?? process.platform;
	if (platform === "win32") {
		return buildWindowsSandboxToolDefinitions({
			cwd: options.cwd,
			sandboxHostPath: options.windowsSandboxHostPath,
		});
	}
	if (platform === "linux") {
		return buildLinuxBubblewrapToolDefinitions({
			cwd: options.cwd,
			bubblewrapPath: options.linuxBubblewrapPath,
		});
	}
	return undefined;
}
