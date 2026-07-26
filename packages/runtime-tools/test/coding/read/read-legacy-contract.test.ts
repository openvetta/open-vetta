import { createReadTool as createLegacyReadTool } from "../../../../coding-agent/src/core/tools/read/index.js";
import type { ReadBehaviorSubject, ReadBehaviorSubjectOptions } from "./read-behavior-contract.js";
import { defineReadBehaviorContract } from "./read-behavior-contract.js";

function createLegacySubject(cwd: string, options?: ReadBehaviorSubjectOptions): ReadBehaviorSubject {
	const tool = createLegacyReadTool(cwd, options);
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
			return tool.execute("legacy-read-contract", input, signal);
		},
	};
}

defineReadBehaviorContract("legacy", createLegacySubject);
