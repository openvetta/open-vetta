import type { JSX, ReactNode } from "react";

export interface CompactionBoundaryViewProps {
	label: string;
}

export function CompactionBoundaryView({ label }: CompactionBoundaryViewProps): JSX.Element {
	return (
		<div className="flex items-center gap-3 py-1">
			<div className="h-px flex-1 bg-muted-foreground/15" />
			<span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/40">
				<span className="icon-[mdi--compress] h-3 w-3" />
				{label}
			</span>
			<div className="h-px flex-1 bg-muted-foreground/15" />
		</div>
	);
}

export interface ModelSwitchBoundaryViewProps {
	prefix: string;
	label: string;
}

export function ModelSwitchBoundaryView({ prefix, label }: ModelSwitchBoundaryViewProps): JSX.Element {
	return (
		<div className="flex items-center gap-3 py-1">
			<div className="h-px flex-1 bg-muted-foreground/8" />
			<span className="flex items-center gap-1.5 text-[11px] text-primary/70">
				<span className="icon-[mdi--swap-horizontal] h-3 w-3" />
				{prefix}
				{label}
			</span>
			<div className="h-px flex-1 bg-muted-foreground/8" />
		</div>
	);
}

export interface MessageItemViewProps {
	children: ReactNode;
}

/** Thin slot wrapper for a single message row. */
export function MessageItemView({ children }: MessageItemViewProps): JSX.Element {
	return <>{children}</>;
}

export interface ExportMessageListViewProps {
	children: ReactNode;
	listRef?: React.Ref<HTMLDivElement>;
}

export function ExportMessageListView({ children, listRef }: ExportMessageListViewProps): JSX.Element {
	return (
		<div
			ref={listRef}
			className="chat-export-document mx-auto flex w-full max-w-3xl flex-col px-5 py-5"
		>
			{children}
		</div>
	);
}
