/**
 * System prompt construction and project context loading
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

const VETTA_CLI_GUIDANCE = [
	"Use `vetta action` to work with the running Vetta Desktop app.",
	"It can search GUI actions, describe a specific action, and run an action through the local Desktop action RPC.",
	"When the user asks about Vetta Desktop app features, settings, pages, navigation, appearance/theme changes, or how to operate the app, you MUST inspect Vetta CLI help first with `vetta action -h` and then search/describe relevant actions as needed.",
	"Do not answer by guessing from memory.",
	"Do not inspect files under `.vetta` to resolve user confusion about app configuration or feature locations; local config files are not the app UX contract and do not help users find or change settings in the running app.",
	"Do not memorize or guess detailed action parameters; use action help/description output for details.",
	"After determining the correct action and input, call `vetta action run` directly.",
	"Actions that require authorization will automatically ask the user through Vetta Desktop while the command is running.",
	"Do not ask for authorization before running the command, and do not automatically retry an action after the user rejects it.",
].join(" ");

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
	/** Pre-rendered persistent-memory block (memory-mode only, frozen snapshot). */
	memory?: string;
	/**
	 * 个性化追加块（人设 + 自定义指令，调用方已按「人设在前、自定义在后」拼好）。
	 * 拼在系统提示词末尾（date/cwd 页脚之前），recency 最高。
	 */
	personalization?: string;
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
		memory,
		personalization,
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
	const hasCommandTool = !selectedTools || selectedTools.includes("bash") || selectedTools.includes("shell");

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

		// Persistent memory (memory-mode only, frozen snapshot)
		if (memory) {
			prompt += `\n\n${memory}`;
		}

		// Append skills section (if invoke_skill or read tool is available)
		const canUseSkills = !selectedTools || selectedTools.includes("invoke_skill") || selectedTools.includes("read");
		if (canUseSkills && skills.length > 0) {
			prompt += formatSkillsForPrompt(skills);
		}

		// Filename fidelity rule (applies to all prompts)
		prompt += "\n\n**CRITICAL — File name fidelity**: ";
		prompt +=
			"File names and paths are opaque byte strings — reproduce them EXACTLY as returned by tools or provided by the user. ";
		prompt += "NEVER add, remove, or change any characters including spaces, dashes, underscores, or punctuation. ";
		prompt += "When in doubt, run ls or find first to get the exact name, then copy it verbatim.";

		if (hasCommandTool) {
			prompt += `\n\n**Vetta Desktop actions**: ${VETTA_CLI_GUIDANCE}`;
		}

		// 个性化（人设 + 自定义指令）：拼在末尾，recency 最高
		if (personalization) {
			prompt += `\n\n${personalization}`;
		}

		// Add date/time and working directory last
		prompt += `\nCurrent date and time: ${dateTime}`;
		prompt += `\nCurrent working directory: ${resolvedCwd}`;

		return prompt;
	}

	// Build tools list based on selected tools (only built-in tools with known descriptions)
	const tools = (selectedTools || ["read", defaultCommandTool, "edit", "write", "dir_tree"]).filter(
		(t) => t in toolDescriptions,
	);
	const toolsList = tools.length > 0 ? tools.map((t) => `- ${t}: ${toolDescriptions[t]}`).join("\n") : "(none)";

	// Build guidelines based on which tools are actually available
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

	// File exploration guidelines
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

	// current_time guideline
	const hasCurrentTime = tools.includes("current_time");
	if (hasCurrentTime) {
		guidelinesList.push(
			'ALWAYS use current_time tool (not bash "date", "timedatectl", or other shell commands) when you need to know the current date or time. Only fall back to bash if current_time cannot fulfill the specific requirement (e.g., timezone conversion, date arithmetic)',
		);
	}

	if (hasSelectedCommandTool) {
		guidelinesList.push(VETTA_CLI_GUIDANCE);
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
`;

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

	// Persistent memory (memory-mode only, frozen snapshot)
	if (memory) {
		prompt += `\n\n${memory}`;
	}

	// Append skills section (if invoke_skill or read tool is available)
	const hasInvokeSkill = tools.includes("invoke_skill");
	if ((hasRead || hasInvokeSkill) && skills.length > 0) {
		prompt += formatSkillsForPrompt(skills);
	}

	// 个性化（人设 + 自定义指令）：拼在末尾，recency 最高
	if (personalization) {
		prompt += `\n\n${personalization}`;
	}

	// Add date/time and working directory last
	prompt += `\nCurrent date and time: ${dateTime}`;
	prompt += `\nCurrent working directory: ${resolvedCwd}`;

	return prompt;
}
