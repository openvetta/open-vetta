import type { JSX } from "react";
import { useEffect, useRef } from "react";

export type BackgroundTaskStatus = "running" | "completed" | "failed" | "killed";

/** Props-driven task row; status meta / duration pre-resolved by host model. */
export interface BackgroundTaskViewItem {
	id: string;
	command: string;
	status: BackgroundTaskStatus;
	tail: string;
	exitCode?: number;
	statusIcon: string;
	statusLabel: string;
	statusClassName: string;
	durationLabel: string;
}

export interface BackgroundTasksTabPanelViewProps {
	items: readonly BackgroundTaskViewItem[];
	emptyLabel: string;
	/** Null when there are no finished tasks (hide clear button). */
	clearFinishedLabel: string | null;
	onClearFinished: () => void;
}

function TaskCard({ task }: { task: BackgroundTaskViewItem }): JSX.Element {
	const tailRef = useRef<HTMLPreElement>(null);

	// 输出尾部自动滚动到底部，跟随最新输出
	useEffect(() => {
		const el = tailRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [task.tail]);

	return (
		<div className="rounded-lg border border-border bg-background p-2.5">
			<div className="flex items-center gap-1.5">
				<span className={`${task.statusIcon} h-3.5 w-3.5 shrink-0 ${task.statusClassName}`} />
				<span className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
					{task.id}
				</span>
				<span className={`text-[11px] font-medium ${task.statusClassName}`}>{task.statusLabel}</span>
				{task.exitCode !== undefined && (
					<span className="text-[10px] text-muted-foreground/70">exit {task.exitCode}</span>
				)}
				<span className="ml-auto shrink-0 text-[10px] text-muted-foreground/70">{task.durationLabel}</span>
			</div>
			<div className="mt-1.5 truncate font-mono text-[11px] text-foreground" title={task.command}>
				{task.command}
			</div>
			{task.tail && (
				<pre
					ref={tailRef}
					className="mt-1.5 max-h-[120px] overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/60 p-1.5 font-mono text-[10px] leading-relaxed text-muted-foreground"
				>
					{task.tail}
				</pre>
			)}
		</div>
	);
}

export function BackgroundTasksTabPanelView({
	items,
	emptyLabel,
	clearFinishedLabel,
	onClearFinished,
}: BackgroundTasksTabPanelViewProps): JSX.Element {
	if (items.length === 0) {
		return (
			<div className="flex flex-1 items-center justify-center p-4 text-sm text-muted-foreground">
				{emptyLabel}
			</div>
		);
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			{clearFinishedLabel !== null && (
				<div className="flex shrink-0 items-center justify-end px-2.5 pt-2">
					<button
						type="button"
						onClick={onClearFinished}
						className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					>
						<span className="icon-[mdi--broom] h-3 w-3" />
						<span>{clearFinishedLabel}</span>
					</button>
				</div>
			)}
			<div className="flex-1 space-y-2 overflow-y-auto p-2.5">
				{items.map((task) => (
					<TaskCard key={task.id} task={task} />
				))}
			</div>
		</div>
	);
}
