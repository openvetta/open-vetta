import type { ToolCallBlock } from "@shared/store/atoms";
import { shortenPath } from "./format";

/** Parse MCP tool name: mcp_serverName_toolName */
export function parseMcpTool(name: string): { server: string; tool: string } | null {
	const match = name.match(/^mcp_([^_]+)_(.+)$/);
	return match ? { server: match[1], tool: match[2] } : null;
}

export function getShellCommand(block: ToolCallBlock): string | null {
	if (block.toolName !== "bash" && block.toolName !== "shell") return null;
	const cmd = block.args.command;
	return typeof cmd === "string" ? cmd : null;
}

export function getStringArg(args: Record<string, unknown>, key: string): string | null {
	const value = args[key];
	return typeof value === "string" ? value : null;
}

/** Get icon for tool */
export function toolIcon(name: string): string {
	if (name.startsWith("mcp_")) return "icon-[mdi--cloud-outline]";
	switch (name) {
		case "read":
			return "icon-[mdi--file-document-outline]";
		case "write":
			return "icon-[mdi--file-edit-outline]";
		case "edit":
			return "icon-[mdi--file-replace-outline]";
		case "bash":
		case "shell":
			return "icon-[mdi--console]";
		case "ls":
		case "find":
		case "dir_tree":
		case "tree":
			return "icon-[mdi--folder-search-outline]";
		case "grep":
			return "icon-[mdi--text-search]";
		case "ask_user_question":
			return "icon-[mdi--comment-question-outline]";
		case "easy_use_vettaApp":
			return "icon-[mdi--application-cog-outline]";
		default:
			return "icon-[mdi--wrench-outline]";
	}
}

/** Format the tool header label */
export function toolLabel(block: ToolCallBlock): { name: string; detail: string } {
	const mcp = parseMcpTool(block.toolName);
	const args = block.args;

	if (mcp) {
		const path = args.path || args.uri || args.url || args.file_path;
		return {
			name: mcp.tool,
			detail: path ? shortenPath(String(path)) : "",
		};
	}

	const name = block.toolName;
	let detail = "";

	if (name === "read" || name === "write" || name === "edit") {
		const path = args.file_path ?? args.path;
		if (typeof path === "string") detail = shortenPath(path);
		if (name === "edit" && block.uiDetails?.firstChangedLine !== undefined) {
			detail += `:${block.uiDetails.firstChangedLine}`;
		}
	} else if (name === "bash" || name === "shell") {
		const cmd = args.command;
		if (typeof cmd === "string") detail = cmd.length > 80 ? `${cmd.slice(0, 77)}...` : cmd;
	} else if (name === "grep") {
		const pattern = args.pattern;
		if (typeof pattern === "string") detail = `/${pattern}/`;
	} else if (name === "find" || name === "ls" || name === "dir_tree" || name === "tree") {
		const path = args.path ?? args.pattern;
		if (typeof path === "string") detail = shortenPath(path);
		else if (name === "dir_tree" || name === "tree") detail = ".";
	} else if (name === "extract_text_from_img" || name === "extract_text_from_pdf" || name === "html_to_pdf") {
		const input = args.input;
		if (typeof input === "string") detail = shortenPath(input);
	} else if (name === "render_pdf_page") {
		const input = args.input;
		if (typeof input === "string") {
			detail = shortenPath(input);
			if (typeof args.page === "number") detail += `:p${args.page}`;
		}
	} else if (name === "doc_to_pdf") {
		const path = args.path;
		if (typeof path === "string") detail = shortenPath(path);
	} else if (name === "ask_user_question") {
		const questions = args.questions;
		if (Array.isArray(questions) && questions.length > 0) {
			const first = questions[0] as { header?: unknown; question?: unknown };
			const head =
				typeof first.header === "string" ? first.header : typeof first.question === "string" ? first.question : "";
			detail = questions.length > 1 ? `${head} +${questions.length - 1}` : head;
		}
	} else if (name === "easy_use_vettaApp") {
		const actionId = args.actionId;
		if (typeof actionId === "string") detail = actionId;
	} else if (name === "todo") {
		const action = args.action;
		if (typeof action === "string") {
			detail = action;
			if (action === "update") {
				if (typeof args.id === "number") detail += ` #${args.id}`;
				if (typeof args.status === "string") detail += ` → ${args.status}`;
			} else if (action === "create" && Array.isArray(args.items)) {
				detail += ` (${args.items.length})`;
			}
		}
	}

	return { name, detail };
}

export function truncateFirstLine(cmd: string, maxLen = 40): string {
	const first = cmd.split("\n")[0] ?? "";
	return first.length > maxLen ? `${first.slice(0, maxLen - 1)}…` : first;
}

export function bashHeaderLabel(status: ToolCallBlock["status"], cmd: string): string {
	const short = truncateFirstLine(cmd);
	if (status === "pending") return `正在执行：${short}`;
	if (status === "error") return `命令失败：${short}`;
	return `执行命令：${short}`;
}
