import type { ToolCallBlock, ToolPhaseInfo } from "@shared/store/atoms";
import { formatPhases, formatStartedAt, formatDurationPrecise } from "./shared/format";
import { bashHeaderLabel } from "./shared/parse-tool";
import { CopyIconButton } from "./shared/CopyIconButton";

export function BashTerminalCard({
	command,
	result,
	status,
	isError,
	startedAt,
	durationMs,
	phases,
}: {
	command: string;
	result: string | undefined;
	status: ToolCallBlock["status"];
	isError: boolean | undefined;
	startedAt: number | undefined;
	durationMs: number | undefined;
	phases: ToolPhaseInfo[] | undefined;
}): JSX.Element {
	const headerLabel = bashHeaderLabel(status, command);
	const isPending = status === "pending";
	const isFailed = status === "error" || isError === true;
	const hasResult = result !== undefined && result.length > 0;

	return (
		<div className="group/term min-w-0 max-w-full overflow-hidden rounded-lg border border-muted-foreground/15 bg-muted/30">
			<div className="flex items-center gap-2 border-b border-muted-foreground/10 bg-muted/20 px-3 py-1.5">
				<span
					className={`h-1.5 w-1.5 shrink-0 rounded-full ${
						isFailed ? "bg-destructive/70" : isPending ? "bg-primary/60" : "bg-emerald-500/60"
					}`}
					style={isPending ? { animation: "pulse 1.5s infinite" } : undefined}
				/>
				<span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground/70">{headerLabel}</span>
				<div className="opacity-0 transition-opacity group-hover/term:opacity-100">
					<CopyIconButton getText={() => command} label="复制命令" />
				</div>
			</div>

			<div className="max-h-[180px] overflow-auto px-3 py-2 font-mono text-[12px] leading-[1.55]">
				<div className="flex min-w-0">
					<span className="shrink-0 select-none pr-2 text-amber-500 dark:text-amber-400">$</span>
					<pre className="m-0 min-w-0 flex-1 whitespace-pre-wrap break-words text-foreground/85">
						{command}
						{isPending && (
							<span
								className="ml-0.5 inline-block h-[1em] w-[0.5em] translate-y-[2px] bg-foreground/70 align-baseline"
								style={{ animation: "bash-cursor-blink 1s steps(1) infinite" }}
							/>
						)}
					</pre>
				</div>
			</div>

			{!isPending && hasResult && (
				<div className="max-h-[300px] overflow-auto border-t border-muted-foreground/10 px-3 py-2 font-mono text-[12px] leading-[1.55]">
					<pre className="m-0 min-w-0 whitespace-pre-wrap break-words text-foreground/75">{result}</pre>
				</div>
			)}

			{isPending ? (
				<div className="flex items-center gap-1.5 border-t border-muted-foreground/10 px-3 py-1.5 text-[10px] italic text-muted-foreground/55">
					<span className="icon-[mdi--loading] h-3 w-3 animate-spin" />
					<span>正在执行···</span>
				</div>
			) : startedAt !== undefined ? (
				<div
					className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 border-t border-muted-foreground/10 px-3 py-1.5 text-[10px] text-muted-foreground/50"
					title="本地元数据，仅 UI 展示，不发送给大模型"
				>
					<span className="font-medium text-muted-foreground/60">meta</span>
					<span className="tabular-nums">{formatStartedAt(startedAt)}</span>
					{durationMs !== undefined && (
						<>
							<span className="text-muted-foreground/30">·</span>
							<span className="tabular-nums">{formatDurationPrecise(durationMs)}</span>
						</>
					)}
					{phases && phases.length > 0 && durationMs !== undefined && (
						<>
							<span className="text-muted-foreground/30">·</span>
							<span className="break-all">{formatPhases(phases, durationMs)}</span>
						</>
					)}
				</div>
			) : null}
		</div>
	);
}
