/**
 * System prompt construction and project context loading
 */

import { getDocsPath, getExamplesPath, getReadmePath } from "../config.js";
import { formatSkillsForPrompt, type Skill } from "./skills.js";

/** Tool descriptions for system prompt */
const toolDescriptions: Record<string, string> = {
	read: "Read file contents",
	bash: "Execute bash commands (ls, grep, find, etc.)",
	edit: "Make surgical edits to files (find exact text and replace)",
	write: "Create or overwrite files",
	grep: "Search file contents for patterns (respects .gitignore)",
	find: "Find files by glob pattern (respects .gitignore)",
	ls: "List directory contents",
	dir_tree: "Render directory tree with [D]/[F] node types and child counts",
};

export interface McpToolInfo {
	name: string;
	description: string;
}

export interface BuildSystemPromptOptions {
	/** Custom system prompt (replaces default). */
	customPrompt?: string;
	/** Tools to include in prompt. Default: [read, bash, edit, write, dir_tree] */
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

	const contextFiles = providedContextFiles ?? [];
	const skills = providedSkills ?? [];
	const mcpTools = providedMcpTools ?? [];

	if (customPrompt) {
		let prompt = customPrompt;

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

		// Append skills section (only if read tool is available)
		const customPromptHasRead = !selectedTools || selectedTools.includes("read");
		if (customPromptHasRead && skills.length > 0) {
			prompt += formatSkillsForPrompt(skills);
		}

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
	const tools = (selectedTools || ["read", "bash", "edit", "write", "dir_tree"]).filter((t) => t in toolDescriptions);
	const toolsList = tools.length > 0 ? tools.map((t) => `- ${t}: ${toolDescriptions[t]}`).join("\n") : "(none)";

	// Build guidelines based on which tools are actually available
	const guidelinesList: string[] = [];

	const hasBash = tools.includes("bash");
	const hasEdit = tools.includes("edit");
	const hasWrite = tools.includes("write");
	const hasGrep = tools.includes("grep");
	const hasFind = tools.includes("find");
	const hasLs = tools.includes("ls");
	const hasDirTree = tools.includes("dir_tree");
	const hasRead = tools.includes("read");

	// File exploration guidelines
	if (hasBash && !hasGrep && !hasFind && !hasLs && !hasDirTree) {
		guidelinesList.push("Use bash for file operations like ls, rg, find");
	} else if (hasBash && (hasGrep || hasFind || hasLs || hasDirTree)) {
		guidelinesList.push(
			"Prefer grep/find/ls/dir_tree tools over bash for file exploration (faster, respects .gitignore)",
		);
	}

	if (hasDirTree) {
		guidelinesList.push(
			'When user asks to list project files or structure, call dir_tree first (do not use bash commands like "tree", "ls", "find", "fd", or "rg --files" for that task)',
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
			"When summarizing your actions, output plain text directly - do NOT use cat or bash to display what you did",
		);
	}

	// Always include these
	guidelinesList.push("Be concise in your responses");
	guidelinesList.push("Show file paths clearly when working with files");

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

	let prompt = `You are an expert coding assistant operating inside pi, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.

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

	// Append skills section (only if read tool is available)
	if (hasRead && skills.length > 0) {
		prompt += formatSkillsForPrompt(skills);
	}

	// Add date/time and working directory last
	prompt += `\nCurrent date and time: ${dateTime}`;
	prompt += `\nCurrent working directory: ${resolvedCwd}`;

	return prompt;
}
