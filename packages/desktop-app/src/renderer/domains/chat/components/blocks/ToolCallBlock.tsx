import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { ToolCallBlock, ToolPhaseInfo } from "@shared/store/atoms";

interface ToolCallBlockProps {
	block: ToolCallBlock;
}

/**
 * Threshold above which a tool call's duration is shown as a header badge.
 * Below this, the duration is still recorded and visible in the expanded
 * meta panel, but the header stays uncluttered.
 */
const CONSPICUOUS_DURATION_MS = 1000;

/** Parse MCP tool name: mcp_serverName_toolName */
function parseMcpTool(name: string): { server: string; tool: string } | null {
	const match = name.match(/^mcp_([^_]+)_(.+)$/);
	return match ? { server: match[1], tool: match[2] } : null;
}

/** Shorten path for display */
function shortenPath(path: string): string {
	const parts = path.replace(/\\/g, "/").split("/");
	return parts.length > 3 ? `.../${parts.slice(-3).join("/")}` : path;
}

function getShellCommand(block: ToolCallBlock): string | null {
	if (block.toolName !== "bash" && block.toolName !== "shell") return null;
	const cmd = block.args.command;
	return typeof cmd === "string" ? cmd : null;
}

/** Get icon for tool */
function toolIcon(name: string): string {
	if (name.startsWith("mcp_")) return "icon-[mdi--cloud-outline]";
	switch (name) {
		case "read": return "icon-[mdi--file-document-outline]";
		case "write": return "icon-[mdi--file-edit-outline]";
		case "edit": return "icon-[mdi--file-replace-outline]";
		case "bash": case "shell": return "icon-[mdi--console]";
		case "ls": case "find": case "dir_tree": case "tree": return "icon-[mdi--folder-search-outline]";
		case "grep": return "icon-[mdi--text-search]";
		default: return "icon-[mdi--wrench-outline]";
	}
}

/** Format the tool header label */
function toolLabel(block: ToolCallBlock): { name: string; detail: string } {
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
	} else if (name === "doc_to_pdf") {
		const path = args.path;
		if (typeof path === "string") detail = shortenPath(path);
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

/** Status indicator dot/icon */
function StatusIndicator({ status }: { status: ToolCallBlock["status"] }): JSX.Element {
	if (status === "pending") {
		return (
			<span
				className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40"
				style={{ animation: "pulse 1.5s infinite" }}
			/>
		);
	}
	if (status === "error") {
		return <span className="icon-[mdi--close-circle-outline] h-3.5 w-3.5 shrink-0 text-destructive/70" />;
	}
	return <span className={`${toolIcon("success")} h-3.5 w-3.5 shrink-0 text-muted-foreground/30`} />;
}

/** Compact "1.2s" / "12.3s" / "2m04s" — for header badges. */
function formatDurationCompact(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
	const minutes = Math.floor(ms / 60_000);
	const seconds = Math.floor((ms % 60_000) / 1000);
	return `${minutes}m${seconds.toString().padStart(2, "0")}s`;
}

/** Precise "12.345s" / "1m02.345s" — for the meta panel. */
function formatDurationPrecise(ms: number): string {
	if (ms < 60_000) return `${(ms / 1000).toFixed(3)}s`;
	const minutes = Math.floor(ms / 60_000);
	const seconds = (ms % 60_000) / 1000;
	return `${minutes}m${seconds.toFixed(3).padStart(6, "0")}s`;
}

function formatStartedAt(ms: number): string {
	const d = new Date(ms);
	return `${d.getHours().toString().padStart(2, "0")}:${d
		.getMinutes()
		.toString()
		.padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
}

/**
 * Render phases as a centred-dot string: "download 2.1s · ocr 12.3s · write 0.8s".
 * Each phase's duration = next phase's atMs minus its own (last uses totalMs).
 */
function formatPhases(phases: ToolPhaseInfo[], totalMs: number): string {
	return phases
		.map((p, i) => {
			const end = i + 1 < phases.length ? phases[i + 1].atMs : totalMs;
			const dur = Math.max(0, end - p.atMs);
			return `${p.label} ${formatDurationCompact(dur)}`;
		})
		.join(" · ");
}

/** Tick once per second while the tool is still running, so the live badge updates. */
function useElapsedWhilePending(startedAt: number | undefined, pending: boolean): number | null {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		if (!pending || startedAt === undefined) return;
		const id = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(id);
	}, [pending, startedAt]);
	if (startedAt === undefined) return null;
	return Math.max(0, now - startedAt);
}

export function ToolCallBlockView({ block }: ToolCallBlockProps): JSX.Element {
	const [expanded, setExpanded] = useState(false);
	const hasResult = block.result !== undefined;
	const hasMeta = block.startedAt !== undefined;
	const canExpand = hasResult || hasMeta;
	const { name, detail } = toolLabel(block);
	const mcp = parseMcpTool(block.toolName);
	const icon = toolIcon(block.toolName);
	const shellCommand = getShellCommand(block);

	const isPending = block.status === "pending";
	const liveElapsedMs = useElapsedWhilePending(block.startedAt, isPending);

	// Pick the duration we know about: live elapsed while pending, recorded
	// durationMs once the tool has ended. The header badge only appears past
	// CONSPICUOUS_DURATION_MS so quick tools stay visually unobtrusive.
	const badgeMs = isPending ? liveElapsedMs : block.durationMs ?? null;
	const showBadge = badgeMs !== null && badgeMs >= CONSPICUOUS_DURATION_MS;

	return (
		<div className="group">
			<button
				type="button"
				onClick={() => canExpand && setExpanded(!expanded)}
				className={`inline-flex items-center gap-2 rounded-lg pr-2 py-1 text-left transition-colors ${canExpand ? "hover:bg-muted/60 cursor-pointer" : "cursor-default"}`}
			>
				{/* Status + Icon */}
				{isPending ? (
					<StatusIndicator status="pending" />
				) : block.status === "error" ? (
					<StatusIndicator status="error" />
				) : (
					<span className={`${icon} h-3.5 w-3.5 shrink-0 text-muted-foreground/40`} />
				)}

				{/* Tool name and detail */}
				<div className="flex min-w-0 items-center gap-1.5 text-[12px]">
					{mcp && (
						<span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground/50">
							{mcp.server}
						</span>
					)}
					<span className="font-medium text-foreground/70">{name}</span>
					{detail && (
						<span className="min-w-0 truncate text-muted-foreground/40">{detail}</span>
					)}
					{isPending && block.currentPhase && (
						<span className="shrink-0 italic text-muted-foreground/50">— {block.currentPhase}</span>
					)}
				</div>

				{/* Duration badge — only when ≥ CONSPICUOUS_DURATION_MS */}
				{showBadge && badgeMs !== null && (
					<span
						className={`shrink-0 rounded px-1 py-0.5 text-[10px] tabular-nums ${
							isPending
								? "bg-primary/10 text-primary/70"
								: "bg-muted text-muted-foreground/60"
						}`}
					>
						{formatDurationCompact(badgeMs)}
					</span>
				)}

				{/* Expand chevron */}
				{canExpand && (
					<span
						className={`icon-[mdi--chevron-right] h-3 w-3 shrink-0 text-muted-foreground/30 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
					/>
				)}
			</button>

			{/* Expandable result */}
			<AnimatePresence initial={false}>
				{expanded && canExpand && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
						className="overflow-hidden"
					>
						<div className="ml-2 border-l-2 border-muted-foreground/10 pl-4 pt-1 pb-2">
							{/* Meta row — out-of-band, never sent to the LLM */}
							{hasMeta && block.startedAt !== undefined && (
								<div
									className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground/50"
									title="本地元数据，仅 UI 展示，不发送给大模型"
								>
									<span className="font-medium text-muted-foreground/60">meta</span>
									<span className="tabular-nums">{formatStartedAt(block.startedAt)}</span>
									{block.durationMs !== undefined && (
										<>
											<span className="text-muted-foreground/30">·</span>
											<span className="tabular-nums">{formatDurationPrecise(block.durationMs)}</span>
										</>
									)}
									{block.phases && block.phases.length > 0 && block.durationMs !== undefined && (
										<>
											<span className="text-muted-foreground/30">·</span>
											<span className="break-all">{formatPhases(block.phases, block.durationMs)}</span>
										</>
									)}
								</div>
							)}
							{shellCommand && (
								<pre className="mb-2 max-h-[180px] overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/30 p-2 text-[11px] leading-[1.5] text-foreground/70">
									{shellCommand}
								</pre>
							)}
							{hasResult && (
								<pre className="max-h-[300px] overflow-auto whitespace-pre-wrap break-words text-[11px] leading-[1.5] text-muted-foreground/60">
									{block.result}
								</pre>
							)}
							{block.isError && (
								<div className="mt-1 text-[11px] font-medium text-destructive/70">Error</div>
							)}
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
