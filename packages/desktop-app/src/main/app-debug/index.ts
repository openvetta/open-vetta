import { AppDebugCatalog } from "./catalog.js";
import { createDebugInfoDefinition } from "./debug-info.js";
import { AppDebugRuntime } from "./runtime.js";

export function createAppDebugRuntime(): AppDebugRuntime {
	const catalog = new AppDebugCatalog();
	catalog.register(createDebugInfoDefinition());
	return new AppDebugRuntime(catalog);
}

export { AppDebugRuntime } from "./runtime.js";
export type { DebugContext, DebugDefinition, DebugMetadata, DebugSearchResult, JsonValue } from "./types.js";
export { DebugError } from "./types.js";
