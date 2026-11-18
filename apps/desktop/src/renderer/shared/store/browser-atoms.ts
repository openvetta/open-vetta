import { atom } from "jotai";
import {
	activityPanelOpenAtom,
	activityPanelTabByProjectAtom,
	hiddenActivityTabsAtom,
	setActivityPanelWidthAtom,
} from "./activity-atoms";
import { activeSessionAtom } from "./chat-atoms";

const BROWSER_TAB_KEY = "browser";

/**
 * 工作空间级内置浏览器：每个 workspace.id 当前预览的 URL。
 * 仅内存存活——切走再切回同一工作空间仍在（webview 跨活动 tab 保活），App 重启清空。
 */
export const browserUrlByWorkspaceAtom = atom<Map<string, string>>(new Map<string, string>());

/** @deprecated Use browserUrlByWorkspaceAtom. */
export const browserUrlBySessionAtom = browserUrlByWorkspaceAtom;

export function getBrowserUrlForWorkspace(map: Map<string, string>, workspaceId: string | null): string | null {
	return workspaceId ? (map.get(workspaceId) ?? null) : null;
}

/** @deprecated Use getBrowserUrlForWorkspace. */
export const getBrowserUrlForSession = getBrowserUrlForWorkspace;

/** 在显式工作空间打开 URL：写入预览地址 + 展开面板 + 切到浏览器 tab。 */
export const openUrlInActivityWorkspaceAtom = atom(null, (get, set, input: { workspaceId: string; url: string }) => {
	set(browserUrlByWorkspaceAtom, (prev) => {
		const next = new Map(prev);
		next.set(input.workspaceId, input.url);
		return next;
	});
	set(activityPanelOpenAtom, true);
	// 从消息链接展开浏览器时默认拉到最大宽度，给预览页面足够空间。
	set(setActivityPanelWidthAtom, "max");
	// 用户把浏览器页签关进「+」之后，链接/端口预览仍要能把它带回来：
	// 否则这里把激活 tab 设成 browser，面板打开了却看不到这个 tab。
	const hiddenMap = get(hiddenActivityTabsAtom);
	const hidden = hiddenMap.get(input.workspaceId);
	if (hidden?.includes(BROWSER_TAB_KEY)) {
		const next = new Map(hiddenMap);
		next.set(
			input.workspaceId,
			hidden.filter((key) => key !== BROWSER_TAB_KEY),
		);
		set(hiddenActivityTabsAtom, next);
	}
	set(activityPanelTabByProjectAtom, (prev) => new Map(prev).set(input.workspaceId, BROWSER_TAB_KEY));
});

/** Ordinary-conversation adapter retained for callers that intentionally use activeSessionAtom. */
export const openUrlInBrowserAtom = atom(null, (get, set, url: string) => {
	const session = get(activeSessionAtom);
	if (!session) return;
	set(openUrlInActivityWorkspaceAtom, { workspaceId: session.cwd, url });
});

/** 回写某工作空间浏览器实际导航到的 URL（webview 内部跳转后同步，用于地址栏与工作空间记忆）。 */
export const setBrowserUrlForWorkspaceAtom = atom(null, (_get, set, payload: { workspaceId: string; url: string }) => {
	set(browserUrlByWorkspaceAtom, (prev) => {
		const next = new Map(prev);
		next.set(payload.workspaceId, payload.url);
		return next;
	});
});

/** @deprecated Use setBrowserUrlForWorkspaceAtom. */
export const setBrowserUrlForSessionAtom = atom(null, (_get, set, payload: { sessionPath: string; url: string }) => {
	set(setBrowserUrlForWorkspaceAtom, { workspaceId: payload.sessionPath, url: payload.url });
});
