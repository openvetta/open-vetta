import type { JSX, ReactNode } from "react";

export interface ProjectsPanelEmptyStateLabels {
	description: string;
	newConversation: string;
	title: string;
}

export interface ProjectsPanelEmptyStateProps {
	labels: ProjectsPanelEmptyStateLabels;
	onNewConversation: () => void;
	/** Secondary action slot, e.g. the add-project menu. */
	projectAction: ReactNode;
}

export function ProjectsPanelEmptyState({
	labels,
	onNewConversation,
	projectAction,
}: ProjectsPanelEmptyStateProps): JSX.Element {
	return (
		<div className="px-1 py-2">
			<div className="flex flex-col gap-3 rounded-2xl bg-card p-3.5">
				<div className="flex flex-col gap-1">
					<p className="text-[14px] font-semibold text-foreground">{labels.title}</p>
					<p className="text-[12px] leading-relaxed text-muted-foreground">{labels.description}</p>
				</div>
				<div className="flex flex-col gap-2">
					<button
						type="button"
						onClick={onNewConversation}
						className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors bg-primary text-primary-foreground hover:opacity-90"
					>
						<span className="icon-[solar--chat-round-line-linear] h-4 w-4 shrink-0" />
						{labels.newConversation}
					</button>
					{projectAction}
				</div>
			</div>
		</div>
	);
}
