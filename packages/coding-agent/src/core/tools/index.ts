export {
	type BashOperations,
	type BashSpawnContext,
	type BashSpawnHook,
	type BashToolDetails,
	type BashToolInput,
	type BashToolOptions,
	bashTool,
	createBashTool,
} from "./bash/index.js";
export {
	type CurrentTimeToolDetails,
	type CurrentTimeToolInput,
	createCurrentTimeTool,
	currentTimeTool,
} from "./current-time/index.js";
export {
	createDocToPdfTool,
	type DocToPdfOperations,
	type DocToPdfToolInput,
	type DocToPdfToolOptions,
	docToPdfTool,
} from "./doc-to-pdf/index.js";
export {
	createEditTool,
	type EditOperations,
	type EditToolDetails,
	type EditToolInput,
	type EditToolOptions,
	editTool,
} from "./edit/index.js";
export {
	createFindTool,
	type FindOperations,
	type FindToolDetails,
	type FindToolInput,
	type FindToolOptions,
	findTool,
} from "./find/index.js";
export {
	createGrepTool,
	type GrepOperations,
	type GrepToolDetails,
	type GrepToolInput,
	type GrepToolOptions,
	grepTool,
} from "./grep/index.js";
export {
	createHtmlToPdfTool,
	type HtmlToPdfToolInput,
	htmlToPdfTool,
} from "./html-to-pdf/index.js";
export {
	createInvokeSceneTool,
	type InvokeSceneToolDetails,
	type InvokeSceneToolInput,
	type InvokeSceneToolOptions,
} from "./invoke-scene/index.js";
export {
	createInvokeSkillTool,
	type InvokeSkillToolDetails,
	type InvokeSkillToolInput,
	type InvokeSkillToolOptions,
} from "./invoke-skill/index.js";
export {
	createLsTool,
	type LsOperations,
	type LsToolDetails,
	type LsToolInput,
	type LsToolOptions,
	lsTool,
} from "./ls/index.js";
export {
	createReadTool,
	type ReadOperations,
	type ReadToolDetails,
	type ReadToolInput,
	type ReadToolOptions,
	readTool,
} from "./read/index.js";
export {
	createShellTool,
	type ShellOperations,
	type ShellSpawnContext,
	type ShellSpawnHook,
	type ShellToolDetails,
	type ShellToolInput,
	type ShellToolOptions,
	shellTool,
} from "./shell/index.js";
export { createTodoTool, type TodoToolDetails, type TodoToolOptions } from "./todo/index.js";
export {
	createTreeTool,
	type TreeOperations,
	type TreeToolDetails,
	type TreeToolInput,
	type TreeToolOptions,
	treeTool,
} from "./tree/index.js";
export {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	type TruncationOptions,
	type TruncationResult,
	truncateHead,
	truncateLine,
	truncateTail,
} from "./truncate.js";
export {
	createWriteTool,
	type WriteOperations,
	type WriteToolInput,
	type WriteToolOptions,
	writeTool,
} from "./write/index.js";

import type { AgentTool } from "@mariozechner/pi-agent-core";
import { type BashToolOptions, bashTool, createBashTool } from "./bash/index.js";
import { createCurrentTimeTool, currentTimeTool } from "./current-time/index.js";
import { createDocToPdfTool, type DocToPdfToolOptions, docToPdfTool } from "./doc-to-pdf/index.js";
import { createEditTool, editTool } from "./edit/index.js";
import { createFindTool, findTool } from "./find/index.js";
import { createGrepTool, grepTool } from "./grep/index.js";
import { createHtmlToPdfTool, htmlToPdfTool } from "./html-to-pdf/index.js";
import { createLsTool, lsTool } from "./ls/index.js";
import { createReadTool, type ReadToolOptions, readTool } from "./read/index.js";
import { createShellTool, type ShellToolOptions, shellTool } from "./shell/index.js";
import { createTreeTool, treeTool } from "./tree/index.js";
import { createWriteTool, writeTool } from "./write/index.js";

/** Tool type (AgentTool from pi-ai) */
export type Tool = AgentTool<any>;

export type CommandToolName = "bash" | "shell";

export function getDefaultCommandToolName(): CommandToolName {
	return process.platform === "win32" ? "shell" : "bash";
}

export function getDefaultCodingToolNames(): ["read", CommandToolName, "edit", "write", "dir_tree"] {
	return ["read", getDefaultCommandToolName(), "edit", "write", "dir_tree"];
}

// Default tools for full access mode (using process.cwd())
const defaultCommandToolName = getDefaultCommandToolName();
const defaultCommandTool = defaultCommandToolName === "shell" ? shellTool : bashTool;
export const codingTools: Tool[] = [
	readTool,
	defaultCommandTool,
	editTool,
	writeTool,
	treeTool,
	docToPdfTool,
	htmlToPdfTool,
];

// Read-only tools for exploration without modification (using process.cwd())
export const readOnlyTools: Tool[] = [readTool, grepTool, findTool, lsTool, treeTool];

// All available tools (using process.cwd())
export const allTools = {
	read: readTool,
	bash: bashTool,
	shell: shellTool,
	edit: editTool,
	write: writeTool,
	grep: grepTool,
	find: findTool,
	ls: lsTool,
	dir_tree: treeTool,
	doc_to_pdf: docToPdfTool,
	html_to_pdf: htmlToPdfTool,
	current_time: currentTimeTool,
};

export type ToolName = keyof typeof allTools;

export interface ToolsOptions {
	/** Options for the read tool */
	read?: ReadToolOptions;
	/** Options for the bash tool */
	bash?: BashToolOptions;
	/** Options for the shell tool */
	shell?: ShellToolOptions;
	/** Options for the doc-to-pdf tool */
	docToPdf?: DocToPdfToolOptions;
}

/**
 * Create coding tools configured for a specific working directory.
 */
export function createCodingTools(cwd: string, options?: ToolsOptions): Tool[] {
	const commandTool =
		getDefaultCommandToolName() === "shell"
			? createShellTool(cwd, options?.shell ?? options?.bash)
			: createBashTool(cwd, options?.bash ?? options?.shell);

	return [
		createReadTool(cwd, options?.read),
		commandTool,
		createEditTool(cwd),
		createWriteTool(cwd),
		createTreeTool(cwd),
		createDocToPdfTool(cwd, options?.docToPdf),
		createHtmlToPdfTool(cwd),
	];
}

/**
 * Create read-only tools configured for a specific working directory.
 */
export function createReadOnlyTools(cwd: string, options?: ToolsOptions): Tool[] {
	return [
		createReadTool(cwd, options?.read),
		createGrepTool(cwd),
		createFindTool(cwd),
		createLsTool(cwd),
		createTreeTool(cwd),
	];
}

/**
 * Create all tools configured for a specific working directory.
 */
export function createAllTools(cwd: string, options?: ToolsOptions): Record<ToolName, Tool> {
	return {
		read: createReadTool(cwd, options?.read),
		bash: createBashTool(cwd, options?.bash),
		shell: createShellTool(cwd, options?.shell ?? options?.bash),
		edit: createEditTool(cwd),
		write: createWriteTool(cwd),
		grep: createGrepTool(cwd),
		find: createFindTool(cwd),
		ls: createLsTool(cwd),
		dir_tree: createTreeTool(cwd),
		doc_to_pdf: createDocToPdfTool(cwd, options?.docToPdf),
		html_to_pdf: createHtmlToPdfTool(cwd),
		current_time: createCurrentTimeTool(),
	};
}
