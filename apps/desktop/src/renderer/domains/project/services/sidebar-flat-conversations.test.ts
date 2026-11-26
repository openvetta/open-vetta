import type { Project } from "@shared/store/atoms";
import { describe, expect, it } from "vitest";
import type { SidebarConversationInfo } from "./sidebar-conversation-projection";
import { flattenSidebarConversations } from "./sidebar-flat-conversations";

function conversation(path: string, cwd: string): SidebarConversationInfo {
	return { kind: "conversation", id: path, path, cwd, firstMessage: path, modifiedAt: 1 };
}

const NAMED: Project = { cwd: "/work/api", name: "API", sessionCount: 1, type: "normal" };
const UNNAMED: Project = { cwd: "/work/web-app", sessionCount: 1, type: "normal" };

describe("flattenSidebarConversations", () => {
	it("merges default and project sessions, tagging only project sessions with their origin", () => {
		const flat = flattenSidebarConversations(
			[conversation("/chat/a.jsonl", "/chat/a")],
			[
				{ project: NAMED, sessions: [conversation("/work/api/s.jsonl", "/work/api")] },
				{ project: UNNAMED, sessions: [conversation("/work/web-app/s.jsonl", "/work/web-app")] },
			],
		);

		expect(flat.sessions.map(({ path }) => path)).toEqual([
			"/chat/a.jsonl",
			"/work/api/s.jsonl",
			"/work/web-app/s.jsonl",
		]);
		expect(flat.projectOrigins.has("conversation:/chat/a.jsonl")).toBe(false);
		expect(flat.projectOrigins.get("conversation:/work/api/s.jsonl")).toEqual({
			cwd: "/work/api",
			projectLabel: "API",
		});
		expect(flat.projectOrigins.get("conversation:/work/web-app/s.jsonl")).toEqual({
			cwd: "/work/web-app",
			projectLabel: "web-app",
		});
	});

	it("keeps a session that appears in several places only once, under its first source", () => {
		const shared = conversation("/chat/shared.jsonl", "/chat/shared");
		const flat = flattenSidebarConversations([shared], [{ project: NAMED, sessions: [shared] }]);

		expect(flat.sessions).toHaveLength(1);
		expect(flat.projectOrigins.size).toBe(0);
	});
});
