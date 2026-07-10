import { useAtom, useAtomValue } from "jotai";
import { memo, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Virtuoso } from "react-virtuoso";
import type { DefaultConversationFilter, SessionInfo } from "@shared/store/atoms";
import {
	renamingSessionPathAtom,
	runningSessionPathsAtom,
	scheduledSessionPathsAtom,
	sessionContextMenuAtom,
} from "@shared/store/atoms";
import { cn } from "@shared/lib/utils";
import {
	VIRTUAL_SESSION_OVERSCAN,
	VIRTUAL_SESSION_ROW_HEIGHT,
} from "../projectGroupConstants";
import { DefaultSessionRow } from "./DefaultSessionRow";

interface DefaultSessionListProps {
	activeSessionPath: string;
	className?: string;
	cwd: string;
	filter: DefaultConversationFilter;
	onRenameSession: (cwd: string, sessionPath: string, name: string) => void;
	onSelectSession: (cwd: string, sessionPath: string) => void;
	/** 默认对话区滚动容器；展开全部时 Virtuoso 挂到此 scroll parent。 */
	scrollParent: HTMLElement | null;
	sessions: SessionInfo[];
}

const DEFAULT_VISIBLE_DEFAULT_SESSIONS = 5;

export const DefaultSessionList = memo(function DefaultSessionList({
	activeSessionPath,
	className,
	cwd,
	filter,
	onRenameSession,
	onSelectSession,
	scrollParent,
	sessions,
}: DefaultSessionListProps): JSX.Element {
	const { t } = useTranslation("project");
	const sorted = useMemo(
		() => [...sessions].sort((a, b) => b.modifiedAt - a.modifiedAt),
		[sessions],
	);
	const [, setContextMenu] = useAtom(sessionContextMenuAtom);
	const [renamingSessionPath, setRenamingSessionPath] = useAtom(renamingSessionPathAtom);
	const runningSessionPaths = useAtomValue(runningSessionPathsAtom);
	const scheduledSessionPaths = useAtomValue(scheduledSessionPathsAtom);
	const scheduledBasenames = useMemo(() => {
		const basenames = new Set<string>();
		for (const path of scheduledSessionPaths) basenames.add(path.slice(path.lastIndexOf("/") + 1));
		return basenames;
	}, [scheduledSessionPaths]);
	const [showAll, setShowAll] = useState(false);

	useEffect(() => {
		setShowAll(false);
	}, [filter]);

	if (sorted.length === 0) {
		return (
			<p className={cn("px-2.5 py-1.5 text-[11px] text-muted-foreground/60", className)}>
				{t("sidebar.defaultConversation.noConversations")}
			</p>
		);
	}

	const hasMore = sorted.length > DEFAULT_VISIBLE_DEFAULT_SESSIONS;
	const visible = showAll
		? sorted
		: sorted.slice(0, DEFAULT_VISIBLE_DEFAULT_SESSIONS);
	const hiddenCount = sorted.length - DEFAULT_VISIBLE_DEFAULT_SESSIONS;
	const useVirtual = showAll && scrollParent != null;

	const renderSession = (session: SessionInfo): JSX.Element => {
		const isActive = activeSessionPath === session.path;
		const isRenaming = renamingSessionPath === session.path;
		const isRunning = runningSessionPaths.has(session.path);
		const isSchedule =
			scheduledSessionPaths.has(session.path) ||
			scheduledBasenames.has(session.path.slice(session.path.lastIndexOf("/") + 1));
		return (
			<DefaultSessionRow
				active={isActive}
				filter={filter}
				key={session.path}
				onOpenContextMenu={(event, menuSession) =>
					setContextMenu({ x: event.clientX, y: event.clientY, session: menuSession })}
				onRename={(name) => onRenameSession(cwd, session.path, name)}
				onRenameDone={() => setRenamingSessionPath(null)}
				onSelect={() => onSelectSession(cwd, session.path)}
				renaming={isRenaming}
				running={isRunning}
				scheduled={isSchedule}
				session={session}
			/>
		);
	};

	return (
		<div className={cn("flex flex-col", className)}>
			{useVirtual ? (
				<Virtuoso
					customScrollParent={scrollParent}
					data={sorted}
					defaultItemHeight={VIRTUAL_SESSION_ROW_HEIGHT}
					overscan={VIRTUAL_SESSION_OVERSCAN}
					itemContent={(_, session) => (
						<div className="pb-px">{renderSession(session)}</div>
					)}
				/>
			) : (
				<div className="space-y-px">{visible.map(renderSession)}</div>
			)}
			{hasMore && (
				<button
					type="button"
					onClick={() => setShowAll((value) => !value)}
					className="flex w-full items-center gap-1 rounded-md px-2.5 py-[6px] text-left text-[12px] text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
				>
					<span
						className={cn(
							showAll ? "icon-[solar--alt-arrow-up-linear]" : "icon-[solar--alt-arrow-down-linear]",
							"h-3.5 w-3.5 shrink-0",
						)}
					/>
					{showAll
						? t("sidebar.projects.collapseSessions")
						: t("sidebar.projects.expandMore", { count: hiddenCount })}
				</button>
			)}
		</div>
	);
});
