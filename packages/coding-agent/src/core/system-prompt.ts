/**
 * System prompt construction and project context loading
 */

import { getDocsPath, getExamplesPath, getReadmePath } from "../config.js";
import { formatScenesForPrompt, formatSkillsForPrompt, type Skill } from "./skills.js";
import { SUBCONSCIOUS } from "./subconscious.js";

/** Tool descriptions for system prompt */
const toolDescriptions: Record<string, string> = {
	read: "Read file contents",
	bash: "Execute bash commands (ls, grep, find, etc.)",
	shell: "Execute shell commands (PowerShell on Windows by default)",
	edit: "Make surgical edits to files (find exact text and replace)",
	write: "Create or overwrite files",
	grep: "Search file contents for patterns (respects .gitignore)",
	find: "Find files by glob pattern (respects .gitignore)",
	ls: "List directory contents",
	dir_tree: "Render directory tree with [D]/[F] node types and child counts",
	invoke_skill: "Invoke a skill by name to handle specialized tasks (e.g., PDF, DOCX processing)",
	invoke_scene: "Invoke a scene by name when the user's message starts with /scene: prefix",
	todo: "Plan and track progress on multi-step tasks with a todo list",
	current_time: "Get the current date and time (preferred over bash date/time commands)",
	doc_to_pdf: "Convert .doc/.docx files to PDF using Microsoft Office or WPS Office",
};

export interface McpToolInfo {
	name: string;
	description: string;
}

export interface BuildSystemPromptOptions {
	/** Custom system prompt (replaces default). */
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
}

/** Build the system prompt with tools, guidelines, and context */
export function buildSystemPrompt(options: BuildSystemPromptOptions = {}): string {
	const {
		customPrompt,
		selectedTools,
		appendSystemPrompt,
		cwd,
		contextFiles: providedContextFiles,
		skills: providedSkills,
		mcpTools: providedMcpTools,
	} = options;
	const resolvedCwd = cwd ?? process.cwd();

	const now = new Date();
	const dateTime = now.toLocaleString("en-US", {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		timeZoneName: "short",
	});

	const appendSection = appendSystemPrompt ? `\n\n${appendSystemPrompt}` : "";
	const defaultCommandTool = process.platform === "win32" ? "shell" : "bash";

	const contextFiles = providedContextFiles ?? [];
	const skills = providedSkills ?? [];
	const mcpTools = providedMcpTools ?? [];

	if (customPrompt) {
		// 即使用户传入 customPrompt，也始终保留出厂潜意识，防止身份被绕过
		let prompt = `${SUBCONSCIOUS}\n\n${customPrompt}`;

		if (appendSection) {
			prompt += appendSection;
		}

		// Append MCP tools section
		if (mcpTools.length > 0) {
			prompt += "\n\n# MCP (Model Context Protocol) Tools\n\n";
			prompt += "The following MCP tools are available from external servers:\n\n";
			for (const tool of mcpTools) {
				prompt += `- **${tool.name}**: ${tool.description}\n`;
			}
			prompt += "\n**IMPORTANT - MCP Tool Usage:**\n";
			prompt +=
				'- When the user explicitly mentions "use [server-name] MCP" or "using [tool-name]", you MUST use the corresponding MCP tool\n';
			prompt += '- MCP tools are prefixed with "mcp_[servername]_" (e.g., mcp_filesystem_list_directory)\n';
			prompt += "- MCP tools may provide specialized functionality not available in built-in tools\n";
			prompt +=
				'- Example: If user says "use filesystem MCP to list files", use mcp_filesystem_list_directory instead of bash ls\n';
		}

		// Append project context files
		if (contextFiles.length > 0) {
			prompt += "\n\n# Project Context\n\n";
			prompt += "Project-specific instructions and guidelines:\n\n";
			for (const { path: filePath, content } of contextFiles) {
				prompt += `## ${filePath}\n\n${content}\n\n`;
			}
		}

		// Append skills section (if invoke_skill or read tool is available)
		const canUseSkills = !selectedTools || selectedTools.includes("invoke_skill") || selectedTools.includes("read");
		if (canUseSkills && skills.length > 0) {
			prompt += formatSkillsForPrompt(skills);
		}

		// Append scenes section (if invoke_scene tool is available)
		const canUseScenes = !selectedTools || selectedTools.includes("invoke_scene");
		if (canUseScenes && skills.length > 0) {
			prompt += formatScenesForPrompt(skills);
		}

		// Filename fidelity rule (applies to all prompts)
		prompt += "\n\n**CRITICAL — File name fidelity**: ";
		prompt +=
			"File names and paths are opaque byte strings — reproduce them EXACTLY as returned by tools or provided by the user. ";
		prompt += "NEVER add, remove, or change any characters including spaces, dashes, underscores, or punctuation. ";
		prompt += "When in doubt, run ls or find first to get the exact name, then copy it verbatim. ";
		prompt +=
			"If dir_tree returns path IDs like @PATH_0001, prefer those IDs in tool path arguments instead of retyping filenames.";

		// Add date/time and working directory last
		prompt += `\nCurrent date and time: ${dateTime}`;
		prompt += `\nCurrent working directory: ${resolvedCwd}`;

		return prompt;
	}

	// Get absolute paths to documentation and examples
	const readmePath = getReadmePath();
	const docsPath = getDocsPath();
	const examplesPath = getExamplesPath();

	// Build tools list based on selected tools (only built-in tools with known descriptions)
	const tools = (selectedTools || ["read", defaultCommandTool, "edit", "write", "dir_tree"]).filter(
		(t) => t in toolDescriptions,
	);
	const toolsList = tools.length > 0 ? tools.map((t) => `- ${t}: ${toolDescriptions[t]}`).join("\n") : "(none)";

	// Build guidelines based on which tools are actually available
	const guidelinesList: string[] = [];

	const hasCommandTool = tools.includes("bash") || tools.includes("shell");
	const hasEdit = tools.includes("edit");
	const hasWrite = tools.includes("write");
	const hasGrep = tools.includes("grep");
	const hasFind = tools.includes("find");
	const hasLs = tools.includes("ls");
	const hasDirTree = tools.includes("dir_tree");
	const hasRead = tools.includes("read");

	// File exploration guidelines
	if (hasCommandTool && !hasGrep && !hasFind && !hasLs && !hasDirTree) {
		guidelinesList.push("Use the shell tool for file operations like ls, rg, find");
	} else if (hasCommandTool && (hasGrep || hasFind || hasLs || hasDirTree)) {
		guidelinesList.push(
			"Prefer grep/find/ls/dir_tree tools over the shell tool for file exploration (faster, respects .gitignore)",
		);
	}

	if (hasDirTree) {
		guidelinesList.push(
			'ALWAYS use dir_tree (not bash "tree", "ls -R", "find", "fd", or "rg --files") whenever you need to view directory structure or explore a codebase. Only fall back to bash if dir_tree cannot fulfill the specific requirement (e.g., custom output formatting)',
		);
		guidelinesList.push(
			'When dir_tree output includes path IDs like @PATH_0001, prefer these IDs as tool paths. In shell commands, wrap IDs in quotes (example: cat "@PATH_0001").',
		);
	}

	// current_time guideline
	const hasCurrentTime = tools.includes("current_time");
	if (hasCurrentTime) {
		guidelinesList.push(
			'ALWAYS use current_time tool (not bash "date", "timedatectl", or other shell commands) when you need to know the current date or time. Only fall back to bash if current_time cannot fulfill the specific requirement (e.g., timezone conversion, date arithmetic)',
		);
	}

	// Read before edit guideline
	if (hasRead && hasEdit) {
		guidelinesList.push("Use read to examine files before editing. You must use this tool instead of cat or sed.");
	}

	// Edit guideline
	if (hasEdit) {
		guidelinesList.push("Use edit for precise changes (old text must match exactly)");
	}

	// Write guideline
	if (hasWrite) {
		guidelinesList.push("Use write only for new files or complete rewrites");
	}

	// Output guideline (only when actually writing or executing)
	if (hasEdit || hasWrite) {
		guidelinesList.push(
			"When summarizing your actions, output plain text directly - do NOT use cat or shell commands to display what you did",
		);
	}

	// Filename fidelity — LLMs tend to "prettify" filenames by inserting/removing spaces around punctuation
	guidelinesList.push(
		"CRITICAL: File names and paths are opaque byte strings — reproduce them EXACTLY as returned by tools (ls, find, dir_tree) or provided by the user. " +
			"NEVER add, remove, or change any characters including spaces, dashes, underscores, or punctuation. " +
			"When in doubt, run ls or find first to get the exact name, then copy it verbatim.",
	);

	// Always include these
	guidelinesList.push("Be concise in your responses");
	guidelinesList.push("Show file paths clearly when working with files");
	guidelinesList.push(
		"When the user sends images inline in their message, analyze them directly using your vision capabilities. Do NOT try to locate or read them from disk - the image data is already embedded in the message",
	);

	const guidelines = guidelinesList.map((g) => `- ${g}`).join("\n");

	// Build MCP tools list if any are available
	let mcpToolsSection = "";
	if (mcpTools.length > 0) {
		const mcpToolsList = mcpTools.map((tool) => `- ${tool.name}: ${tool.description}`).join("\n");
		mcpToolsSection = `\n\nMCP (Model Context Protocol) tools:
${mcpToolsList}

**IMPORTANT - MCP Tool Usage:**
- When the user explicitly mentions "use [server-name] MCP" or "using [tool-name]", you MUST use the corresponding MCP tool
- MCP tools are prefixed with "mcp_[servername]_" (e.g., mcp_filesystem_list_directory)
- MCP tools may provide specialized functionality not available in built-in tools
- Example: If user says "use filesystem MCP to list files", use mcp_filesystem_list_directory instead of bash ls`;
	}

	let prompt = `${SUBCONSCIOUS}

Available tools:
${toolsList}${mcpToolsSection}

Guidelines:
${guidelines}

Pi documentation (read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI):
- Main documentation: ${readmePath}
- Additional docs: ${docsPath}
- Examples: ${examplesPath} (extensions, custom tools, SDK)
- When asked about: extensions (docs/extensions.md, examples/extensions/), themes (docs/themes.md), skills (docs/skills.md), prompt templates (docs/prompt-templates.md), TUI components (docs/tui.md), keybindings (docs/keybindings.md), SDK integrations (docs/sdk.md), custom providers (docs/custom-provider.md), adding models (docs/models.md), pi packages (docs/packages.md)
- When working on pi topics, read the docs and examples, and follow .md cross-references before implementing
- Always read pi .md files completely and follow links to related docs (e.g., tui.md for TUI API details)`;

	if (appendSection) {
		prompt += appendSection;
	}

	// Append project context files
	if (contextFiles.length > 0) {
		prompt += "\n\n# Project Context\n\n";
		prompt += "Project-specific instructions and guidelines:\n\n";
		for (const { path: filePath, content } of contextFiles) {
			prompt += `## ${filePath}\n\n${content}\n\n`;
		}
	}

	// Append skills section (if invoke_skill or read tool is available)
	const hasInvokeSkill = tools.includes("invoke_skill");
	if ((hasRead || hasInvokeSkill) && skills.length > 0) {
		prompt += formatSkillsForPrompt(skills);
	}

	// Append scenes section (if invoke_scene tool is available)
	const hasInvokeScene = tools.includes("invoke_scene");
	if (hasInvokeScene && skills.length > 0) {
		prompt += formatScenesForPrompt(skills);
	}

	// Add date/time and working directory last
	prompt += `\nCurrent date and time: ${dateTime}`;
	prompt += `\nCurrent working directory: ${resolvedCwd}`;

	return prompt;
}
