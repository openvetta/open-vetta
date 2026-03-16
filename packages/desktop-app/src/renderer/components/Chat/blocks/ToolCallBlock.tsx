import { useState } from "react";
import type { ToolCallBlock } from "../../../store/atoms";

interface ToolCallBlockProps {
	block: ToolCallBlock;
}

/** Parse MCP tool name: mcp_serverName_toolName */
function parseMcpTool(name: string): { server: string; tool: string } | null {
	const match = name.match(/^mcp_([^_]+)_(.+)$/);
	return match ? { server: match[1], tool: match[2] } : null;
}

/** Shorten path for display */
function shortenPath(path: string): string {
	const home = typeof window !== "undefined" ? "" : "";
	if (home && path.startsWith(home)) return `~${path.slice(home.length)}`;
	// Just show the last 3 path segments
	const parts = path.split("/");
	return parts.length > 3 ? `.../${parts.slice(-3).join("/")}` : path;
}

/** Get icon for tool */
function toolIcon(name: string): string {
	if (name.startsWith("mcp_")) return "icon-[mdi--cloud-outline]";
	switch (name) {
		case "read": return "icon-[mdi--file-document-outline]";
		case "write": return "icon-[mdi--file-edit-outline]";
		case "edit": return "icon-[mdi--file-replace-outline]";
		case "bash": return "icon-[mdi--console]";
		case "ls": case "find": case "dir_tree": case "tree": return "icon-[mdi--folder-search-outline]";
		case "grep": return "icon-[mdi--text-search]";
		default: return "icon-[mdi--wrench-outline]";
	}
}

/** Status colors */
function statusColor(status: ToolCallBlock["status"]): string {
	switch (status) {
		case "pending": return "var(--tool-pending)";
		case "success": return "var(--tool-success)";
		case "error": return "var(--tool-error)";
	}
}

function statusBg(status: ToolCallBlock["status"]): string {
	switch (status) {
		case "pending": return "var(--tool-pending-bg)";
		case "success": return "var(--tool-success-bg)";
		case "error": return "var(--tool-error-bg)";
	}
}

/** Format the tool header based on tool type */
function ToolHeader({ block }: { block: ToolCallBlock }): JSX.Element {
	const mcp = parseMcpTool(block.toolName);
	const args = block.args;

	if (mcp) {
		return (
			<div className="flex items-center gap-1.5 text-[12px]">
				<span className="rounded bg-[var(--accent-dim)] px-1 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
					MCP:{mcp.server}
				</span>
				<span className="font-semibold text-[var(--text-1)]">{mcp.tool}</span>
				{(args.path || args.uri || args.url || args.file_path) && (
					<span className="text-[var(--accent)] opacity-70">
						{shortenPath(String(args.path || args.uri || args.url || args.file_path))}
					</span>
				)}
			</div>
		);
	}

	// Built-in tools
	const name = block.toolName;
	let detail = "";

	if (name === "read" || name === "write" || name === "edit") {
		const path = args.file_path ?? args.path;
		if (typeof path === "string") detail = shortenPath(path);
	} else if (name === "bash") {
		const cmd = args.command;
		if (typeof cmd === "string") detail = cmd.length > 80 ? `${cmd.slice(0, 77)}...` : cmd;
	} else if (name === "grep") {
		const pattern = args.pattern;
		if (typeof pattern === "string") detail = `/${pattern}/`;
	} else if (name === "find" || name === "ls" || name === "dir_tree" || name === "tree") {
		const path = args.path ?? args.pattern;
		if (typeof path === "string") detail = shortenPath(path);
	}

	return (
		<div className="flex items-center gap-1.5 text-[12px]">
			<span className="font-semibold text-[var(--text-1)]">{name}</span>
			{detail && (
				<span className="min-w-0 truncate text-[var(--text-2)]">{detail}</span>
			)}
		</div>
	);
}

/** Format tool args for non-built-in tools */
function ToolArgs({ args, toolName }: { args: Record<string, unknown>; toolName: string }): JSX.Element | null {
	const mcp = parseMcpTool(toolName);
	const skipKeys = ["path", "uri", "url", "file_path", "command"];

	// For MCP tools, skip primary path-like args already shown in header
	// For built-in tools, skip the main arg already shown in header
	const entries = Object.entries(args).filter(([key, val]) => {
		if (val === undefined || val === null) return false;
		if (mcp && ["path", "uri", "url", "file_path"].includes(key)) return false;
		if (!mcp && skipKeys.includes(key)) return false;
		// For write/edit, skip large content
		if ((toolName === "write" || toolName === "edit") && (key === "content" || key === "old_string" || key === "new_string")) return false;
		return true;
	});

	if (entries.length === 0) return null;

	return (
		<div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
			{entries.map(([key, val]) => (
				<span key={key}>
					<span className="text-[var(--text-3)]">{key}:</span>{" "}
					<span className="text-[var(--text-2)]">
						{typeof val === "string" && val.length > 60 ? `${val.slice(0, 57)}...` : String(val)}
					</span>
				</span>
			))}
		</div>
	);
}

/** Extract a short content preview for write/edit tools */
function getContentPreview(block: ToolCallBlock): string | null {
	if (block.status === "pending") return null;
	const maxLines = 4;
	let content: string | undefined;
	if (block.toolName === "write") {
		content = block.args.content as string | undefined;
	} else if (block.toolName === "edit") {
		content = block.args.new_string as string | undefined;
	}
	if (!content || typeof content !== "string") return null;
	const lines = content.split("\n");
	if (lines.length <= maxLines) return content;
	return `${lines.slice(0, maxLines).join("\n")}\n... (+${lines.length - maxLines} lines)`;
}

export function ToolCallBlockView({ block }: ToolCallBlockProps): JSX.Element {
	const [expanded, setExpanded] = useState(false);
	const hasResult = block.result !== undefined;
	const contentPreview = getContentPreview(block);
	const resultLines = block.result?.split("\n") ?? [];
	const maxCollapsedLines = 8;
	const needsTruncation = resultLines.length > maxCollapsedLines;

	return (
		<div
			className="my-1 overflow-hidden rounded-lg border"
			style={{
				borderColor: statusColor(block.status),
				background: statusBg(block.status),
			}}
		>
			{/* Header */}
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				className="flex w-full items-center gap-2 px-3 py-2 text-left"
			>
				{/* Status indicator */}
				{block.status === "pending" ? (
					<span
						className="h-2 w-2 shrink-0 rounded-full"
						style={{ background: statusColor(block.status), animation: "pulse 1.5s infinite" }}
					/>
				) : (
					<span
						className={`h-3 w-3 shrink-0 ${toolIcon(block.toolName)}`}
						style={{ color: statusColor(block.status) }}
					/>
				)}

				<div className="min-w-0 flex-1">
					<ToolHeader block={block} />
				</div>

				{/* Expand/collapse chevron */}
				{hasResult && (
					<span
						className={`icon-[mdi--chevron-down] h-3.5 w-3.5 shrink-0 text-[var(--text-3)] transition-transform ${expanded ? "rotate-180" : ""}`}
					/>
				)}
			</button>

			{/* Args (for non-trivial tools) */}
			{block.args && Object.keys(block.args).length > 0 && (
				<div className="px-3 pb-1">
					<ToolArgs args={block.args} toolName={block.toolName} />
				</div>
			)}

			{/* Content preview for write/edit */}
			{contentPreview && (
				<div className="border-t border-[var(--border)] px-3 py-2">
					<pre className="whitespace-pre-wrap break-words text-[11px] leading-[1.5] text-[var(--text-2)] opacity-80">
						{contentPreview}
					</pre>
				</div>
			)}

			{/* Result */}
			{hasResult && (
				<div className="border-t border-[var(--border)] px-3 py-2">
					<pre
						className="whitespace-pre-wrap break-words text-[11px] leading-[1.5] text-[var(--text-2)]"
					>
						{expanded || !needsTruncation
							? block.result
							: `${resultLines.slice(0, maxCollapsedLines).join("\n")}\n... (${resultLines.length - maxCollapsedLines} more lines)`}
					</pre>
					{block.isError && (
						<div className="mt-1 text-[11px] font-medium text-[var(--tool-error)]">Error</div>
					)}
				</div>
			)}
		</div>
	);
}
