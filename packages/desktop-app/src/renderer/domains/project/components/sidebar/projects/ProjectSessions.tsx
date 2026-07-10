import { AnimatePresence, motion } from "motion/react";
import { Virtuoso } from "react-virtuoso";
import type { SessionInfo } from "@shared/store/atoms";
import {
	VIRTUAL_SESSION_OVERSCAN,
	VIRTUAL_SESSION_ROW_HEIGHT,
} from "./projectGroupConstants";
import { ShowMoreSessionsButton } from "./ShowMoreSessionsButton";

interface ProjectSessionsProps {
	children: (session: SessionInfo) => JSX.Element;
	expanded: boolean;
	hasMore: boolean;
	hiddenCount: number;
	onToggleShowAll: () => void;
	renderEmpty: () => JSX.Element;
	/** 所属滚动区 DOM；展开全部时 Virtuoso 挂到此 scroll parent，避免内层再开 scroller。 */
	scrollParent: HTMLElement | null;
	sessions: SessionInfo[];
	showAll: boolean;
}

export function ProjectSessions({
	children,
	expanded,
	hasMore,
	hiddenCount,
	onToggleShowAll,
	renderEmpty,
	scrollParent,
	sessions,
	showAll,
}: ProjectSessionsProps): JSX.Element {
	const useVirtual = showAll && sessions.length > 0 && scrollParent != null;

	return (
		<AnimatePresence initial={false}>
			{expanded && (
				<motion.div
					key="sessions"
					initial={{ height: 0, opacity: 0 }}
					animate={{ height: "auto", opacity: 1 }}
					exit={{ height: 0, opacity: 0 }}
					transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
					style={{ overflow: "hidden" }}
				>
					<div className="mt-px space-y-px">
						{sessions.length === 0 ? (
							renderEmpty()
						) : useVirtual ? (
							<Virtuoso
								customScrollParent={scrollParent}
								data={sessions}
								defaultItemHeight={VIRTUAL_SESSION_ROW_HEIGHT}
								overscan={VIRTUAL_SESSION_OVERSCAN}
								itemContent={(_, session) => (
									<div className="pb-px">{children(session)}</div>
								)}
							/>
						) : (
							sessions.map(children)
						)}
						{hasMore && (
							<ShowMoreSessionsButton
								hiddenCount={hiddenCount}
								onClick={onToggleShowAll}
								showAll={showAll}
							/>
						)}
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
