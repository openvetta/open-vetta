import { createLsTool as createLegacyLsTool } from "../../../../coding-agent/src/core/tools/ls/index.js";
import type { LsBehaviorSubject, LsBehaviorSubjectOptions } from "./ls-behavior-contract.js";
import { defineLsBehaviorContract } from "./ls-behavior-contract.js";

function createLegacySubject(cwd: string, options?: LsBehaviorSubjectOptions): LsBehaviorSubject {
	const tool = createLegacyLsTool(cwd, options);
	return {
		definition: {
			name: tool.name,
			label: tool.label,
			description: tool.description,
			schema: tool.parameters,
			scopeUse: tool.scope_use ?? [],
			category: tool.category ?? "",
		},
		execute(input, signal) {
			return tool.execute("legacy-ls-contract", input, signal);
		},
	};
}

defineLsBehaviorContract("legacy", createLegacySubject);
