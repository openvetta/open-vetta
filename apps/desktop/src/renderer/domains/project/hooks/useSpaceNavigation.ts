import { bumpOpenSessionToken } from "@domains/conversation/services/chat-service";
import { waitForCommittedPaint } from "@shared/lib/committed-paint";
import {
	perfSessionSwitchBegin,
	perfSessionSwitchComplete,
	perfSessionSwitchMark,
} from "@shared/lib/perf-session-switch";
import {
	activeSessionAtom,
	conversationBucketCwd,
	defaultConversationCwdAtom,
	openSessionFnRef,
	pendingSessionCreationAtom,
	pendingSessionOpenAtom,
	projectsAtom,
	projectsInitializedAtom,
	type SessionInfo,
	sessionsMapAtom,
} from "@shared/store/atoms";
import type { SpaceItem, SpaceLocation } from "@shared/store/spaces";
import { assignSpace, MAIN_SPACE, selectSpace, spaceExists, spaceOf, spacesAtom } from "@shared/store/spaces";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useStore } from "jotai";
import { useCallback } from "react";
import { resolveDesktopSessionOpenTarget } from "@/shared/session-access";

type Store = ReturnType<typeof useStore>;
const pendingSpaceNavigation = new WeakMap<Store, object>();

function locationItem(location: SpaceLocation, defaultCwd: string): SpaceItem {
	if (location.kind === "team")
		return location.projectCwd
			? { kind: "project", key: location.projectCwd }
			: { kind: "conversation", key: location.sessionId };
	if (location.kind === "conversation" && conversationBucketCwd(location.cwd, defaultCwd) === defaultCwd) {
		return { kind: "conversation", key: location.path };
	}
	return { kind: "project", key: location.cwd };
}

export function rememberSpaceLocation(store: Store, location: SpaceLocation): void {
	const item = locationItem(location, store.get(defaultConversationCwdAtom));
	store.set(spacesAtom, (state) => {
		const id = spaceOf(state, item);
		if (JSON.stringify(state.locations[id]) === JSON.stringify(location)) return state;
		return { ...state, locations: { ...state.locations, [id]: location } };
	});
}

/**
 * 项目列表加载完成后内存里就有全部项目，先用它判定，省掉一次读配置的 IPC；
 * 未加载时返回 undefined，让调用方回退到 IPC。
 */
function knownProjectAvailability(store: Store, cwd: string): boolean | undefined {
	if (!store.get(projectsInitializedAtom)) return undefined;
	return store.get(projectsAtom).some((project) => project.cwd === cwd);
}

/**
 * 侧栏已经拉过这个 cwd 的会话时直接读缓存：命中就省一次目录扫描。返回 undefined 表示缓存里确实没有这条会话，
 * 返回 null 表示还得回退到 IPC（cwd 未加载，或乐观插入的条目还没解析 access）。
 */
function cachedSessionFor(
	cached: readonly SessionInfo[] | undefined,
	sessionPath: string,
): SessionInfo | undefined | null {
	if (!cached) return null;
	const session = cached.find((candidate) => candidate.path === sessionPath);
	if (!session) return undefined;
	return session.access ? session : null;
}

function isSpaceRoute(path: string): boolean {
	return (
		path === "/" ||
		(["/project/", "/viewer/", "/new-session", "/agent-teams/"].some((prefix) => path.startsWith(prefix)) &&
			(!path.startsWith("/agent-teams/") || path.includes("/sessions/")))
	);
}

function isLocationOpen(path: string, location: SpaceLocation, store: Store): boolean {
	if (path === "/")
		return location.kind === "conversation" && store.get(activeSessionAtom)?.sessionPath === location.path;
	if (location.kind === "team")
		return path.includes("/sessions/") && path.endsWith(`/${encodeURIComponent(location.sessionId)}`);
	if (location.kind === "project")
		return path.startsWith("/project/") && decodeRouteValue(path.slice(9)) === location.cwd;
	return path.startsWith("/viewer/") && decodeRouteValue(path.slice(8)) === location.path;
}

export function decodeRouteValue(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

export function moveSpaceItem(store: Store, pathname: string, item: SpaceItem, id: string): void {
	const defaultCwd = store.get(defaultConversationCwdAtom);
	store.set(spacesAtom, (state) => {
		const owner = spaceOf(state, item);
		const next = assignSpace(state, item, id);
		if (next === state) return state;
		const location = state.locations[owner];
		if (!location) return next;
		const locationOwner = locationItem(location, defaultCwd);
		if (locationOwner.kind !== item.kind || locationOwner.key !== item.key) return next;
		const locations = { ...state.locations };
		delete locations[owner];
		if (isLocationOpen(pathname, location, store)) {
			const target = spaceOf(next, item);
			locations[target] = location;
			return { ...selectSpace(next, target), locations };
		}
		return { ...next, locations };
	});
}

export function useSpaceNavigation() {
	const store = useStore();
	const navigate = useNavigate();
	const pathname = useLocation({ select: (location) => location.pathname });
	return useCallback(
		async (id: string, force = false): Promise<void> => {
			const state = store.get(spacesAtom);
			if (!spaceExists(state, id) || (!force && state.selected === id)) return;
			// 切换空间右侧内容不跟着换是用户最容易感知的卡顿，所以复用打开会话的诊断链路：
			// localStorage.setItem("vetta-perf-session-switch", "1") 后切换一次即可拿到长任务分布。
			const interactionId = perfSessionSwitchBegin("space-switch");
			store.set(spacesAtom, (current) => selectSpace(current, id));
			perfSessionSwitchMark("space-selected", interactionId);
			const intent = {};
			pendingSpaceNavigation.set(store, intent);
			const current = () => pendingSpaceNavigation.get(store) === intent && store.get(spacesAtom).selected === id;
			if (!force && !isSpaceRoute(pathname)) {
				perfSessionSwitchComplete("completed", interactionId);
				return;
			}
			// 切换空间时侧栏高亮和右侧内容如果在同一个同步任务里换，浏览器要等整段卸载/挂载
			// 跑完才画第一帧（实测 100–330ms，点击后像没反应）。先让带新高亮的一帧提交出去，
			// 再做读配置、读会话目录、打开会话这些重活。
			await waitForCommittedPaint();
			perfSessionSwitchMark("space-painted", interactionId);
			if (!current()) {
				perfSessionSwitchComplete("cancelled", interactionId);
				return;
			}
			if (store.get(pendingSessionOpenAtom)) bumpOpenSessionToken();
			const defaultCwd = store.get(defaultConversationCwdAtom);
			const location = state.locations[id];
			try {
				if (location && spaceOf(store.get(spacesAtom), locationItem(location, defaultCwd)) === id) {
					const item = locationItem(location, defaultCwd);
					const projectCwd = item.kind === "project" ? item.key : undefined;
					const available =
						projectCwd === undefined
							? true
							: (knownProjectAvailability(store, projectCwd) ??
								Boolean((await window.vetta.config.get())?.projects.some(({ path }) => path === projectCwd)));
					perfSessionSwitchMark("space-target-resolved", interactionId);
					if (!current()) {
						perfSessionSwitchComplete("cancelled", interactionId);
						return;
					}
					if (available) {
						if (location.kind === "project") {
							await navigate({ to: "/project/$cwd", params: { cwd: encodeURIComponent(location.cwd) } });
							perfSessionSwitchMark("space-route-committed", interactionId);
							perfSessionSwitchComplete("completed", interactionId);
							return;
						}
						if (location.kind === "team") {
							const sessions = await window.vetta.agentTeams.listSessions(location.teamId);
							if (!current()) return;
							if (sessions.some((session) => session.id === location.sessionId)) {
								await navigate({ to: "/agent-teams/$teamId/sessions/$sessionId", params: location });
								perfSessionSwitchMark("space-route-committed", interactionId);
								perfSessionSwitchComplete("completed", interactionId);
								return;
							}
						} else {
							const bucketCwd = conversationBucketCwd(location.cwd, defaultCwd);
							const cached = cachedSessionFor(store.get(sessionsMapAtom).get(bucketCwd), location.path);
							const session =
								cached !== null
									? cached
									: (await window.vetta.session.listSessions(bucketCwd)).find(
											(candidate) => candidate.path === location.path,
										);
							if (!current()) return;
							const target = session?.access
								? resolveDesktopSessionOpenTarget(session.access)
								: session
									? "interactive"
									: "unavailable";
							if (session && target !== "unavailable") {
								if (location.viewer || target === "viewer") {
									await navigate({ to: "/viewer/$path", params: { path: encodeURIComponent(location.path) } });
									perfSessionSwitchMark("space-route-committed", interactionId);
									perfSessionSwitchComplete("completed", interactionId);
									return;
								}
								perfSessionSwitchMark("space-session-open-start", interactionId);
								await openSessionFnRef.current?.(location.cwd, location.path);
								if (store.get(activeSessionAtom)?.sessionPath === location.path) {
									perfSessionSwitchMark("space-session-open-done", interactionId);
									perfSessionSwitchComplete("completed", interactionId);
									return;
								}
							}
						}
					}
				}
			} catch (error) {
				console.warn("[space] restore location failed", error);
			}
			if (current() && defaultCwd) {
				store.set(activeSessionAtom, null);
				store.set(pendingSessionCreationAtom, null);
				await navigate({ to: "/new-session/$cwd", params: { cwd: encodeURIComponent(defaultCwd) } });
				perfSessionSwitchMark("space-route-committed", interactionId);
			}
			perfSessionSwitchComplete("completed", interactionId);
		},
		[navigate, pathname, store],
	);
}

export function revealSpaceItem(store: Store, item: SpaceItem): void {
	pendingSpaceNavigation.delete(store);
	store.set(spacesAtom, (state) => selectSpace(state, spaceOf(state, item)));
}

export function spaceDisplayName(
	state: { spaces: readonly { id: string; name: string }[] },
	id: string,
	mainTitle: string,
): string {
	return id === MAIN_SPACE ? mainTitle : (state.spaces.find((space) => space.id === id)?.name ?? mainTitle);
}
