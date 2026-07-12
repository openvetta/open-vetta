import { useThemeComponent } from "@vetta/theme-sdk";
import { Textarea } from "../../components/ui/textarea";
import { BatchTasksApprovalFrameView } from "./BatchTasksApprovalFrameView";
import type { BatchTasksTaskApprovalModel } from "./useBatchTasksTaskApprovalModel";

export function BatchTasksTaskApprovalView(model: BatchTasksTaskApprovalModel): JSX.Element {
	const ThemedBatchTasksApprovalFrameView = useThemeComponent(
		"root.approval.batchTasksFrameView",
		BatchTasksApprovalFrameView,
	);

	return (
		<ThemedBatchTasksApprovalFrameView {...model.frame}>
			{model.hasInput && (
				<>
					<div className="rounded-lg border border-border/50 bg-background/50 p-3">
						<div className="flex items-start gap-3">
							<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
								<span className="icon-[mdi--folder-outline] h-4 w-4 text-muted-foreground" />
							</div>
							<div className="min-w-0 flex-1">
								<div className="truncate text-[12px] font-semibold text-foreground">{model.taskName}</div>
								<div className="mt-0.5 truncate text-[10px] text-muted-foreground">{model.projectName}</div>
							</div>
							{model.statusLabel && (
								<span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">
									{model.statusLabel}
								</span>
							)}
						</div>
						<div className="mt-3 space-y-2 border-t border-border/40 pt-3 text-[11px]">
							<div className="flex items-start justify-between gap-4">
								<span className="shrink-0 text-muted-foreground">{model.sourceFolderLabel}</span>
								<span className="min-w-0 break-all text-right text-foreground">{model.sourcePath}</span>
							</div>
							<div className="flex items-start justify-between gap-4">
								<span className="shrink-0 text-muted-foreground">{model.taskIdLabel}</span>
								<span className="min-w-0 break-all text-right font-mono text-[10px] text-foreground">
									{model.taskId}
								</span>
							</div>
							<div className="flex items-center justify-between gap-4">
								<span className="text-muted-foreground">{model.relatedSessionLabel}</span>
								<span className="text-foreground">{model.relatedSessionValue}</span>
							</div>
						</div>
					</div>

					<div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
						<div className="flex gap-2">
							<span className={`${model.icon} mt-0.5 h-4 w-4 shrink-0 text-primary`} />
							<div>
								<div className="text-[11px] font-semibold text-foreground">{model.afterActionTitle}</div>
								<p className="mt-1 text-[11px] leading-5 text-muted-foreground">{model.description}</p>
							</div>
						</div>
					</div>

					{model.showResumeText && (
						<div className="rounded-lg border border-border/50 bg-background/50 p-3">
							<label
								className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
								htmlFor="batch-task-resume-text"
							>
								{model.resumeTextLabel}
							</label>
							<Textarea
								key={model.approvalId}
								id="batch-task-resume-text"
								value={model.resumeText}
								onChange={(event) => model.onResumeTextChange(event.target.value)}
								className="min-h-28 resize-y"
							/>
						</div>
					)}

					{model.lastError && (
						<div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
							<div className="mb-1 text-[10px] font-medium text-destructive">{model.lastErrorLabel}</div>
							<p className="max-h-24 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-5 text-muted-foreground">
								{model.lastError}
							</p>
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
