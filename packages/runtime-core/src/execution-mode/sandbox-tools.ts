import type { ToolDefinition } from "@vetta/coding-agent";
import { buildLinuxBubblewrapToolDefinitions, type LinuxBubblewrapToolOptions } from "./linux-bwrap-tools.js";
import { buildMacosSeatbeltToolDefinitions, type MacosSeatbeltToolOptions } from "./macos-seatbelt-tools.js";
import { buildWindowsSandboxToolDefinitions, type WindowsSandboxToolOptions } from "./windows-sandbox-tools.js";

export interface SandboxToolOptions {
	cwd: string;
	platform?: NodeJS.Platform;
	windowsSandboxHostPath?: WindowsSandboxToolOptions["sandboxHostPath"];
	linuxBubblewrapPath?: LinuxBubblewrapToolOptions["bubblewrapPath"];
	macosSandboxExecPath?: MacosSeatbeltToolOptions["sandboxExecPath"];
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
	if (platform === "darwin") {
		return buildMacosSeatbeltToolDefinitions({
			cwd: options.cwd,
			sandboxExecPath: options.macosSandboxExecPath,
		});
	}
	return undefined;
}
