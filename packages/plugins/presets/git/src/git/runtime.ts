import type { PluginCommandApi } from "@vetta/plugin-sdk";

/**
 * Module Federation may duplicate this module across remote/host boundaries, so
 * shared mutable runtime state hangs on globalThis (see the host's plugin notes
 * about MF module singletons). Holds the command API and a refresh signal bus.
 */
/** Resize the activity panel that hosts the Git tab (px or "max"); omit to keep current width. */
export type PanelResizer = (width?: number | "max") => void;

interface GitRuntime {
	command: PluginCommandApi | null;
	resizePanel: PanelResizer | null;
	refreshListeners: Set<() => void>;
}

const KEY = "__vettaGitPluginRuntime__";

function runtime(): GitRuntime {
	const g = globalThis as Record<string, unknown>;
	if (!g[KEY]) {
		g[KEY] = {
			command: null,
			resizePanel: null,
			refreshListeners: new Set<() => void>(),
		} satisfies GitRuntime;
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

/** Register the host-backed panel resizer (wired in activate from ctx.ui). */
export function setPanelResizer(resize: PanelResizer): void {
	runtime().resizePanel = resize;
}

/** Resize the activity panel (no-op until the resizer is registered). */
export function resizePanel(width?: number | "max"): void {
	runtime().resizePanel?.(width);
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
