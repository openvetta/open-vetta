import type { Project, SessionInfo } from "@shared/store/atoms";
import { describe, expect, it } from "vitest";
import { findSidebarSessions } from "./sidebar-sessions";

function info(path: string, cwd: string, name?: string): SessionInfo {
	return { id: path, path, cwd, name, firstMessage: "hello", modifiedAt: 1 };
}

const projects: Project[] = [
	{ cwd: "/chat", name: "对话", sessionCount: 1, type: "normal", isDefault: true },
	{ cwd: "/w/app", name: "App", sessionCount: 1, type: "normal" },
	{ cwd: "/w/batch", name: "Batch", sessionCount: 1, type: "batch" },
];

const context = {
	sessionsByBucket: new Map<string, SessionInfo[]>([
		["/chat", [info("/s/chat.jsonl", "/chat/c1", "Chat"), info("/s/claw.jsonl", "/im")]],
		["/w/app", [info("/s/app.jsonl", "/w/app", "Fix")]],
		["/w/batch", [info("/s/batch.jsonl", "/w/batch/item")]],
	]),
	projects,
	defaultConversationCwd: "/chat",
	imConversationCwd: "/im",
};

describe("findSidebarSessions", () => {
	it("resolves watched sessions from the sidebar with their source", () => {
		const found = findSidebarSessions(
			["/s/chat.jsonl", "/s/claw.jsonl", "/s/app.jsonl", "/s/batch.jsonl", "/s/missing.jsonl"],
			context,
		);

		expect([...found.values()].map((result) => [result.session.path, result.sourceKind, result.sourceName])).toEqual([
			["/s/chat.jsonl", "conversation", undefined],
			["/s/claw.jsonl", "claw", undefined],
			["/s/app.jsonl", "project", "App"],
			["/s/batch.jsonl", "batch", "Batch"],
		]);
		expect(found.has("/s/missing.jsonl")).toBe(false);
		// 侧栏条目还没解析访问能力时按可打开处理。
		expect(found.get("/s/app.jsonl")?.session.access.resume).toBe(true);
	});
});
