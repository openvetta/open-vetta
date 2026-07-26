import type { AgentFeatureDefinition } from "@vetta/runtime-core/kernel";
import { guardCodingToolRegistration } from "./coding-tool-availability.js";
import type { CodingToolCatalog } from "./coding-tool-catalog.js";
import { type CodingToolActivation, selectCodingToolRegistrations } from "./tool-registration.js";

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
			const modelCallProvider = {
				id: CODING_TOOLS_FEATURE_ID,
				async contribute(callContext: { readonly signal: AbortSignal }) {
					callContext.signal.throwIfAborted();
					const catalogSnapshot = options.catalog.snapshot();
					const registrations = selectCodingToolRegistrations(
						catalogSnapshot.registrations,
						options.activation ?? { mode: "scope" },
					);
					return {
						tools: registrations.map((registration) =>
							guardCodingToolRegistration(options.catalog, registration),
						),
					};
				},
			};
			return {
				async contribute(contributionContext) {
					contributionContext.signal.throwIfAborted();
					return { modelCallProviders: [modelCallProvider] };
				},
				async dispose() {},
			};
		},
	};
}
