/**
 * System prompt construction and project context loading.
 */

import { formatSkillsForPrompt, type Skill } from "./skills.js";
import { SUBCONSCIOUS } from "./subconscious.js";

/** Tool descriptions for system prompt */
const toolDescriptions: Record<string, string> = {
	read: "Read file contents",
	bash: "Execute bash commands (ls, grep, find, etc.)",
	shell: "Execute shell commands (PowerShell on Windows by default)",
	edit: "Make surgical edits to files (find exact text and replace)",
	write: "Create or overwrite files",
	grep: "Search file contents for patterns (respects .gitignore)",
	glob: "Find files by glob pattern (respects .gitignore)",
	find: "Find files by glob pattern (respects .gitignore)",
	ls: "List directory contents",
	dir_tree: "Render directory tree with [D]/[F] node types and child counts",
	invoke_skill: "Invoke a skill by name to handle specialized tasks (e.g., PDF, DOCX processing)",
	todo: "Plan and track progress on multi-step tasks with a todo list",
	task_output: "Read incremental output of a background task started via bash/shell with run_in_background",
	task_stop: "Terminate a running background task started via bash/shell with run_in_background",
	current_time: "Get the current date and time (preferred over bash date/time commands)",
	ask_user_question:
		"Ask the user multiple-choice questions and wait for their answers (clarify ambiguity, gather preferences, offer decisions)",
	doc_to_pdf: "Convert .doc/.docx files to PDF using Microsoft Office or WPS Office",
	html_to_pdf: "Convert HTML files to PDF using Vetta Desktop's PDF command-line mode",
	extract_text_from_pdf:
		"Extract text from a PDF (scanned or born-digital) via Vetta Desktop's local PP-OCRv5 OCR; uses the embedded text layer when present, otherwise OCRs each page",
	extract_text_from_img:
		"Extract text from a single image (PNG/JPG/WebP/BMP/GIF) via Vetta Desktop's local PP-OCRv5 OCR",
	render_pdf_page:
		"Render a single PDF page to a PNG (via pdftoppm) for VISUAL inspection — seals/stamps (盖章), signatures, handwriting, layout, logos, figures. Follow up with `read` on the returned PNG path. Use this instead of `extract_text_from_pdf` when the task needs a visual judgment OCR cannot make.",
};

export const VETTA_CLI_GUIDANCE = [
	"Vetta CLI is your interface to the running Vetta Desktop app: use `vetta action` both to learn what Desktop can do and to operate it.",
	"It can search available Desktop actions, describe their capabilities and inputs, and run them through the local Desktop action.",
	"Batch tasks and scheduled tasks are Desktop capabilities that can be queried and managed through these actions; use action search and description to discover the correct operations.",
	"Before using Vetta CLI, analyze whether the user wants to inspect/manage current app state or wants a general feature explanation.",
	"Only explain what a feature can do when the user explicitly asks for a feature introduction, explanation, or capability overview; otherwise prefer querying or operating the running app.",
	"If the user's intent is unclear, ask a concise clarifying question instead of assuming or turning the request into a general explanation.",
	"When the user asks about Vetta Desktop app features, settings, pages, navigation, appearance/theme changes, or how to operate the app, you MUST inspect Vetta CLI help first with `vetta action -h` and then search/describe relevant actions as needed.",
	"Do not answer by guessing from memory.",
	"Do not inspect files under `.vetta` to resolve user confusion about app configuration or feature locations; local config files are not the app UX contract and do not help users find or change settings in the running app.",
	"Do not memorize or guess detailed action parameters; use action help/description output for details.",
	"After determining the correct action and input, call `vetta action run` directly.",
	"Never show or quote Vetta CLI commands, command arguments, or raw terminal output to the user.",
	"The user may not understand command-line tools, so explain Vetta features, actions, and results in plain language that a non-technical person can understand.",
	"Avoid technical terms when describing Vetta or its responses; summarize what happened and what the user needs to know.",
	"Actions that require authorization will automatically ask the user through Vetta Desktop while the command is running.",
	"Do not ask for authorization before running the command, and do not automatically retry an action after the user rejects it.",
].join(" ");

/**
 * 产物输出位置规则：用户未显式指定输出位置时，新文件/产物默认落在当前工作目录，
 * 严禁默认写到桌面、家目录或工作目录之外的任意路径。
 */
export const OUTPUT_LOCATION_GUIDANCE =
	"\n\n**Output location**: Unless the user explicitly specifies where to save output, create any new files, generated artifacts, exports, or downloads INSIDE the current working directory shown above (use a sensible subdirectory of it when grouping helps). " +
	"NEVER default to the Desktop, the home directory, /tmp, or any path outside the current working directory. " +
	"If the user gives only a bare filename with no directory, resolve it relative to the current working directory, not the Desktop.";

export interface McpToolInfo {
	name: string;
	description: string;
}

export type SystemPromptBlockType =
	| "subconscious"
	| "base"
	| "tools"
	| "mcp"
	| "guidelines"
	| "append"
	| "context"
	| "memory"
	| "skills"
	| "personalization"
	| "footer"
	| "plugin";

export interface SystemPromptBlock {
	id: string;
	type: SystemPromptBlockType;
	source: {
		kind: "core" | "plugin";
		pluginId?: string;
	};
	content: string;
	priority: number;
	enabled: boolean;
}

export interface SystemPromptDraft {
	blocks: SystemPromptBlock[];
	metadata: {
		cwd: string;
		dateTime: string;
	};
}

export type SystemPromptBlockPatch = Partial<Omit<SystemPromptBlock, "id">>;

export type SystemPromptOperation =
	| { type: "addBlock"; block: SystemPromptBlock }
	| { type: "replaceBlock"; blockId: string; block: SystemPromptBlock }
	| { type: "updateBlock"; blockId: string; patch: SystemPromptBlockPatch }
	| { type: "removeBlock"; blockId: string }
	| { type: "setBlockEnabled"; blockId: string; enabled: boolean };

export interface SystemPromptContribution {
	pluginId: string;
	operations: SystemPromptOperation[];
}

export interface SkillPathContribution {
	pluginId: string;
	paths: string[];
}

export interface ToolPolicyContribution {
	pluginId: string;
	allow?: string[];
	deny?: string[];
}

export type JsonSchema = Record<string, unknown>;

export interface AgentPluginToolContribution {
	pluginId: string;
	id: string;
	name: string;
	label?: string;
	description: string;
	parameters: JsonSchema;
	handlerId: string;
	timeoutMs?: number;
}

export interface AgentPluginStateContribution {
	pluginId: string;
	id: string;
	schema?: JsonSchema;
	initialValue?: unknown;
	persist?: boolean;
}

export interface AgentPluginFollowUpContribution {
	pluginId: string;
	id: string;
	handlerId: string;
}

export interface AgentPluginRuntimeConfig {
	systemPromptContributions?: SystemPromptContribution[];
	skillPathContributions?: SkillPathContribution[];
	toolPolicyContributions?: ToolPolicyContribution[];
	toolContributions?: AgentPluginToolContribution[];
	stateContributions?: AgentPluginStateContribution[];
	followUpContributions?: AgentPluginFollowUpContribution[];
}

export interface AgentPluginToolInvocation {
	sessionId: string;
	cwd: string;
	pluginId: string;
	toolId: string;
	toolName: string;
	handlerId: string;
	input: unknown;
}

export type AgentPluginToolInvoker = (invocation: AgentPluginToolInvocation, signal?: AbortSignal) => Promise<unknown>;

export interface BuildSystemPromptOptions {
	/** Custom system prompt (replaces default body in the legacy flow). */
	customPrompt?: string;
	/** Tools to include in prompt. Default: [read, command-tool, edit, write, dir_tree] */
	selectedTools?: string[];
	/** Text to append to system prompt. */
	appendSystemPrompt?: string;
	/** Working directory. Default: process.cwd() */
	cwd?: string;
	/** Pre-loaded context files. */
	contextFiles?: Array<{ path: string; content: string }>;
	/** Pre-loaded skills. */
	skills?: Skill[];
	/** MCP tools available (from Model Context Protocol servers). */
	mcpTools?: McpToolInfo[];
	/** Pre-rendered persistent-memory block (memory-mode only, frozen snapshot). */
	memory?: string;
	/**
	 * 个性化追加块（人设 + 自定义指令，调用方已按「人设在前、自定义在后」拼好）。
	 * 拼在系统提示词末尾（date/cwd 页脚之前），recency 最高。
	 */
	personalization?: string;
	/** Runtime plugin contributions applied to the structured prompt draft before rendering. */
	agentPlugins?: AgentPluginRuntimeConfig;
}

function coreBlock(id: string, type: SystemPromptBlockType, content: string, priority: number): SystemPromptBlock {
	return {
		id,
		type,
		source: { kind: "core" },
		content,
		priority,
		enabled: content.length > 0,
	};
}

function renderMcpToolsSection(mcpTools: McpToolInfo[], markdownTools: boolean): string {
	if (mcpTools.length === 0) {
		return "";
	}
	const toolsList = mcpTools
		.map((tool) =>
			markdownTools ? `- **${tool.name}**: ${tool.description}` : `- ${tool.name}: ${tool.description}`,
		)
		.join("\n");

	if (markdownTools) {
		return `# MCP (Model Context Protocol) Tools

The following MCP tools are available from external servers:

${toolsList}

**IMPORTANT - MCP Tool Usage:**
- When the user explicitly mentions "use [server-name] MCP" or "using [tool-name]", you MUST use the corresponding MCP tool
- MCP tools are prefixed with "mcp_[servername]_" (e.g., mcp_filesystem_list_directory)
- MCP tools may provide specialized functionality not available in built-in tools
- Example: If user says "use filesystem MCP to list files", use mcp_filesystem_list_directory instead of bash ls`;
	}

	return `MCP (Model Context Protocol) tools:
${toolsList}

**IMPORTANT - MCP Tool Usage:**
- When the user explicitly mentions "use [server-name] MCP" or "using [tool-name]", you MUST use the corresponding MCP tool
- MCP tools are prefixed with "mcp_[servername]_" (e.g., mcp_filesystem_list_directory)
- MCP tools may provide specialized functionality not available in built-in tools
- Example: If user says "use filesystem MCP to list files", use mcp_filesystem_list_directory instead of bash ls`;
}

function renderContextFilesSection(contextFiles: Array<{ path: string; content: string }>): string {
	if (contextFiles.length === 0) {
		return "";
	}
	let content = "# Project Context\n\nProject-specific instructions and guidelines:\n\n";
	for (const { path: filePath, content: fileContent } of contextFiles) {
		content += `## ${filePath}\n\n${fileContent}\n\n`;
	}
	return content.trimEnd();
}

function renderFooter(dateTime: string, cwd: string): string {
	return `Current date and time: ${dateTime}
Current working directory: ${cwd}${OUTPUT_LOCATION_GUIDANCE}`;
}

function applySystemPromptOperation(
	draft: SystemPromptDraft,
	pluginId: string,
	operation: SystemPromptOperation,
): void {
	switch (operation.type) {
		case "addBlock":
			draft.blocks.push({
				...operation.block,
				source: { kind: "plugin", pluginId },
			});
			return;
		case "replaceBlock": {
			const index = draft.blocks.findIndex((block) => block.id === operation.blockId);
			const nextBlock: SystemPromptBlock = {
				...operation.block,
				id: operation.blockId,
				source: { kind: "plugin", pluginId },
			};
			if (index >= 0) {
				draft.blocks[index] = nextBlock;
			} else {
				draft.blocks.push(nextBlock);
			}
			return;
		}
		case "updateBlock": {
			const block = draft.blocks.find((candidate) => candidate.id === operation.blockId);
			if (block) {
				Object.assign(block, operation.patch);
			}
			return;
		}
		case "removeBlock":
			draft.blocks = draft.blocks.filter((block) => block.id !== operation.blockId);
			return;
		case "setBlockEnabled": {
			const block = draft.blocks.find((candidate) => candidate.id === operation.blockId);
			if (block) {
				block.enabled = operation.enabled;
			}
			return;
		}
	}
}

function applySystemPromptContributions(draft: SystemPromptDraft, config: AgentPluginRuntimeConfig | undefined): void {
	for (const contribution of config?.systemPromptContributions ?? []) {
		for (const operation of contribution.operations) {
			applySystemPromptOperation(draft, contribution.pluginId, operation);
		}
	}
}

export function renderSystemPromptDraft(draft: SystemPromptDraft): string {
	return draft.blocks
		.filter((block) => block.enabled && block.content.length > 0)
		.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
		.map((block) => block.content)
		.join("\n\n");
}

function buildDateTime(): string {
	const now = new Date();
	return now.toLocaleString("en-US", {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		timeZoneName: "short",
	});
}

function buildGuidelines(tools: string[]): string {
	const guidelinesList: string[] = [];
	const hasSelectedCommandTool = tools.includes("bash") || tools.includes("shell");
	const hasEdit = tools.includes("edit");
	const hasWrite = tools.includes("write");
	const hasGrep = tools.includes("grep");
	const hasGlob = tools.includes("glob");
	const hasFind = tools.includes("find");
	const hasLs = tools.includes("ls");
	const hasDirTree = tools.includes("dir_tree");
	const hasRead = tools.includes("read");

	if (hasSelectedCommandTool && !hasGrep && !hasGlob && !hasFind && !hasLs && !hasDirTree) {
		guidelinesList.push("Use the shell tool for file operations like ls, rg, find");
	} else if (hasSelectedCommandTool && (hasGrep || hasGlob || hasFind || hasLs || hasDirTree)) {
		guidelinesList.push(
			"Prefer grep/glob/find/ls/dir_tree tools over the shell tool for file exploration (faster, respects .gitignore)",
		);
	}

	if (hasDirTree) {
		guidelinesList.push(
			'ALWAYS use dir_tree (not bash "tree", "ls -R", "find", "fd", or "rg --files") whenever you need to view directory structure or explore a codebase. Only fall back to bash if dir_tree cannot fulfill the specific requirement (e.g., custom output formatting)',
		);
	}

	if (tools.includes("current_time")) {
		guidelinesList.push(
			'ALWAYS use current_time tool (not bash "date", "timedatectl", or other shell commands) when you need to know the current date or time. Only fall back to bash if current_time cannot fulfill the specific requirement (e.g., timezone conversion, date arithmetic)',
		);
	}

	if (hasRead && hasEdit) {
		guidelinesList.push("Use read to examine files before editing. You must use this tool instead of cat or sed.");
	}
	if (hasEdit) {
		guidelinesList.push("Use edit for precise changes (old text must match exactly)");
	}
	if (hasWrite) {
		guidelinesList.push("Use write only for new files or complete rewrites");
	}
	if (hasEdit || hasWrite) {
		guidelinesList.push(
			"When summarizing your actions, output plain text directly - do NOT use cat or shell commands to display what you did",
		);
	}

	guidelinesList.push(
		"CRITICAL: File names and paths are opaque byte strings — reproduce them EXACTLY as returned by tools (ls, find, dir_tree) or provided by the user. " +
			"NEVER add, remove, or change any characters including spaces, dashes, underscores, or punctuation. " +
			"When in doubt, run ls or find first to get the exact name, then copy it verbatim.",
	);
	guidelinesList.push("Be concise in your responses");
	guidelinesList.push(
		"MANDATORY file-link format: EVERY time you mention a file you created, edited, read, or otherwise point the user at — anywhere in your prose, including headings, list items, tables, and 'saved to' / 'output' lines — you MUST write it as a markdown link whose target is the file's ABSOLUTE path: [filename.ext](/abs/path/filename.ext). The UI turns these into clickable preview badges, so this is not optional styling. " +
			"NEVER emit a bare file path as plain text, and NEVER wrap a file path in inline code/backticks (`/Users/...`) when you are pointing the user at it — backtick paths render as dead monospace text with no preview. Do NOT prepend file emojis like 📄 or 📁; the badge already shows a file-type icon. " +
			"Correct: Saved to [report.md](/Users/me/Desktop/report.md). Wrong: Saved to `/Users/me/Desktop/report.md` — or — Saved to 📄 /Users/me/Desktop/report.md. " +
			"Use the exact absolute path returned by tools (do not invent or guess paths); if you genuinely only have a relative path, leave it as plain text rather than fabricating an absolute one. " +
			"The ONLY exception is file paths that appear inside fenced code blocks or shell command examples — keep those as-is.",
	);
	guidelinesList.push(
		"When you reference a web URL in your prose, render it as a markdown link with descriptive text, e.g. [Vite docs](https://vitejs.dev), instead of pasting the bare URL. " +
			"Inside code blocks or shell command examples, keep URLs as-is.",
	);
	guidelinesList.push(
		"When the user sends images inline in their message, analyze them directly using your vision capabilities. Do NOT try to locate or read them from disk - the image data is already embedded in the message",
	);

	return guidelinesList.map((guideline) => `- ${guideline}`).join("\n");
}

/** Build the structured prompt draft with tools, guidelines, and context. */
export function buildSystemPromptDraft(options: BuildSystemPromptOptions = {}): SystemPromptDraft {
	const {
		customPrompt,
		selectedTools,
		appendSystemPrompt,
		cwd,
		contextFiles: providedContextFiles,
		skills: providedSkills,
		mcpTools: providedMcpTools,
		memory,
		personalization,
		agentPlugins,
	} = options;
	const resolvedCwd = cwd ?? process.cwd();
	const dateTime = buildDateTime();
	const defaultCommandTool = process.platform === "win32" ? "shell" : "bash";
	const contextFiles = providedContextFiles ?? [];
	const skills = providedSkills ?? [];
	const mcpTools = providedMcpTools ?? [];
	const blocks: SystemPromptBlock[] = [];

	if (customPrompt) {
		blocks.push(coreBlock("core.subconscious", "subconscious", SUBCONSCIOUS, 100));
		blocks.push(coreBlock("core.base", "base", customPrompt, 200));
		blocks.push(coreBlock("core.append", "append", appendSystemPrompt ?? "", 300));
		blocks.push(coreBlock("core.mcp", "mcp", renderMcpToolsSection(mcpTools, true), 400));
		blocks.push(coreBlock("core.context", "context", renderContextFilesSection(contextFiles), 500));
		blocks.push(coreBlock("core.memory", "memory", memory ?? "", 600));
		const canUseSkills = !selectedTools || selectedTools.includes("invoke_skill") || selectedTools.includes("read");
		if (canUseSkills && skills.length > 0) {
			blocks.push(coreBlock("core.skills", "skills", formatSkillsForPrompt(skills), 700));
		}
		blocks.push(
			coreBlock(
				"core.filename-fidelity",
				"guidelines",
				"**CRITICAL — File name fidelity**: " +
					"File names and paths are opaque byte strings — reproduce them EXACTLY as returned by tools or provided by the user. " +
					"NEVER add, remove, or change any characters including spaces, dashes, underscores, or punctuation. " +
					"When in doubt, run ls or find first to get the exact name, then copy it verbatim.",
				800,
			),
		);
		blocks.push(coreBlock("core.personalization", "personalization", personalization ?? "", 900));
		blocks.push(coreBlock("core.footer", "footer", renderFooter(dateTime, resolvedCwd), 1000));
		const draft: SystemPromptDraft = { blocks, metadata: { cwd: resolvedCwd, dateTime } };
		applySystemPromptContributions(draft, agentPlugins);
		return draft;
	}

	const tools = (selectedTools || ["read", defaultCommandTool, "edit", "write", "dir_tree"]).filter(
		(tool) => tool in toolDescriptions,
	);
	const toolsList =
		tools.length > 0 ? tools.map((tool) => `- ${tool}: ${toolDescriptions[tool]}`).join("\n") : "(none)";
	const mcpToolsSection = renderMcpToolsSection(mcpTools, false);
	const hasInvokeSkill = tools.includes("invoke_skill");
	const hasRead = tools.includes("read");

	blocks.push(coreBlock("core.subconscious", "subconscious", SUBCONSCIOUS, 100));
	blocks.push(
		coreBlock(
			"core.tools",
			"tools",
			`Available tools:\n${toolsList}${mcpToolsSection ? `\n\n${mcpToolsSection}` : ""}`,
			200,
		),
	);
	blocks.push(coreBlock("core.guidelines", "guidelines", `Guidelines:\n${buildGuidelines(tools)}\n`, 300));
	blocks.push(coreBlock("core.append", "append", appendSystemPrompt ?? "", 400));
	blocks.push(coreBlock("core.context", "context", renderContextFilesSection(contextFiles), 500));
	blocks.push(coreBlock("core.memory", "memory", memory ?? "", 600));
	if ((hasRead || hasInvokeSkill) && skills.length > 0) {
		blocks.push(coreBlock("core.skills", "skills", formatSkillsForPrompt(skills), 700));
	}
	blocks.push(coreBlock("core.personalization", "personalization", personalization ?? "", 900));
	blocks.push(coreBlock("core.footer", "footer", renderFooter(dateTime, resolvedCwd), 1000));

	const draft: SystemPromptDraft = { blocks, metadata: { cwd: resolvedCwd, dateTime } };
	applySystemPromptContributions(draft, agentPlugins);
	return draft;
}

/** Build the system prompt with tools, guidelines, and context. */
export function buildSystemPrompt(options: BuildSystemPromptOptions = {}): string {
	return renderSystemPromptDraft(buildSystemPromptDraft(options));
}
