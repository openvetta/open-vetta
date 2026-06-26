import type { PluginCommandApi } from "@vetta/plugin-sdk";

/**
 * Module Federation may duplicate this module across remote/host boundaries, so
 * shared mutable runtime state hangs on globalThis (see the host's plugin notes
 * about MF module singletons). Holds the command API and a refresh signal bus.
 */
interface GitRuntime {
	command: PluginCommandApi | null;
	refreshListeners: Set<() => void>;
}

const KEY = "__vettaGitPluginRuntime__";

function runtime(): GitRuntime {
	const g = globalThis as Record<string, unknown>;
	if (!g[KEY]) {
		g[KEY] = { command: null, refreshListeners: new Set<() => void>() } satisfies GitRuntime;
	}
	return g[KEY] as GitRuntime;
}

export function setGitCommand(api: PluginCommandApi): void {
	runtime().command = api;
}

export function getGitCommand(): PluginCommandApi {
	const api = runtime().command;
	if (!api) throw new Error("Git plugin command API not initialized");
	return api;
}

/** Subscribe a panel to global refresh signals (turn-end, etc). Returns unsubscribe. */
export function onRefreshSignal(listener: () => void): () => void {
	const set = runtime().refreshListeners;
	set.add(listener);
	return () => set.delete(listener);
}

/** Fire a refresh signal to all mounted panels. */
export function emitRefreshSignal(): void {
	for (const listener of runtime().refreshListeners) listener();
}
