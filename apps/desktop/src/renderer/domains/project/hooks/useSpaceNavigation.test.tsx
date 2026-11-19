// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { act } from "react";
import { createStore, Provider } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	defaultConversationCwdAtom,
	openSessionFnRef,
	projectsAtom,
	projectsInitializedAtom,
	type SessionInfo,
	sessionsMapAtom,
} from "@shared/store/atoms";
import { INITIAL_SPACES, spacesAtom } from "@shared/store/spaces";
import { useSpaceNavigation } from "./useSpaceNavigation";

const DEFAULT_CWD = "/test/default-conversations";
const PROJECT_CWD = "/test/work-project";
const routed = vi.hoisted(() => ({ path: "" }));

vi.mock("@tanstack/react-router", () => ({
	useLocation: (options?: { select?: (location: { pathname: string }) => unknown }) => {
		const location = { pathname: routed.path };
		return options?.select ? options.select(location) : location;
	},
	useNavigate: () => (route: { to: string; params?: Record<string, string> }) => {
		routed.path = Object.entries(route.params ?? {}).reduce(
			(path, [key, value]) => path.replace(`$${key}`, value),
			route.to,
		);
		return Promise.resolve();
	},
}));

type SavedLocation =
	| { kind: "project"; cwd: string }
	| { kind: "conversation"; path: string; cwd: string };

/** 切到一个只有 Work 一个自定义空间、并且记住了 location 的状态。 */
async function switchToWork(location: SavedLocation, sessions?: Map<string, SessionInfo[]>) {
	const store = createStore();
	store.set(spacesAtom, {
		...INITIAL_SPACES,
		spaces: [{ id: "work", name: "Work", icon: { kind: "solar", value: "code" } }],
		projects: { [PROJECT_CWD]: "work" },
		conversations: { [`${DEFAULT_CWD}/chat.jsonl`]: "work" },
		locations: { work: location },
	});
	store.set(defaultConversationCwdAtom, DEFAULT_CWD);
	store.set(projectsInitializedAtom, true);
	store.set(projectsAtom, [{ cwd: PROJECT_CWD, name: "Work project", type: "normal", sessionCount: 1 }]);
	if (sessions) store.set(sessionsMapAtom, sessions);

	let switchSpace: ((id: string) => Promise<void>) | undefined;
	function Harness(): null {
		switchSpace = useSpaceNavigation();
		return null;
	}
	render(
		<Provider store={store}>
			<Harness />
		</Provider>,
	);
	await act(async () => {
		await switchSpace?.("work");
	});
	return store;
}

/** 侧栏已经加载过默认 cwd 时的会话索引。 */
function cachedSessions(): Map<string, SessionInfo[]> {
	return new Map([
		[
			DEFAULT_CWD,
			[
				{
					id: "chat",
					path: `${DEFAULT_CWD}/chat.jsonl`,
					cwd: DEFAULT_CWD,
					firstMessage: "Existing conversation",
					modifiedAt: 1,
					access: { resume: true, readHistory: true, rename: true, delete: true },
				},
			],
		],
	]);
}

describe("useSpaceNavigation", () => {
	beforeEach(() => {
		routed.path = "/";
		openSessionFnRef.current = null;
		// 切换只该读内存里已有的项目与会话索引，这里让任何 IPC 调用直接失败。
		vi.stubGlobal("vetta", {
			config: {
				get: () => {
					throw new Error("config.get should not run when the project list is loaded");
				},
			},
			session: {
				listSessions: () => {
					throw new Error("session.listSessions should not run when the cwd is loaded");
				},
			},
		});
	});

	it("restores the saved project without re-reading the project config", async () => {
		await switchToWork({ kind: "project", cwd: PROJECT_CWD });

		expect(routed.path).toBe(`/project/${encodeURIComponent(PROJECT_CWD)}`);
	});

	it("opens the saved conversation from the sidebar's session cache", async () => {
		const opened: string[] = [];
		openSessionFnRef.current = async (cwd, path) => {
			opened.push(`${cwd}|${path}`);
		};
		await switchToWork({ kind: "conversation", path: `${DEFAULT_CWD}/chat.jsonl`, cwd: DEFAULT_CWD }, cachedSessions());

		expect(opened).toEqual([`${DEFAULT_CWD}|${DEFAULT_CWD}/chat.jsonl`]);
	});

	it("falls back to the new conversation page when the saved session is gone", async () => {
		await switchToWork(
			{ kind: "conversation", path: `${DEFAULT_CWD}/deleted.jsonl`, cwd: DEFAULT_CWD },
			cachedSessions(),
		);

		expect(routed.path).toBe(`/new-session/${encodeURIComponent(DEFAULT_CWD)}`);
	});
});
