import type { AgentFeatureDefinition } from "@vetta/runtime-core/kernel";
import type { CodingToolCatalog } from "./coding-tool-catalog.js";
import { type CodingToolActivation, selectCodingTools } from "./tool-registration.js";

export const CODING_TOOLS_FEATURE_ID = "coding-tools";

export interface CodingToolsFeatureOptions {
	readonly catalog: CodingToolCatalog;
	readonly activation?: CodingToolActivation;
}

export function createCodingToolsFeature(options: CodingToolsFeatureOptions): AgentFeatureDefinition {
	return {
		id: CODING_TOOLS_FEATURE_ID,
		async prepare(context) {
			context.signal.throwIfAborted();
			const catalogSnapshot = options.catalog.snapshot();
			const tools = selectCodingTools(catalogSnapshot.registrations, options.activation ?? { mode: "scope" });
			return {
				async contribute(contributionContext) {
					contributionContext.signal.throwIfAborted();
					return { tools };
				},
				async dispose() {},
			};
		},
	};
}
