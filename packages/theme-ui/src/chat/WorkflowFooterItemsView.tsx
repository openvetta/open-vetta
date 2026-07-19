import type { JSX } from "react";

export interface WorkflowFooterItem {
	id: string;
	name: string;
	/** e.g. "1/4"; empty string when the workflow has no todos yet. */
	progressLabel: string;
	statusLabel: string;
	statusIcon: string;
	statusClassName: string;
	/** Queued / pending / running — shows the stop affordance. */
	active: boolean;
}

export interface WorkflowFooterItemsViewProps {
	items: WorkflowFooterItem[];
	stopLabel: string;
	onOpen: (id: string) => void;
	onStop: (id: string) => void;
}

/**
 * Workflow summary items rendered in the MessageList footer (ADR-0044).
 * Click opens the workflow activity tab; stop interrupts the child.
 */
export function WorkflowFooterItemsView({
	items,
	stopLabel,
	onOpen,
	onStop,
}: WorkflowFooterItemsViewProps): JSX.Element | null {
	if (items.length === 0) return null;
	return (
		<div className="flex flex-col gap-1.5">
			{items.map((item) => (
				<div
					key={item.id}
					className="group flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 transition-colors hover:bg-muted/60"
				>
					<button
						type="button"
						onClick={() => onOpen(item.id)}
						className="flex min-w-0 flex-1 items-center gap-2 text-left"
					>
						<span className={`${item.statusIcon} shrink-0 text-[14px] ${item.statusClassName}`} />
						<span className="truncate text-[12px] font-medium text-foreground">{item.name}</span>
						{item.progressLabel && (
							<span className="shrink-0 rounded bg-muted px-1.5 py-[1px] font-mono text-[10px] text-muted-foreground">
								{item.progressLabel}
							</span>
						)}
						<span className={`shrink-0 text-[11px] ${item.statusClassName}`}>{item.statusLabel}</span>
					</button>
					{item.active && (
						<button
							type="button"
							title={stopLabel}
							aria-label={stopLabel}
							onClick={() => onStop(item.id)}
							className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
						>
							<span className="icon-[mdi--stop-circle-outline] text-[14px]" />
						</button>
					)}
				</div>
			))}
		</div>
	);
}
