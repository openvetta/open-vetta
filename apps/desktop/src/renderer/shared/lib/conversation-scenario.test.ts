// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { resolveConversationScenario } from "./conversation-scenario";

const CONVERSATION_ROOT = "/Users/me/.vetta/conversation";
const PROJECT = "/Users/me/work/shop";

/**
 * 会话场景是插件插槽 fail-closed 过滤的依据。UI 侧与主进程建会话必须给出同一个答案，
 * 否则项目里的面板会在「新会话页 / 项目详情页」这类没有会话事件的页面上整片消失。
 */
describe("resolveConversationScenario", () => {
	it("treats the default conversation project as a conversation", () => {
		expect(resolveConversationScenario({ cwd: CONVERSATION_ROOT, defaultConversationCwd: CONVERSATION_ROOT })).toBe(
			"conversation",
		);
	});

	it("buckets per-session subdirectories of the conversation root back to the project root (ADR-0007)", () => {
		expect(
			resolveConversationScenario({
				cwd: `${CONVERSATION_ROOT}/1c9f4a2e`,
				defaultConversationCwd: CONVERSATION_ROOT,
			}),
		).toBe("conversation");
	});

	it("maps an ordinary project to project", () => {
		expect(resolveConversationScenario({ cwd: PROJECT, defaultConversationCwd: CONVERSATION_ROOT })).toBe("project");
	});

	it("maps batch projects and batch sessions to batch", () => {
		expect(
			resolveConversationScenario({ cwd: PROJECT, defaultConversationCwd: CONVERSATION_ROOT, projectType: "batch" }),
		).toBe("batch");
		expect(
			resolveConversationScenario({
				cwd: PROJECT,
				defaultConversationCwd: CONVERSATION_ROOT,
				batch: true,
				projectType: "normal",
			}),
		).toBe("batch");
	});

	it("falls back to project while the default conversation root is unknown", () => {
		expect(resolveConversationScenario({ cwd: PROJECT, defaultConversationCwd: "" })).toBe("project");
		expect(resolveConversationScenario({ cwd: PROJECT, defaultConversationCwd: null })).toBe("project");
	});
});
