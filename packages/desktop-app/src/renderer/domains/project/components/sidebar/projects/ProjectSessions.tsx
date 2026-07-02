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
	sessions: SessionInfo[];
	showAll: boolean;
	virtualHeight: number;
}

export function ProjectSessions({
	children,
	expanded,
	hasMore,
	hiddenCount,
	onToggleShowAll,
	renderEmpty,
	sessions,
	showAll,
	virtualHeight,
}: ProjectSessionsProps): JSX.Element {
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
						) : showAll ? (
							<Virtuoso
								data={sessions}
								style={{ height: virtualHeight, overflowX: "hidden" }}
								overscan={VIRTUAL_SESSION_OVERSCAN}
								defaultItemHeight={VIRTUAL_SESSION_ROW_HEIGHT}
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
