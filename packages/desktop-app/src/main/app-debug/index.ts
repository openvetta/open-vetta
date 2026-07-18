import { getDesktopConversationService } from "../conversations/desktop-conversation-service.js";
import { AppDebugCatalog } from "./catalog.js";
import { createConversationDebugDefinitions } from "./conversation/definitions.js";
import { createDebugInfoDefinition } from "./debug-info.js";
import { AppDebugRuntime } from "./runtime.js";

export function createAppDebugRuntime(): AppDebugRuntime {
	const catalog = new AppDebugCatalog();
	catalog.register(createDebugInfoDefinition());
	for (const definition of createConversationDebugDefinitions(getDesktopConversationService())) {
		catalog.register(definition);
	}
	return new AppDebugRuntime(catalog);
}

export { AppDebugRuntime } from "./runtime.js";
export type { DebugContext, DebugDefinition, DebugMetadata, DebugSearchResult, JsonValue } from "./types.js";
export { DebugError } from "./types.js";
