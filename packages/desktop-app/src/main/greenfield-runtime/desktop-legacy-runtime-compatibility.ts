import type { ModelRegistry } from "@vetta/coding-agent/host-services";
import {
	LegacyCodingAgentSessionBackend,
	LegacyRuntimeSessionCatalog,
	LegacyRuntimeSessionFileHistoryReader,
} from "@vetta/coding-agent/runtime-host";
import type {
	RuntimeHostSessionBackend,
	RuntimeSessionCatalog,
	RuntimeSessionFileHistoryReader,
} from "../../../../runtime-core/src/index.js";

export interface DesktopLegacyRuntimeCompatibilityOptions {
	readonly modelRegistry: ModelRegistry;
}

export interface DesktopLegacyRuntimeCompatibility {
	readonly sessionBackend: RuntimeHostSessionBackend;
	readonly sessionCatalog: RuntimeSessionCatalog;
	readonly sessionFileHistoryReader: RuntimeSessionFileHistoryReader;
}

/**
 * Legacy 只在这个兼容边界内组装。Desktop 主 Composition Root 只消费明确列出的
 * Backend/Catalog/History Port，不再通过完整 RuntimeHost options 取得旧实现。
 */
export function createDesktopLegacyRuntimeCompatibility(
	options: DesktopLegacyRuntimeCompatibilityOptions,
): DesktopLegacyRuntimeCompatibility {
	return {
		sessionBackend: new LegacyCodingAgentSessionBackend(options.modelRegistry),
		sessionCatalog: new LegacyRuntimeSessionCatalog(),
		sessionFileHistoryReader: new LegacyRuntimeSessionFileHistoryReader(),
	};
}
