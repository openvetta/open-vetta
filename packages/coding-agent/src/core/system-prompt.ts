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
	progress:
		"Announce the current stage in plain language so the user sees readable steps instead of raw tool calls (Work mode only)",
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
	kb_write_page:
		"Create or update a knowledge base wiki page (closed frontmatter schema, stable id, upsert by id/source_hash, auto-refreshes tag/manifest caches)",
	kb_filter_by_tags:
		"Filter knowledge base wiki pages by tags using set algebra (all=AND, any=OR, none=NOT); a retrieval shortcut",
	kb_list_available_tags: "List all tags in the knowledge base with page counts; call before kb_filter_by_tags",
};

export const VETTA_CLI_GUIDANCE = [
	"Vetta CLI is your interface to the running Vetta Desktop app: use `vetta action` both to learn what Desktop can do and to operate it.",
	'Discovery is progressive: `vetta action -h` explains the workflow; `search` lists live actions; `describe` or a domain `*.query` with `{"operation":"help"}` reveals inputs; then `run`.',
	"Do not expect CLI help to list every parameter. Help only names capability areas (for example navigation, settings, models, skills, projects, batch-tasks, scheduler, knowledge, plugins, im). The authoritative inventory is always `vetta action search`.",
	"Before using Vetta CLI, analyze whether the user wants to inspect/manage current app state or wants a general feature explanation.",
	"Only explain what a feature can do when the user explicitly asks for a feature introduction, explanation, or capability overview; otherwise prefer querying or operating the running app.",
	"If the user's intent is unclear, ask a concise clarifying question instead of assuming or turning the request into a general explanation.",
	"When the user asks about Vetta Desktop app features, settings, pages, models, skills, projects, automation, knowledge, plugins, IM, or how to operate the app, you MUST start with `vetta action -h` and/or `vetta action search`, then describe/run as needed.",
	"Do not answer by guessing from memory.",
	"Do not inspect files under `.vetta` to resolve user confusion about app configuration or feature locations; local config files are not the app UX contract and do not help users find or change settings in the running app.",
	"Do not memorize or guess detailed action parameters; use search/describe/help output for details.",
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

const FINAL_ANSWER_ORDER_GUIDANCE =
	"Before writing the final user-facing answer, complete all required tool calls and cleanup work, including validation, saving files, todo updates, and status updates. " +
	"Once you begin the final answer, do not call more tools or perform additional actions. If more work is needed, do it first, then answer.";

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
	| "mode"
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
	/** 允许出现的对话场景 slug（fail-closed：缺省/空 = 所有场景都不激活）。由插件 registerTool 声明。 */
	scope_use?: string[];
	/** 需要的会话能力 slug（如 "knowledge"）。 */
	requires?: string[];
	/** 允许出现的工作模式 slug（agent_mode 轴，缺省/空 = 通用）。见 ADR-0046。 */
	agent_mode?: string[];
	context?: { conversation?: "summary" | "messages" };
	/**
	 * 该工具带有宿主自渲染卡片（插件注册了 tool-call slot），其结果是用户当作答案来读的
	 * 产物。宿主据此为它追加一个可选的 `md_intro` 参数：模型填的这段 markdown 会渲染在
	 * 卡片正上方，作为产物的一句话说明。插件无需感知，宿主自动检测并注入。见 ADR-0047。
	 */
	rendersCard?: boolean;
}

export interface AgentPluginStateContribution {
	pluginId: string;
	id: string;
	schema?: JsonSchema;
	initialValue?: unknown;
	persist?: boolean;
}

export interface AgentPluginContinuationContribution {
	pluginId: string;
	id: string;
	handlerId: string;
	timeoutMs?: number;
	context?: { conversation?: "summary" | "messages" };
}

export interface AgentPluginSystemPromptProviderContribution {
	pluginId: string;
	id: string;
	handlerId: string;
	timeoutMs?: number;
	context?: {
		systemPrompt?: "none" | "blocks" | "rendered" | "full";
		conversation?: "summary" | "messages";
	};
}

export interface AgentPluginSystemPromptMessage {
	role: string;
	text: string;
	timestamp?: number;
	toolName?: string;
}

export interface AgentPluginSystemPromptInvocation {
	pluginId: string;
	providerId: string;
	handlerId: string;
	session: { id: string; cwd: string; scenario: string };
	model: {
		provider: string;
		id: string;
		api: string;
		input: string[];
		contextWindow?: number;
		maxTokens?: number;
	};
	conversation: { messages: AgentPluginSystemPromptMessage[]; messageCount: number };
	runtime: { activeToolNames: string[]; availableToolNames: string[]; runIndex: number };
	trigger: { kind: "agent-run"; timestamp: number };
	systemPrompt?: {
		base: { blocks?: SystemPromptBlock[]; rendered?: string };
		current: { blocks?: SystemPromptBlock[]; rendered?: string };
	};
}

export type AgentPluginRuntimeEffect =
	| SystemPromptOperation
	| { type: "setToolEnabled"; toolName: string; enabled: boolean }
	| { type: "requestContinuation"; result: AgentPluginContinuationResult };

export interface AgentPluginHandlerResult<T> {
	value: T;
	effects: AgentPluginRuntimeEffect[];
}

export type AgentPluginSystemPromptInvoker = (
	invocation: AgentPluginSystemPromptInvocation,
	signal?: AbortSignal,
) => Promise<AgentPluginRuntimeEffect[]>;

/**
 * Plugin-scoped MCP server config (aligned with `McpServerConfig`). Host resolves
 * relative paths before injecting into the runtime.
 */
export type AgentPluginMcpServerConfig =
	| {
			type?: "stdio";
			command: string;
			args?: string[];
			env?: Record<string, string>;
			cwd?: string;
			disabled?: boolean;
			autoApprove?: string[];
			startupTimeout?: number;
			debug?: boolean;
			displayName?: string;
			description?: string;
	  }
	| {
			type: "http";
			url: string;
			headers?: Record<string, string>;
			oauthClientId?: string;
			oauthDeviceFlow?: boolean;
			oauthScopes?: string;
			disabled?: boolean;
			autoApprove?: string[];
			startupTimeout?: number;
			debug?: boolean;
			displayName?: string;
			description?: string;
	  };

export interface McpServerContribution {
	pluginId: string;
	localName: string;
	/** Unique runtime key; must not contain `_` (tool name adapter constraint). */
	runtimeName: string;
	config: AgentPluginMcpServerConfig;
	/** 该 server 的工具允许出现的工作模式 slug（agent_mode 轴，缺省/空 = 通用）。见 ADR-0046。 */
	agent_mode?: string[];
}

export interface AgentPluginRuntimeConfig {
	systemPromptContributions?: SystemPromptContribution[];
	skillPathContributions?: SkillPathContribution[];
	toolPolicyContributions?: ToolPolicyContribution[];
	toolContributions?: AgentPluginToolContribution[];
	stateContributions?: AgentPluginStateContribution[];
	continuationContributions?: AgentPluginContinuationContribution[];
	systemPromptProviderContributions?: AgentPluginSystemPromptProviderContribution[];
	/** Plugin-scoped MCP (third source; never written to user mcp.json). */
	mcpServerContributions?: McpServerContribution[];
}

export interface AgentPluginToolInvocation {
	pluginId: string;
	toolId: string;
	toolName: string;
	handlerId: string;
	input: unknown;
	session: AgentPluginSystemPromptInvocation["session"];
	model: AgentPluginSystemPromptInvocation["model"];
	conversation: AgentPluginSystemPromptInvocation["conversation"];
	runtime: AgentPluginSystemPromptInvocation["runtime"];
	trigger: { kind: "tool-call"; timestamp: number; toolCallId: string };
}

export type AgentPluginToolInvoker = (
	invocation: AgentPluginToolInvocation,
	signal?: AbortSignal,
) => Promise<AgentPluginHandlerResult<unknown>>;

export interface AgentPluginContinuationInvocation {
	pluginId: string;
	providerId: string;
	handlerId: string;
	session: AgentPluginSystemPromptInvocation["session"];
	model: AgentPluginSystemPromptInvocation["model"];
	conversation: AgentPluginSystemPromptInvocation["conversation"];
	runtime: AgentPluginSystemPromptInvocation["runtime"];
	trigger: { kind: "continuation"; timestamp: number };
}

export interface AgentPluginContinuationResult {
	text: string;
	idempotencyKey?: string;
}

export type AgentPluginContinuationInvoker = (
	invocation: AgentPluginContinuationInvocation,
	signal?: AbortSignal,
) => Promise<AgentPluginHandlerResult<AgentPluginContinuationResult | null>>;

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
	/**
	 * 工作模式专用系统提示词正文（getModePrompt 解析）。作为独立 `mode` block 注入，与 persona 正交。
	 * 空/未传 = 不追加。见 ADR-0046。
	 */
	modePrompt?: string;
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

/**
 * MCP 工具的完整 description 已随请求的 tools 数组下发，这里的清单只是索引；
 * 只取首行摘要，避免长描述（如 Notion 单工具数千字符）在系统提示词里重复计费。
 */
function firstLine(text: string): string {
	const line = text.split("\n", 1)[0]?.trim() ?? "";
	return line.length > 200 ? `${line.slice(0, 200)}…` : line;
}

function renderMcpToolsSection(mcpTools: McpToolInfo[], markdownTools: boolean): string {
	if (mcpTools.length === 0) {
		return "";
	}
	const toolsList = mcpTools
		.map((tool) =>
			markdownTools
				? `- **${tool.name}**: ${firstLine(tool.description)}`
				: `- ${tool.name}: ${firstLine(tool.description)}`,
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

export function applySystemPromptOperation(
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

export function applySystemPromptOperations(
	draft: SystemPromptDraft,
	pluginId: string,
	operations: readonly SystemPromptOperation[],
): SystemPromptDraft {
	const nextDraft: SystemPromptDraft = {
		blocks: draft.blocks.map((block) => ({ ...block, source: { ...block.source } })),
		metadata: { ...draft.metadata },
	};
	for (const operation of operations) {
		applySystemPromptOperation(nextDraft, pluginId, operation);
	}
	return nextDraft;
}

function applySystemPromptContributions(draft: SystemPromptDraft, config: AgentPluginRuntimeConfig | undefined): void {
	for (const contribution of config?.systemPromptContributions ?? []) {
		const nextDraft = applySystemPromptOperations(draft, contribution.pluginId, contribution.operations);
		draft.blocks = nextDraft.blocks;
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

	if (hasSelectedCommandTool) {
		guidelinesList.push(
			"Before bash/shell: if the process may not exit on its own (dev server, watcher, docker compose up without -d, make dev), MUST set run_in_background: true. Foreground blocks the entire agent turn until exit (or auto-promote after the soft wait).",
		);
	}

	if (hasDirTree) {
		guidelinesList.push(
			'ALWAYS use dir_tree (not bash "tree", "ls -R", "find", "fd", or "rg --files") whenever you need to view directory structure or explore a codebase. Only fall back to bash if dir_tree cannot fulfill the specific requirement (e.g., custom output formatting)',
		);
	}

	if (tools.includes("dispatch_workflows")) {
		guidelinesList.push(
			"PARALLEL WORKFLOWS: this app can fan a complex task out to parallel workflow subagents via dispatch_workflows — each inherits a snapshot of this conversation and executes its own todo list concurrently. Proactively consider dispatching workflows whenever a task splits into independent, non-overlapping scopes (multi-module changes, batch generation, parallel research); do not wait for the user to ask. You are notified via <subagent_notification> as each finishes — after dispatching, NEVER sit in wait_agent: end your turn (or do other work) and react to notifications passively. When the user pauses workflows and later says continue, RESUME each interrupted workflow with followup_task (context and todo progress are preserved) — never re-dispatch them as new workflows.",
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
	guidelinesList.push(FINAL_ANSWER_ORDER_GUIDANCE);
	guidelinesList.push(
		"MANDATORY file-link format: EVERY time you mention a file you created, edited, read, or otherwise point the user at — anywhere in your prose, including headings, list items, tables, and 'saved to' / 'output' lines — you MUST write it as a markdown link whose target is the file's ABSOLUTE path: [filename.ext](/abs/path/filename.ext). The UI turns these into clickable preview badges, so this is not optional styling. " +
			"NEVER emit a bare file path as plain text, and NEVER wrap a file path in inline code/backticks (`/Users/...`) when you are pointing the user at it — backtick paths render as dead monospace text with no preview. Do NOT prepend file emojis like 📄 or 📁; the badge already shows a file-type icon. " +
			"Correct: Saved to [report.md](/Users/me/Desktop/report.md). Wrong: Saved to `/Users/me/Desktop/report.md` — or — Saved to 📄 /Users/me/Desktop/report.md. " +
			"Use the exact absolute path returned by tools (do not invent or guess paths); if you genuinely only have a relative path, leave it as plain text rather than fabricating an absolute one. " +
			"The ONLY exception is file paths that appear inside fenced code blocks or shell command examples — keep those as-is.",
	);
	if (hasEdit || hasWrite || hasSelectedCommandTool) {
		guidelinesList.push(
			"When you finish a task that produced or changed files, the VERY LAST thing in your final message MUST be a single aggregated deliverables block: a short heading line (e.g. '产物:' / 'Deliverables:') followed by a markdown UNORDERED LIST where each item is a markdown link to the file's ABSOLUTE path (per the file-link rule above) — `- [filename.ext](/abs/path/filename.ext)`. " +
				"This block goes at the END of the conclusion, not the beginning, and it is the ONLY place you list the outputs — do NOT also scatter the same deliverable links inline earlier in the summary; mention them once, here, gathered together. " +
				"Include only the user-facing deliverables — the files the user actually wants (e.g. the .pptx/.pdf/.docx/.xlsx/image), NOT intermediate scaffolding like unpacked XML, temp files, or lockfiles, and not files you merely read or inspected. If the task produced no files, omit the block entirely.",
		);
	}
	guidelinesList.push(
		"When you reference a web URL in your prose, render it as a markdown link with descriptive text, e.g. [Vite docs](https://vitejs.dev), instead of pasting the bare URL. " +
			"Inside code blocks or shell command examples, keep URLs as-is.",
	);
	guidelinesList.push(
		"When the user sends images inline in their message, analyze them directly using your vision capabilities. Do NOT try to locate or read them from disk - the image data is already embedded in the message",
	);

	return guidelinesList.map((guideline) => `- ${guideline}`).join("\n");
}

function buildToolDescriptions(agentPlugins: AgentPluginRuntimeConfig | undefined): Record<string, string> {
	const descriptions = { ...toolDescriptions };
	for (const tool of agentPlugins?.toolContributions ?? []) {
		descriptions[tool.name] = tool.description;
	}
	return descriptions;
}

function resolvePromptTools(
	selectedTools: string[] | undefined,
	defaultCommandTool: string,
	toolDescriptionsByName: Record<string, string>,
): string[] {
	return (selectedTools || ["read", defaultCommandTool, "edit", "write", "dir_tree"]).filter(
		(tool) => tool in toolDescriptionsByName,
	);
}

function renderToolsList(tools: string[], toolDescriptionsByName: Record<string, string>): string {
	return tools.length > 0 ? tools.map((tool) => `- ${tool}: ${toolDescriptionsByName[tool]}`).join("\n") : "(none)";
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
		modePrompt,
		agentPlugins,
	} = options;
	const resolvedCwd = cwd ?? process.cwd();
	const dateTime = buildDateTime();
	const defaultCommandTool = process.platform === "win32" ? "shell" : "bash";
	const contextFiles = providedContextFiles ?? [];
	const skills = providedSkills ?? [];
	const mcpTools = providedMcpTools ?? [];
	const resolvedToolDescriptions = buildToolDescriptions(agentPlugins);
	const tools = resolvePromptTools(selectedTools, defaultCommandTool, resolvedToolDescriptions);
	const toolsList = renderToolsList(tools, resolvedToolDescriptions);
	const blocks: SystemPromptBlock[] = [];

	if (customPrompt) {
		blocks.push(coreBlock("core.subconscious", "subconscious", SUBCONSCIOUS, 100));
		blocks.push(coreBlock("core.base", "base", customPrompt, 200));
		blocks.push(coreBlock("core.tools", "tools", `Available tools:\n${toolsList}`, 300));
		blocks.push(coreBlock("core.append", "append", appendSystemPrompt ?? "", 400));
		blocks.push(coreBlock("core.mcp", "mcp", renderMcpToolsSection(mcpTools, true), 500));
		blocks.push(coreBlock("core.context", "context", renderContextFilesSection(contextFiles), 600));
		blocks.push(coreBlock("core.memory", "memory", memory ?? "", 700));
		const canUseSkills = !selectedTools || selectedTools.includes("invoke_skill") || selectedTools.includes("read");
		if (canUseSkills && skills.length > 0) {
			blocks.push(coreBlock("core.skills", "skills", formatSkillsForPrompt(skills), 800));
		}
		blocks.push(
			coreBlock(
				"core.filename-fidelity",
				"guidelines",
				"**CRITICAL — File name fidelity**: " +
					"File names and paths are opaque byte strings — reproduce them EXACTLY as returned by tools or provided by the user. " +
					"NEVER add, remove, or change any characters including spaces, dashes, underscores, or punctuation. " +
					"When in doubt, run ls or find first to get the exact name, then copy it verbatim.",
				900,
			),
		);
		blocks.push(coreBlock("core.final-answer-order", "guidelines", FINAL_ANSWER_ORDER_GUIDANCE, 950));
		blocks.push(coreBlock("core.mode", "mode", modePrompt ?? "", 975));
		blocks.push(coreBlock("core.personalization", "personalization", personalization ?? "", 1000));
		blocks.push(coreBlock("core.footer", "footer", renderFooter(dateTime, resolvedCwd), 1100));
		const draft: SystemPromptDraft = { blocks, metadata: { cwd: resolvedCwd, dateTime } };
		applySystemPromptContributions(draft, agentPlugins);
		return draft;
	}

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
	blocks.push(coreBlock("core.mode", "mode", modePrompt ?? "", 850));
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
