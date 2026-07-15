import { cn } from "@vetta/ui";
import { useRef, type JSX, type ReactNode } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import {
	VIRTUAL_SESSION_OVERSCAN,
	VIRTUAL_SESSION_ROW_HEIGHT,
} from "./types";
import { useActiveSessionAutoScroll } from "./useActiveSessionAutoScroll";

export interface DefaultSessionListViewItem {
	active?: boolean;
	key: string;
}

export interface DefaultSessionListViewLabels {
	collapse: string;
	expand: string;
	empty: string;
}

export interface DefaultSessionListViewProps<T extends DefaultSessionListViewItem> {
	className?: string;
	hasMore: boolean;
	labels: DefaultSessionListViewLabels;
	onToggleShowAll: () => void;
	renderSession: (session: T) => ReactNode;
	scrollParent: HTMLElement | null;
	sessions: readonly T[];
	/** Full sorted list length for empty check; visible list may be sliced. */
	showAll: boolean;
	totalCount: number;
	visibleSessions: readonly T[];
}

export function DefaultSessionListView<T extends DefaultSessionListViewItem>({
	className,
	hasMore,
	labels,
	onToggleShowAll,
	renderSession,
	scrollParent,
	sessions,
	showAll,
	totalCount,
	visibleSessions,
}: DefaultSessionListViewProps<T>): JSX.Element {
	const virtuosoRef = useRef<VirtuosoHandle>(null);
	const activeIndex = sessions.findIndex((session) => session.active);
	const activeKey = activeIndex >= 0 ? sessions[activeIndex]?.key : undefined;
	useActiveSessionAutoScroll({ activeIndex, activeKey, scrollParent, virtuosoRef });

	if (totalCount === 0) {
		return (
			<p className={cn("px-2.5 py-1.5 text-[11px] text-muted-foreground/60", className)}>
				{labels.empty}
			</p>
		);
	}

	const useVirtual = showAll && scrollParent != null;

	return (
		<div className={cn("flex flex-col", className)}>
			{useVirtual ? (
				<Virtuoso
					ref={virtuosoRef}
					customScrollParent={scrollParent}
					data={sessions as T[]}
					defaultItemHeight={VIRTUAL_SESSION_ROW_HEIGHT}
					overscan={VIRTUAL_SESSION_OVERSCAN}
					itemContent={(_, session) => (
						<div className="pb-px">{renderSession(session)}</div>
					)}
				/>
			) : (
				<div className="space-y-px">{visibleSessions.map(renderSession)}</div>
			)}
			{hasMore && (
				<button
					type="button"
					onClick={onToggleShowAll}
					className="flex w-full items-center gap-1 rounded-md px-2.5 py-[6px] text-left text-[12px] text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
				>
					<span
						className={cn(
							showAll ? "icon-[solar--alt-arrow-up-linear]" : "icon-[solar--alt-arrow-down-linear]",
							"h-3.5 w-3.5 shrink-0",
						)}
					/>
					{showAll ? labels.collapse : labels.expand}
				</button>
			)}
		</div>
	);
}
