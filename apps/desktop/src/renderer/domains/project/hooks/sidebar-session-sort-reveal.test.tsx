// @vitest-environment jsdom
import { runningSessionPathsAtom, sidebarSessionViewAtom } from "@shared/store/atoms";
import { act, renderHook } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import type { SidebarConversationInfo } from "../services/sidebar-conversation-projection";
import { useDefaultSessionListModel } from "./useDefaultSessionListModel";
import { useProjectGroupModel } from "./useProjectGroupModel";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key, i18n: { language: "zh" } }),
}));

const CWD = "C:/project";
const noop = (): void => {};

// 被选中的会话最近刚回复（按回复时间排第一），但创建得最早（按创建时间排最后，落在折叠区）。
const selected: SidebarConversationInfo = {
	kind: "conversation",
	id: "selected",
	path: "C:/sessions/selected.jsonl",
	cwd: CWD,
	firstMessage: "Selected",
	modifiedAt: 100,
	createdAt: 1,
};
const others: SidebarConversationInfo[] = Array.from({ length: 6 }, (_, index) => ({
	kind: "conversation",
	id: `other-${index}`,
	path: `C:/sessions/other-${index}.jsonl`,
	cwd: CWD,
	firstMessage: `Other ${index}`,
	modifiedAt: 50 - index,
	createdAt: 10 + index,
}));
const sessions = [selected, ...others];

function storeWrapper(store: ReturnType<typeof createStore>) {
	return ({ children }: PropsWithChildren): JSX.Element => <Provider store={store}>{children}</Provider>;
}

describe("sidebar keeps the selected session visible across sort changes", () => {
	it("reveals the selected chat in the default list after switching to creation order, then respects a manual collapse", () => {
		const store = createStore();
		const { result } = renderHook(
			() =>
				useDefaultSessionListModel({
					activeSessionPath: selected.path,
					activeTeamSessionId: "",
					cwd: CWD,
					filter: "conversation",
					onRenameSession: noop,
					onSelectSession: noop,
					sessions,
				}),
			{ wrapper: storeWrapper(store) },
		);
		const visiblePaths = () => result.current.visibleSessions.map((session) => session.path);
		expect(visiblePaths()[0]).toBe(selected.path);

		act(() => store.set(sidebarSessionViewAtom, { sort: "created" }));
		expect(result.current.showAll).toBe(true);
		expect(visiblePaths()).toContain(selected.path);

		act(() => result.current.actions.toggleShowAll());
		act(() => store.set(runningSessionPathsAtom, new Set([others[0]?.path ?? ""])));
		expect(result.current.showAll).toBe(false);
		expect(visiblePaths()).not.toContain(selected.path);
	});

	it("reveals the selected chat inside a project after switching to creation order", () => {
		const store = createStore();
		const { result } = renderHook(
			() =>
				useProjectGroupModel({
					activeSessionPath: selected.path,
					activeTeamSessionId: "",
					isExpanded: true,
					onCollapse: noop,
					onExpand: noop,
					onNavigateProject: noop,
					onNewSession: noop,
					onRenameSession: noop,
					onSelectSession: noop,
					project: { cwd: CWD, name: "OpenVetta", sessionCount: sessions.length, type: "normal" },
					sessions,
				}),
			{ wrapper: storeWrapper(store) },
		);
		expect(result.current.showAllSessions).toBe(false);

		act(() => store.set(sidebarSessionViewAtom, { sort: "created" }));

		expect(result.current.showAllSessions).toBe(true);
	});
});
