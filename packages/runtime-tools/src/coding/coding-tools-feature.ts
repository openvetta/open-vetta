import type { AgentFeatureDefinition } from "@vetta/runtime-core/kernel";
import { type CurrentTimeToolOptions, createCurrentTimeTool } from "./tools/current-time/index.js";

export const CODING_TOOLS_FEATURE_ID = "coding-tools";

export interface CodingToolsFeatureOptions {
	readonly currentTime?: CurrentTimeToolOptions;
}

export function createCodingToolsFeature(options: CodingToolsFeatureOptions = {}): AgentFeatureDefinition {
	return {
		id: CODING_TOOLS_FEATURE_ID,
		async prepare(context) {
			context.signal.throwIfAborted();
			const tools = [createCurrentTimeTool(options.currentTime)];
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
