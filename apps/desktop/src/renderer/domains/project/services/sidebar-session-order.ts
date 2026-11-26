import type { PinnedSessionPaths, SessionInfo, SidebarSessionSort } from "@shared/store/atoms";

export interface SidebarSessionOrder {
	sort: SidebarSessionSort;
	/** 运行中或等用户处理的会话；按回复时间排序时排在其余未置顶会话之前。 */
	activePaths: ReadonlySet<string>;
}

export const DEFAULT_SIDEBAR_SESSION_ORDER: SidebarSessionOrder = { sort: "updated", activePaths: new Set() };

export interface SidebarSessionOrdering<T extends SessionInfo = SessionInfo> {
	all: T[];
	hasMore: boolean;
	hiddenCount: number;
	visible: T[];
}

export function orderSidebarSessions<T extends SessionInfo>(
	sessions: readonly T[],
	pinnedPaths: PinnedSessionPaths,
	order: SidebarSessionOrder = DEFAULT_SIDEBAR_SESSION_ORDER,
): T[] {
	return [...sessions].sort((left, right) => {
		const leftPinnedAt = pinnedPaths.get(left.path);
		const rightPinnedAt = pinnedPaths.get(right.path);
		if (leftPinnedAt !== undefined || rightPinnedAt !== undefined) {
			if (leftPinnedAt === undefined) return 1;
			if (rightPinnedAt === undefined) return -1;
			if (leftPinnedAt !== rightPinnedAt) return rightPinnedAt - leftPinnedAt;
		}
		if (order.sort === "created") return createdTime(right) - createdTime(left);
		const leftActive = order.activePaths.has(left.path);
		if (leftActive !== order.activePaths.has(right.path)) return leftActive ? -1 : 1;
		return right.modifiedAt - left.modifiedAt;
	});
}

export function buildSidebarSessionOrdering<T extends SessionInfo>(
	sessions: readonly T[],
	pinnedPaths: PinnedSessionPaths,
	defaultVisibleCount: number,
	showAll: boolean,
	order: SidebarSessionOrder = DEFAULT_SIDEBAR_SESSION_ORDER,
): SidebarSessionOrdering<T> {
	const all = orderSidebarSessions(sessions, pinnedPaths, order);
	const pinnedCount = all.findIndex((session) => !pinnedPaths.has(session.path));
	const minimumVisible = pinnedCount === -1 ? all.length : pinnedCount;
	const collapsedCount = Math.max(defaultVisibleCount, minimumVisible);
	const visible = showAll ? all : all.slice(0, collapsedCount);
	return {
		all,
		hasMore: all.length > collapsedCount,
		hiddenCount: Math.max(0, all.length - visible.length),
		visible,
	};
}

/** 宿主乐观插入的条目、Agent Team 会话和头部损坏的历史文件没有创建时间，按最后活动时间近似。 */
function createdTime(session: SessionInfo): number {
	return session.createdAt ?? session.modifiedAt;
}
