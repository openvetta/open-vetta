import type { JSX, ReactNode } from "react";

export interface FlowingWorkflowViewLabels {
	title: string;
	errorFallback: string;
	empty: string;
}

export interface FlowingWorkflowViewProps {
	labels: FlowingWorkflowViewLabels;
	loading: boolean;
	error: string | null;
	empty: boolean;
	/** Host FlowGraph when history present. */
	graph: ReactNode;
}

/**
 * Flowing history section shell. Host injects FlowGraph.
 */
export function FlowingWorkflowView({
	labels,
	loading,
	error,
	empty,
	graph,
}: FlowingWorkflowViewProps): JSX.Element {
	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center gap-2.5">
				<div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/60">
					<span className="icon-[mdi--transit-connection-variant] h-3.5 w-3.5 text-muted-foreground" />
				</div>
				<h2 className="text-[13px] font-semibold text-foreground">{labels.title}</h2>
			</div>

			{loading ? (
				<div className="flex h-[280px] items-center justify-center rounded-xl border border-border/30 bg-muted/10">
					<span className="icon-[mdi--loading] h-5 w-5 animate-spin text-muted-foreground/50" />
				</div>
			) : error ? (
				<div className="flex h-[280px] items-center justify-center rounded-xl border border-border/30 bg-muted/10">
					<span className="text-[12px] text-muted-foreground/50">{error}</span>
				</div>
			) : empty ? (
				<div className="flex h-[280px] items-center justify-center rounded-xl border border-border/30 bg-muted/10">
					<span className="text-[12px] text-muted-foreground/50">{labels.empty}</span>
				</div>
			) : (
				<div className="h-[280px]">{graph}</div>
			)}
		</div>
	);
}
