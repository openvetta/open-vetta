import CanvasKitInit, { type CanvasKit } from "canvaskit-wasm/full";
import wasmUrl from "canvaskit-wasm/bin/full/canvaskit.wasm?url";

// Single CanvasKit (full build: Skottie + slots) instance, shared across every
// player. Anchored on globalThis so Module Federation duplicate copies of this
// module still resolve to one WASM instance (loading it twice wastes ~7MB and
// a second WebGL context).

const KEY = "__vettaLottieStudioCanvasKit__";

/**
 * Vite emits the wasm as a document-absolute path ("/assets/canvaskit-*.wasm")
 * relative to the build root (dist/). canvaskit.js would fetch that against the
 * RENDERER document origin, missing both the plugin host AND the `dist/` base —
 * a 404. This module is bundled into dist/assets/index-*.js and the wasm is its
 * sibling in the same dir, so resolving the wasm's basename against
 * import.meta.url yields the correct `vetta-plugin://<id>/dist/assets/…` URL
 * regardless of the host, the dist prefix, or the content hash.
 */
function resolveWasmUrl(): string {
	const file = wasmUrl.split("/").pop() ?? wasmUrl;
	try {
		return new URL(file, import.meta.url).href;
	} catch {
		return wasmUrl;
	}
}

export function loadCanvasKit(): Promise<CanvasKit> {
	const g = globalThis as unknown as Record<string, Promise<CanvasKit> | undefined>;
	let promise = g[KEY];
	if (!promise) {
		const resolved = resolveWasmUrl();
		promise = CanvasKitInit({ locateFile: () => resolved });
		g[KEY] = promise;
	}
	return promise;
}

export type { CanvasKit };
