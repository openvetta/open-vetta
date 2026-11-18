import { useRef, type JSX, type ReactNode } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { ShowMoreSessionsButton } from "../sidebar/ShowMoreSessionsButton";
import { VIRTUAL_SESSION_OVERSCAN, VIRTUAL_SESSION_ROW_HEIGHT } from "./types";
import { useActiveSessionAutoScroll } from "./useActiveSessionAutoScroll";

export interface ProjectSessionsViewItem {
	active?: boolean;
	key: string;
}

export interface ProjectSessionsViewLabels {
	collapse: string;
	expand: string;
}

export interface ProjectSessionsViewProps<T extends ProjectSessionsViewItem> {
	empty: ReactNode;
	expanded: boolean;
	hasMore: boolean;
	loading?: boolean;
	labels: ProjectSessionsViewLabels;
	onToggleShowAll: () => void;
	/** Scroll parent for Virtuoso when showAll. */
	scrollParent: HTMLElement | null;
	sessions: readonly T[];
	showAll: boolean;
	renderSession: (session: T) => ReactNode;
}

export function ProjectSessionsView<T extends ProjectSessionsViewItem>({
	empty,
	expanded,
	hasMore,
	loading = false,
	labels,
	onToggleShowAll,
	scrollParent,
	sessions,
	showAll,
	renderSession,
}: ProjectSessionsViewProps<T>): JSX.Element {
	const useVirtual = showAll && sessions.length > 0 && scrollParent != null;
	const virtuosoRef = useRef<VirtuosoHandle>(null);
	const showSessions = expanded && !loading;
	const activeIndex = showSessions ? sessions.findIndex((session) => session.active) : -1;
	const activeKey = activeIndex >= 0 ? sessions[activeIndex]?.key : undefined;
	useActiveSessionAutoScroll({ activeIndex, activeKey, enabled: showSessions, scrollParent, virtuosoRef });

	// Commit space in the shared scroller immediately. Only the list surface animates.
	return (
		<div className="overflow-clip" hidden={!showSessions}>
			{showSessions && (
				<div className="mt-px space-y-px animate-in fade-in slide-in-from-top-1 duration-150 ease-out motion-reduce:animate-none">
					{sessions.length === 0 ? (
						empty
					) : useVirtual ? (
						<Virtuoso
							ref={virtuosoRef}
							customScrollParent={scrollParent}
							data={sessions as T[]}
							defaultItemHeight={VIRTUAL_SESSION_ROW_HEIGHT}
							overscan={VIRTUAL_SESSION_OVERSCAN}
							itemContent={(_, session) => <div className="pb-px">{renderSession(session)}</div>}
						/>
					) : (
						sessions.map((session) => renderSession(session))
					)}
					{hasMore && <ShowMoreSessionsButton labels={labels} onClick={onToggleShowAll} showAll={showAll} />}
				</div>
			)}
		</div>
	);
}
