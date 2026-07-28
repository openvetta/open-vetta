import type { JSX, ReactNode } from "react";

export interface WorkflowStageViewItem {
	name: string;
	description: string;
	status: string;
	statusLabel: string;
	statusBg: string;
	statusText: string;
	memberIds: readonly number[];
	enteredAtLabel: string | null;
	completedAtLabel: string | null;
	isCurrent: boolean;
}

export interface WorkflowProgressViewLabels {
	members: string;
	noMembers: string;
	enteredAt: string;
	completedAt: string;
	starter: string;
}

export interface WorkflowProgressViewProps {
	labels: WorkflowProgressViewLabels;
	workflowName: string;
	workflowStatusLabel: string;
	workflowStatusClassName: string;
	/** Host revoke Button (optional). */
	revokeButton: ReactNode;
	/** Host terminate Button (optional). */
	terminateButton: ReactNode;
	stages: readonly WorkflowStageViewItem[];
	expandedStage: number | null;
	onToggleStage: (index: number) => void;
	starterName: string;
	createdAtLabel: string;
}

/**
 * Workflow progress strip + expandable stage detail.
 */
export function WorkflowProgressView({
	labels,
	workflowName,
	workflowStatusLabel,
	workflowStatusClassName,
	revokeButton,
	terminateButton,
	stages,
	expandedStage,
	onToggleStage,
	starterName,
	createdAtLabel,
}: WorkflowProgressViewProps): JSX.Element {
	const expanded = expandedStage !== null ? stages[expandedStage] : null;

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2.5">
					<div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/60">
						<span className="icon-[mdi--sitemap-outline] h-3.5 w-3.5 text-muted-foreground" />
					</div>
					<h2 className="text-[13px] font-semibold text-foreground">{workflowName}</h2>
					<span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${workflowStatusClassName}`}>
						{workflowStatusLabel}
					</span>
				</div>
				<div className="flex items-center gap-1.5">
					{revokeButton}
					{terminateButton}
				</div>
			</div>

			<div className="rounded-xl border border-border/30 bg-muted/10 p-4">
				<div className="flex items-center gap-1">
					{stages.map((stage, i) => (
						<div key={i} className="flex flex-1 items-center gap-1">
							<button
								type="button"
								onClick={() => onToggleStage(i)}
								className={`flex-1 rounded-md px-2 py-1.5 text-center transition-all ${stage.statusBg} ${
									stage.isCurrent ? "ring-1 ring-blue-400/50" : ""
								}`}
								title={`${stage.name} - ${stage.statusLabel}`}
							>
								<div className={`truncate text-[11px] font-medium ${stage.statusText}`}>{stage.name}</div>
							</button>
							{i < stages.length - 1 && (
								<span className="icon-[mdi--chevron-right] shrink-0 text-xs text-muted-foreground/30" />
							)}
						</div>
					))}
				</div>

				{expanded && (
					<div className="mt-3 rounded-lg border border-border/20 bg-background/50 p-3">
						<div className="mb-2 flex items-center justify-between">
							<span className="text-[12px] font-medium text-foreground">{expanded.name}</span>
							<span
								className={`rounded px-1.5 py-px text-[10px] ${expanded.statusBg} ${expanded.statusText}`}
							>
								{expanded.statusLabel}
							</span>
						</div>
						{expanded.description && (
							<p className="mb-2 text-[11px] text-muted-foreground/70">{expanded.description}</p>
						)}
						<div className="flex flex-wrap gap-1">
							<span className="text-[10px] text-muted-foreground/50">{labels.members}:</span>
							{expanded.memberIds.length > 0 ? (
								expanded.memberIds.map((id) => (
									<span
										key={id}
										className="rounded bg-accent/50 px-1.5 py-px text-[10px] text-muted-foreground"
									>
										ID:{id}
									</span>
								))
							) : (
								<span className="text-[10px] text-muted-foreground/40">{labels.noMembers}</span>
							)}
						</div>
						{expanded.enteredAtLabel && (
							<div className="mt-1.5 text-[10px] text-muted-foreground/40">
								{labels.enteredAt}: {expanded.enteredAtLabel}
							</div>
						)}
						{expanded.completedAtLabel && (
							<div className="text-[10px] text-muted-foreground/40">
								{labels.completedAt}: {expanded.completedAtLabel}
							</div>
						)}
					</div>
				)}
			</div>

			<div className="flex items-center gap-2 text-[11px] text-muted-foreground/50">
				<span className="icon-[mdi--account-outline] text-xs" />
				<span>
					{labels.starter}: {starterName}
				</span>
				<span>|</span>
				<span>{createdAtLabel}</span>
			</div>
		</div>
	);
}
