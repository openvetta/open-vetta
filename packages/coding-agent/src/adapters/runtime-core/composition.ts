import type { RuntimeHostOptions } from "@vetta/runtime-core";
import type { ModelRegistry } from "../../core/model-registry.js";
import { LegacyCodingAgentSessionBackend } from "./legacy-session-backend.js";
import {
	LegacyRuntimeSessionCatalog,
	LegacyRuntimeSessionFileHistoryReader,
	LegacyRuntimeSharedModelController,
} from "./legacy-session-services.js";

export interface LegacyRuntimeHostOptions
	extends Omit<
		RuntimeHostOptions,
		"sessionBackend" | "sessionCatalog" | "sessionFileHistoryReader" | "sharedModelController"
	> {
	modelRegistry?: ModelRegistry;
}

/** 保留旧 coding-agent 行为的显式 RuntimeHost 生产组合。 */
export function createLegacyRuntimeHostOptions(options: LegacyRuntimeHostOptions = {}): RuntimeHostOptions {
	const { modelRegistry, ...runtimeOptions } = options;
	return {
		...runtimeOptions,
		sessionBackend: new LegacyCodingAgentSessionBackend(modelRegistry),
		sessionCatalog: new LegacyRuntimeSessionCatalog(),
		sessionFileHistoryReader: new LegacyRuntimeSessionFileHistoryReader(),
		sharedModelController: modelRegistry ? new LegacyRuntimeSharedModelController(modelRegistry) : undefined,
	};
}
