import { ensureTool, type ToolExecutableName } from "../../utils/tools-manager.js";

export type { ToolExecutableName } from "../../utils/tools-manager.js";

export type EnsureTool = (tool: ToolExecutableName, silent?: boolean) => Promise<string | undefined>;

export interface ToolExecutableResolver {
	readonly resolve: (tool: ToolExecutableName) => Promise<string | undefined>;
}

/**
 * Adapt the legacy downloader to the Runtime executable resolver Port.
 * The Runtime receives only the resolved path; download policy stays here.
 */
export function createToolExecutableResolver(ensure: EnsureTool = ensureTool): ToolExecutableResolver {
	return {
		resolve: (tool) => ensure(tool, true),
	};
}

export {
	type EnsureToolDependencies,
	ensureToolWithDependencies,
} from "../../utils/tools-manager.js";
