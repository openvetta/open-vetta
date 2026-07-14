import type { PluginCommandApi, PluginFsApi } from "@vetta-org/plugin-sdk";

interface WorkbenchRuntime {
	command: PluginCommandApi | null;
	fs: PluginFsApi | null;
}

const KEY = "__vettaPluginWorkbenchRuntime__";

function runtime(): WorkbenchRuntime {
	const g = globalThis as Record<string, unknown>;
	if (!g[KEY]) {
		g[KEY] = { command: null, fs: null };
	}
	return g[KEY] as WorkbenchRuntime;
}

export function setWorkbenchRuntime(command: PluginCommandApi, fs: PluginFsApi): void {
	const r = runtime();
	r.command = command;
	r.fs = fs;
}

export function getWorkbenchCommand(): PluginCommandApi {
	const command = runtime().command;
	if (!command) throw new Error("Workbench command API not ready");
	return command;
}

export function getWorkbenchFs(): PluginFsApi {
	const fs = runtime().fs;
	if (!fs) throw new Error("Workbench fs API not ready");
	return fs;
}
