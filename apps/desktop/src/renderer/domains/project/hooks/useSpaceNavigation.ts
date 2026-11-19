import { bumpOpenSessionToken } from "@domains/conversation/services/chat-service";
import {
	activeSessionAtom,
	conversationBucketCwd,
	defaultConversationCwdAtom,
	openSessionFnRef,
	pendingSessionCreationAtom,
	pendingSessionOpenAtom,
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
			store.set(spacesAtom, (current) => selectSpace(current, id));
			const intent = {};
			pendingSpaceNavigation.set(store, intent);
			if (!force && !isSpaceRoute(pathname)) return;
			if (store.get(pendingSessionOpenAtom)) bumpOpenSessionToken();
			const defaultCwd = store.get(defaultConversationCwdAtom);
			const current = () => pendingSpaceNavigation.get(store) === intent && store.get(spacesAtom).selected === id;
			const location = state.locations[id];
			try {
				if (location && spaceOf(store.get(spacesAtom), locationItem(location, defaultCwd)) === id) {
					const item = locationItem(location, defaultCwd);
					const projectCwd = item.kind === "project" ? item.key : undefined;
					const config = projectCwd ? await window.vetta.config.get() : null;
					if (!current()) return;
					const available = !projectCwd || config?.projects.some(({ path }) => path === projectCwd);
					if (available) {
						if (location.kind === "project") {
							await navigate({ to: "/project/$cwd", params: { cwd: encodeURIComponent(location.cwd) } });
							return;
						}
						if (location.kind === "team") {
							const sessions = await window.vetta.agentTeams.listSessions(location.teamId);
							if (!current()) return;
							if (sessions.some((session) => session.id === location.sessionId)) {
								await navigate({ to: "/agent-teams/$teamId/sessions/$sessionId", params: location });
								return;
							}
						} else {
							const sessions = await window.vetta.session.listSessions(
								conversationBucketCwd(location.cwd, defaultCwd),
							);
							if (!current()) return;
							const session = sessions.find((session) => session.path === location.path);
							const target = session ? resolveDesktopSessionOpenTarget(session.access) : "unavailable";
							if (session && target !== "unavailable") {
								if (location.viewer || target === "viewer") {
									await navigate({ to: "/viewer/$path", params: { path: encodeURIComponent(location.path) } });
									return;
								}
								await openSessionFnRef.current?.(location.cwd, location.path);
								if (store.get(activeSessionAtom)?.sessionPath === location.path) return;
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
			}
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
