import type { DefaultConversationFilter, SessionInfo } from "@shared/store/atoms";
import {
	renamingSessionPathAtom,
	runningSessionPathsAtom,
	scheduledSessionPathsAtom,
	sessionContextMenuAtom,
	sessionDisplayLabel,
} from "@shared/store/atoms";
import { useAtom, useAtomValue } from "jotai";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { relativeTime } from "../components/sidebar/projects/relativeTime";

const DEFAULT_VISIBLE_DEFAULT_SESSIONS = 5;

export interface DefaultSessionListItemView {
	key: string;
	path: string;
	label: string;
	timeLabel: string;
	active: boolean;
	renaming: boolean;
	running: boolean;
	scheduled: boolean;
	session: SessionInfo;
}

interface UseDefaultSessionListModelArgs {
	activeSessionPath: string;
	cwd: string;
	filter: DefaultConversationFilter;
	onRenameSession: (cwd: string, sessionPath: string, name: string) => void;
	onSelectSession: (cwd: string, sessionPath: string) => void;
	sessions: SessionInfo[];
}

export function useDefaultSessionListModel({
	activeSessionPath,
	cwd,
	filter,
	onRenameSession,
	onSelectSession,
	sessions,
}: UseDefaultSessionListModelArgs) {
	const { t } = useTranslation("project");
	const sorted = useMemo(() => [...sessions].sort((a, b) => b.modifiedAt - a.modifiedAt), [sessions]);
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
	const [prevFilter, setPrevFilter] = useState(filter);
	if (prevFilter !== filter) {
		setPrevFilter(filter);
		setShowAll(false);
	}

	const hasMore = sorted.length > DEFAULT_VISIBLE_DEFAULT_SESSIONS;
	const hiddenCount = sorted.length - DEFAULT_VISIBLE_DEFAULT_SESSIONS;

	const allViews: DefaultSessionListItemView[] = useMemo(
		() =>
			sorted.map((session) => {
				const isActive = activeSessionPath === session.path;
				const isRenaming = renamingSessionPath === session.path;
				const isRunning = runningSessionPaths.has(session.path);
				const isSchedule =
					scheduledSessionPaths.has(session.path) ||
					scheduledBasenames.has(session.path.slice(session.path.lastIndexOf("/") + 1));
				return {
					key: session.path,
					path: session.path,
					label: sessionDisplayLabel(session),
					timeLabel: relativeTime(session.modifiedAt),
					active: isActive,
					renaming: isRenaming,
					running: isRunning,
					scheduled: isSchedule,
					session,
				};
			}),
		[activeSessionPath, renamingSessionPath, runningSessionPaths, scheduledBasenames, scheduledSessionPaths, sorted],
	);

	const visibleViews = showAll ? allViews : allViews.slice(0, DEFAULT_VISIBLE_DEFAULT_SESSIONS);

	return {
		contextMenuEnabled: filter !== "claw",
		hasMore,
		labels: {
			collapse: t("sidebar.projects.collapseSessions"),
			expand: t("sidebar.projects.expandMore", { count: hiddenCount }),
			empty: t("sidebar.defaultConversation.noConversations"),
		},
		sessions: allViews,
		showAll,
		totalCount: sorted.length,
		visibleSessions: visibleViews,
		actions: {
			openContextMenu: (event: React.MouseEvent, session: SessionInfo) => {
				setContextMenu({ x: event.clientX, y: event.clientY, session });
			},
			rename: (sessionPath: string, name: string) => onRenameSession(cwd, sessionPath, name),
			renameDone: () => setRenamingSessionPath(null),
			select: (sessionPath: string) => onSelectSession(cwd, sessionPath),
			toggleShowAll: () => setShowAll((value) => !value),
		},
	};
}
