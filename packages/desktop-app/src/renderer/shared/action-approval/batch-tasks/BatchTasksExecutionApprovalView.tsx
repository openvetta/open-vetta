import type { Button } from "../../components/ui/button";
type HostButton = typeof Button;
export type { HostButton as _HostPrimitiveHoldButton };
import { useThemeComponent } from "@vetta/theme-sdk";
import { BatchTasksApprovalFrameView } from "./BatchTasksApprovalFrameView";
import type { BatchTasksExecutionApprovalModel } from "./useBatchTasksExecutionApprovalModel";

export function BatchTasksExecutionApprovalView(model: BatchTasksExecutionApprovalModel): JSX.Element {
	const ThemedBatchTasksApprovalFrameView = useThemeComponent(
		"root.approval.batchTasksFrameView",
		BatchTasksApprovalFrameView,
	);

	return (
		<ThemedBatchTasksApprovalFrameView {...model.frame}>
			{model.hasInput && (
				<>
					<div className="rounded-lg border border-border/50 bg-background/50 p-3">
						<div className="flex items-start justify-between gap-4">
							<div className="min-w-0">
								<div className="truncate text-[13px] font-semibold text-foreground">{model.projectName}</div>
								<div className="mt-1 break-all text-[10px] leading-4 text-muted-foreground">{model.projectId}</div>
							</div>
							<div className="shrink-0 text-right">
								<div className="text-lg font-semibold tabular-nums text-foreground">{model.totalTasksLabel}</div>
								<div className="text-[10px] text-muted-foreground">{model.totalTasksCaption}</div>
							</div>
						</div>
						<div className="mt-3 grid grid-cols-5 gap-1.5 border-t border-border/40 pt-3">
							{model.statusCounts.map((item) => (
								<div key={item.status} className="rounded-md bg-muted/60 px-1 py-2 text-center">
									<div className="text-[12px] font-semibold tabular-nums text-foreground">{item.count}</div>
									<div className="mt-0.5 text-[9px] text-muted-foreground">{item.label}</div>
								</div>
							))}
						</div>
					</div>

					<div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
						<div className="flex items-start justify-between gap-4">
							<div className="flex min-w-0 gap-2">
								<span className={`${model.icon} mt-0.5 h-4 w-4 shrink-0 text-primary`} />
								<div>
									<div className="text-[11px] font-semibold text-foreground">{model.afterActionTitle}</div>
									<p className="mt-1 text-[11px] leading-5 text-muted-foreground">{model.description}</p>
								</div>
							</div>
							<div className="shrink-0 rounded-lg bg-background/70 px-3 py-2 text-center">
								<div className="text-base font-semibold tabular-nums text-foreground">{model.affectedCount}</div>
								<div className="text-[9px] text-muted-foreground">{model.estimatedImpactLabel}</div>
							</div>
						</div>
					</div>

					{model.showSelectedTasks && (
						<div className="rounded-lg border border-border/50 bg-background/50 p-3">
							<div className="mb-2 flex items-center justify-between">
								<span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
									{model.selectedTasksTitle}
								</span>
								<span className="text-[10px] text-muted-foreground">{model.selectedTasksCountLabel}</span>
							</div>
							<div className="max-h-36 space-y-1.5 overflow-auto">
								{model.selectedTasks.map((task) => (
									<div
										key={task.id}
										className="flex items-center justify-between gap-3 rounded-md bg-muted/50 px-2.5 py-2"
									>
										<div className="min-w-0">
											<div className="truncate text-[11px] font-medium text-foreground">
												{task.name ?? task.id}
											</div>
											{task.name && (
												<div className="mt-0.5 truncate text-[9px] text-muted-foreground">{task.sourcePath}</div>
											)}
										</div>
										<span
											className={`shrink-0 text-[10px] ${task.failed ? "text-destructive" : "text-muted-foreground"}`}
										>
											{task.statusLabel}
										</span>
									</div>
								))}
							</div>
							{model.partialWarning && (
								<p className="mt-2 text-[10px] leading-4 text-amber-400">{model.partialWarning}</p>
							)}
						</div>
					)}

					{model.warning && (
						<div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive">
							<span className="icon-[mdi--alert-outline] mt-0.5 h-4 w-4 shrink-0" />
							<p className="text-[11px] leading-5">{model.warning}</p>
						</div>
					)}
				</>
			)}

			{!model.hasInput && (
				<pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border/50 bg-background/50 p-3 font-mono text-[10px] leading-4 text-foreground">
					{JSON.stringify(model.rawInput, null, 2)}
				</pre>
			)}
		</ThemedBatchTasksApprovalFrameView>
	);
}
