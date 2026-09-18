// @vitest-environment jsdom
import type { SessionInfo } from "@shared/store/atoms";
import { conversationTagsAtom, tagConversationFilter } from "@shared/store/atoms";
import { renderHook } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { SidebarConversationInfo } from "../services/sidebar-conversation-projection";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key, i18n: { language: "zh" } }),
}));

const { useDefaultSessionListModel } = await import("./useDefaultSessionListModel.js");

const CWD = "/home/user/.vetta/desktop-app/conversation";

function session(path: string): SidebarConversationInfo {
	return {
		kind: "conversation",
		id: path,
		path,
		cwd: CWD,
		firstMessage: path,
		modifiedAt: 1,
	} satisfies { kind: "conversation" } & SessionInfo;
}

const TAGGED = session(`${CWD}/tagged.jsonl`);
const PLAIN = session(`${CWD}/plain.jsonl`);

function renderModel(filter: Parameters<typeof useDefaultSessionListModel>[0]["filter"]) {
	const store = createStore();
	store.set(conversationTagsAtom, {
		tags: [{ id: "t1", name: "重要", color: "#ff5f57", createdAt: 1 }],
		assignments: { [TAGGED.path]: ["t1"] },
	});
	const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
	return renderHook(
		() =>
			useDefaultSessionListModel({
				activeSessionPath: "",
				activeTeamSessionId: "",
				cwd: CWD,
				filter,
				onNewSession: () => {},
				onRenameSession: () => {},
				onSelectSession: () => {},
				sessions: [TAGGED, PLAIN],
			}),
		{ wrapper },
	);
}

describe("useDefaultSessionListModel tag filtering", () => {
	it("keeps tagged conversations in the unfiltered conversation tier", () => {
		const { result } = renderModel("conversation");
		expect(result.current.sessions.map((view) => view.path)).toEqual([TAGGED.path, PLAIN.path]);
	});

	it("marks tagged conversations with their tag colors in the unfiltered tier", () => {
		const { result } = renderModel("conversation");
		expect(result.current.sessions.map((view) => view.tagColors)).toEqual([["#ff5f57"], undefined]);
	});

	it("drops the color dots inside a tag tier where every row shares the tag", () => {
		const { result } = renderModel(tagConversationFilter("t1"));
		expect(result.current.sessions[0]?.tagColors).toBeUndefined();
	});

	it("narrows the list to the selected tag", () => {
		const { result } = renderModel(tagConversationFilter("t1"));
		expect(result.current.sessions.map((view) => view.path)).toEqual([TAGGED.path]);
	});

	it("shows nothing for a tag no conversation carries", () => {
		const { result } = renderModel(tagConversationFilter("t-unknown"));
		expect(result.current.sessions).toEqual([]);
		expect(result.current.labels.emptyTitle).toBe("sidebar.defaultConversation.emptyTagTitle");
		// 标签档下照样提供「开始新对话」——新建的会话会继承当前标签。
		expect(result.current.actions.emptyAction).toBeDefined();
	});

	it("renders external Grok items with title, activity time, and source", () => {
		const store = createStore();
		const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
		const grokSession: SidebarConversationInfo = {
			kind: "conversation",
			id: "grok-1",
			path: "/tmp/grok/sessions/demo/a/summary.json",
			cwd: "/workspace/demo",
			name: "Fix the login bug",
			firstMessage: "Fix the login bug",
			modifiedAt: Date.now() - 2 * 60 * 60 * 1000,
			origin: { tool: "grok", path: "/tmp/grok/sessions/demo/a/summary.json" },
			access: { readHistory: true, resume: false, rename: false, delete: false },
		};
		const { result } = renderHook(
			() =>
				useDefaultSessionListModel({
					activeSessionPath: "",
					activeTeamSessionId: "",
					cwd: "/tmp/grok/sessions",
					filter: "external",
					onNewSession: () => {},
					onRenameSession: () => {},
					onSelectSession: () => {},
					sessions: [grokSession],
				}),
			{ wrapper },
		);
		expect(result.current.sessions[0]?.label).toBe("Fix the login bug");
		expect(result.current.sessions[0]?.caption).toBe("sidebar.time.hours · sidebar.external.sourceGrok");
		expect(result.current.actions.emptyAction).toBeUndefined();
		expect(result.current.labels.emptyAction).toBeUndefined();
	});

	it("shows a capped unavailable reason for a damaged Grok sidecar", () => {
		const store = createStore();
		const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
		const broken: SidebarConversationInfo = {
			kind: "conversation",
			id: "broken",
			path: "/tmp/grok/sessions/demo/b/summary.json",
			cwd: "",
			firstMessage: "",
			modifiedAt: Date.now(),
			origin: { tool: "grok", path: "/tmp/grok/sessions/demo/b/summary.json" },
			unavailableReason: "corrupted_header",
			access: { readHistory: false, resume: false, rename: false, delete: false },
		};
		const { result } = renderHook(
			() =>
				useDefaultSessionListModel({
					activeSessionPath: "",
					activeTeamSessionId: "",
					cwd: "/tmp/grok/sessions",
					filter: "external",
					onNewSession: () => {},
					onRenameSession: () => {},
					onSelectSession: () => {},
					sessions: [broken],
				}),
			{ wrapper },
		);
		expect(result.current.sessions[0]?.caption).toBe(
			"sidebar.external.corruptedHeader · sidebar.external.sourceGrok",
		);
	});
});
