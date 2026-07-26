import type { AgentFeatureDefinition } from "@vetta/runtime-core/kernel";
import {
	type CodingToolRegistration,
	type CodingToolScope,
	DEFAULT_CODING_TOOL_SCOPE,
	selectCodingToolsForScope,
} from "./tool-registration.js";
import { type CurrentTimeToolOptions, createCurrentTimeToolRegistration } from "./tools/current-time/index.js";
import { createReadToolRegistration, type ReadToolOptions } from "./tools/read/index.js";

export const CODING_TOOLS_FEATURE_ID = "coding-tools";

export interface CodingToolsFeatureOptions {
	readonly scope?: CodingToolScope;
	readonly cwd?: string;
	readonly currentTime?: CurrentTimeToolOptions;
	readonly read?: ReadToolOptions;
}

export function createCodingToolsFeature(options: CodingToolsFeatureOptions = {}): AgentFeatureDefinition {
	return {
		id: CODING_TOOLS_FEATURE_ID,
		async prepare(context) {
			context.signal.throwIfAborted();
			const registrations: readonly CodingToolRegistration[] = [
				createCurrentTimeToolRegistration(options.currentTime),
				createReadToolRegistration(options.cwd ?? process.cwd(), options.read),
			];
			const tools = selectCodingToolsForScope(registrations, options.scope ?? DEFAULT_CODING_TOOL_SCOPE);
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
