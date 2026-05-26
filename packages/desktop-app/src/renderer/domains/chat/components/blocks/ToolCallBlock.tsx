import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { ToolCallBlock } from "@shared/store/atoms";
import { BashTerminalCard } from "./tool-views/BashTerminalCard";
import { EditDiffView } from "./tool-views/EditDiffView";
import { ReadImageView } from "./tool-views/ReadImageView";
import { WriteContentView } from "./tool-views/WriteContentView";
import { StatusIndicator } from "./tool-views/shared/StatusIndicator";
import { useElapsedWhilePending } from "./tool-views/shared/use-elapsed";
import {
	formatDurationCompact,
	formatDurationPrecise,
	formatPhases,
	formatStartedAt,
} from "./tool-views/shared/format";
import { getShellCommand, getStringArg, parseMcpTool, toolIcon, toolLabel } from "./tool-views/shared/parse-tool";

interface ToolCallBlockProps {
	block: ToolCallBlock;
}

/**
 * Threshold above which a tool call's duration is shown as a header badge.
 * Below this, the duration is still recorded and visible in the expanded
 * meta panel, but the header stays uncluttered.
 */
const CONSPICUOUS_DURATION_MS = 1000;

export function ToolCallBlockView({ block }: ToolCallBlockProps): JSX.Element {
	const [expanded, setExpanded] = useState(false);
	const hasResult = block.result !== undefined;
	const hasMeta = block.startedAt !== undefined;
	const hasToolSpecificResult =
		(block.toolName === "write" && getStringArg(block.args, "content") !== null) ||
		(block.toolName === "edit" &&
			(block.uiDetails?.diff !== undefined ||
				getStringArg(block.args, "oldText") !== null ||
				getStringArg(block.args, "newText") !== null));
	const canExpand = hasResult || hasMeta || hasToolSpecificResult;
	const { name, detail } = toolLabel(block);
	const mcp = parseMcpTool(block.toolName);
	const icon = toolIcon(block.toolName);
	const shellCommand = getShellCommand(block);

	const isPending = block.status === "pending";
	const liveElapsedMs = useElapsedWhilePending(block.startedAt, isPending);

	// Pick the duration we know about: live elapsed while pending, recorded
	// durationMs once the tool has ended. The header badge only appears past
	// CONSPICUOUS_DURATION_MS so quick tools stay visually unobtrusive.
	const badgeMs = isPending ? liveElapsedMs : (block.durationMs ?? null);
	const showBadge = badgeMs !== null && badgeMs >= CONSPICUOUS_DURATION_MS;

	return (
		<div className="group min-w-0">
			<button
				type="button"
				onClick={() => canExpand && setExpanded(!expanded)}
				className={`inline-flex max-w-full items-center gap-2 rounded-lg pr-2 py-1 text-left transition-colors ${canExpand ? "hover:bg-muted/60 cursor-pointer" : "cursor-default"}`}
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
				<div className="flex min-w-0 flex-1 items-center gap-1.5 text-[12px]">
					{mcp && (
						<span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground/50">
							{mcp.server}
						</span>
					)}
					<span className="shrink-0 font-medium text-foreground/70">{name}</span>
					{detail && <span className="min-w-0 truncate text-muted-foreground/40">{detail}</span>}
					{isPending && block.currentPhase && (
						<span className="min-w-0 truncate italic text-muted-foreground/50">— {block.currentPhase}</span>
					)}
				</div>

				{/* Duration badge — only when ≥ CONSPICUOUS_DURATION_MS */}
				{showBadge && badgeMs !== null && (
					<span
						className={`shrink-0 rounded px-1 py-0.5 text-[10px] tabular-nums ${
							isPending ? "bg-primary/10 text-primary/70" : "bg-muted text-muted-foreground/60"
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
						className="min-w-0 overflow-hidden"
					>
						<div className="ml-2 min-w-0 border-l-2 border-muted-foreground/10 pl-4 pt-1 pb-2">
							{shellCommand ? (
								<BashTerminalCard
									command={shellCommand}
									result={block.result}
									status={block.status}
									isError={block.isError}
									startedAt={block.startedAt}
									durationMs={block.durationMs}
									phases={block.phases}
								/>
							) : (
								<>
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
									{block.toolName === "read" && block.imagePreview ? (
										<ReadImageView image={block.imagePreview} />
									) : block.toolName === "write" ? (
										<>
											<WriteContentView block={block} />
											{block.isError && block.result && (
												<pre className="mt-2 max-h-[300px] overflow-auto whitespace-pre-wrap break-words text-[11px] leading-[1.5] text-destructive/70">
													{block.result}
												</pre>
											)}
										</>
									) : block.toolName === "edit" ? (
										<>
											<EditDiffView block={block} />
											{block.isError && block.result && (
												<pre className="mt-2 max-h-[300px] overflow-auto whitespace-pre-wrap break-words text-[11px] leading-[1.5] text-destructive/70">
													{block.result}
												</pre>
											)}
										</>
									) : hasResult ? (
										<pre className="max-h-[300px] overflow-auto whitespace-pre-wrap break-words text-[11px] leading-[1.5] text-muted-foreground/60">
											{block.result}
										</pre>
									) : null}
									{block.isError && <div className="mt-1 text-[11px] font-medium text-destructive/70">Error</div>}
								</>
							)}
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
