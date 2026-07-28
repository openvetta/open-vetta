import type { JSX, ReactNode } from "react";

export interface FlowingPendingItemView {
	id: number;
	senderName: string;
	projectName: string;
	message: string;
	fileCount: number;
	timeAgo: string;
	createdAtTitle: string;
	/** Host reject Button. */
	rejectButton: ReactNode;
	/** Host accept Button. */
	acceptButton: ReactNode;
}

export interface FlowingPanelViewLabels {
	empty: string;
}

export interface FlowingPanelViewProps {
	labels: FlowingPanelViewLabels;
	items: readonly FlowingPendingItemView[];
}

/**
 * Pending flowing transfers list. Host injects accept/reject Buttons.
 */
export function FlowingPanelView({ labels, items }: FlowingPanelViewProps): JSX.Element {
	if (items.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
				<div className="flex size-10 items-center justify-center rounded-full bg-muted/50">
					<span className="icon-[mdi--inbox-outline] text-xl text-muted-foreground/40" />
				</div>
				<p className="text-xs text-muted-foreground/50">{labels.empty}</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-2 p-2">
			{items.map((t) => (
				<div
					key={t.id}
					className="group rounded-lg border border-border/50 bg-card p-3 text-xs transition-colors hover:border-border"
				>
					<div className="flex items-center gap-2">
						<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[0.6rem] font-medium text-primary">
							{t.senderName.charAt(0).toUpperCase()}
						</span>
						<div className="min-w-0 flex-1">
							<span className="font-medium">{t.senderName}</span>
							<span className="mx-1 text-muted-foreground/60">→</span>
							<span className="font-medium text-primary">{t.projectName}</span>
						</div>
						<span className="shrink-0 text-[0.65rem] text-muted-foreground/50" title={t.createdAtTitle}>
							{t.timeAgo}
						</span>
					</div>

					{t.message && (
						<div className="mt-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-muted-foreground">{t.message}</div>
					)}

					<div className="mt-2 flex items-center gap-1 text-muted-foreground/60">
						<span className="icon-[mdi--file-document-outline] text-xs" />
						{t.fileCount} 个文件
					</div>

					<div className="mt-2.5 flex gap-2">
						{t.rejectButton}
						{t.acceptButton}
					</div>
				</div>
			))}
		</div>
	);
}
