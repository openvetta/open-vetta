import { atom } from "jotai";
import { atomWithStorage, createJSONStorage } from "jotai/utils";

/**
 * 用户最近打开过的会话（越新越靠前），供命令面板按 Raycast 的习惯把打开过的会话排在上面：
 * 空查询时列成「最近打开」，有查询词时打开过的会话排在没打开过的前面。
 *
 * 只是本机的排序偏好，丢了也不影响任何数据，所以放 localStorage；读到的内容做结构校验，
 * 被手改坏了就当作空列表。
 */
export interface RecentSessionVisit {
	readonly path: string;
	readonly openedAt: number;
}

export const RECENT_SESSIONS_LIMIT = 30;

const storage = createJSONStorage<readonly RecentSessionVisit[]>();

function isVisit(value: unknown): value is RecentSessionVisit {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof Reflect.get(value, "path") === "string" &&
		typeof Reflect.get(value, "openedAt") === "number"
	);
}

export const recentSessionVisitsAtom = atomWithStorage<readonly RecentSessionVisit[]>(
	"vetta-recent-session-visits",
	[],
	{
		...storage,
		getItem(key, initialValue) {
			const value: unknown = storage.getItem(key, initialValue);
			return Array.isArray(value) ? value.filter(isVisit).slice(0, RECENT_SESSIONS_LIMIT) : initialValue;
		},
	},
	{ getOnInit: true },
);

/** 记一次打开：同一会话只保留最新一次，整体按时间倒序，最多 RECENT_SESSIONS_LIMIT 条。 */
export function withRecentSessionVisit(
	visits: readonly RecentSessionVisit[],
	path: string,
	openedAt: number,
): readonly RecentSessionVisit[] {
	if (visits[0]?.path === path) return visits;
	return [{ path, openedAt }, ...visits.filter((visit) => visit.path !== path)].slice(0, RECENT_SESSIONS_LIMIT);
}

export const recordRecentSessionVisitAtom = atom(null, (get, set, path: string) => {
	const current = get(recentSessionVisitsAtom);
	const next = withRecentSessionVisit(current, path, Date.now());
	if (next !== current) set(recentSessionVisitsAtom, next);
});
