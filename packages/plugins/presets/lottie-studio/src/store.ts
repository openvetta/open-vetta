import { useSyncExternalStore } from "react";
import type { PluginContext } from "@vetta/plugin-sdk";

// Shared mutable state must live on globalThis: Module Federation can duplicate
// this module across slots, and a per-copy module variable would let a setter
// and a reader land on different instances. globalThis is the one shared anchor.

interface LottieStudioStore {
	ctx: PluginContext | null;
	/** The .lottie path the panel should focus (set by the save tool). */
	activePath: string | null;
	/** Bumped whenever the on-disk set of animations may have changed. */
	version: number;
	listeners: Set<() => void>;
}

const KEY = "__vettaLottieStudioStore__";

function store(): LottieStudioStore {
	const g = globalThis as unknown as Record<string, LottieStudioStore | undefined>;
	let s = g[KEY];
	if (!s) {
		s = { ctx: null, activePath: null, version: 0, listeners: new Set() };
		g[KEY] = s;
	}
	return s;
}

function emit(): void {
	for (const listener of store().listeners) listener();
}

export function setPluginContext(ctx: PluginContext): void {
	store().ctx = ctx;
}

export function pluginContext(): PluginContext | null {
	return store().ctx;
}

/** Focus an animation and signal that the workspace listing may have changed. */
export function focusAnimation(path: string | null): void {
	const s = store();
	s.activePath = path;
	s.version += 1;
	emit();
}

/** Signal that animations on disk changed without changing focus. */
export function bumpVersion(): void {
	store().version += 1;
	emit();
}

interface StoreSnapshot {
	activePath: string | null;
	version: number;
}

// Cache the snapshot object so useSyncExternalStore sees a stable reference
// between renders unless something actually changed (avoids render loops).
let snapshot: StoreSnapshot = { activePath: null, version: -1 };

function getSnapshot(): StoreSnapshot {
	const s = store();
	if (snapshot.activePath !== s.activePath || snapshot.version !== s.version) {
		snapshot = { activePath: s.activePath, version: s.version };
	}
	return snapshot;
}

function subscribe(listener: () => void): () => void {
	const s = store();
	s.listeners.add(listener);
	return () => {
		s.listeners.delete(listener);
	};
}

export function useLottieStore(): StoreSnapshot {
	return useSyncExternalStore(subscribe, getSnapshot);
}
