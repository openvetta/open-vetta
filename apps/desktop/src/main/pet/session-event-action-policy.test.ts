import type { SessionEvent } from "@vetta/runtime-core";
import { describe, expect, it } from "vitest";
import { mapSessionEventToPetPresentation } from "./session-event-action-policy.js";

const eventBase = {
	schemaVersion: 1,
	sessionId: "session-1",
	eventId: "event-1",
	timestamp: 1,
	source: "runtime-core",
} as const;

describe("mapSessionEventToPetPresentation", () => {
	it("keeps the lifecycle notice visible while the session is running", () => {
		const event: SessionEvent = { ...eventBase, type: "session.lifecycle", phase: "agent_start" };

		expect(mapSessionEventToPetPresentation(event)?.bubble).toEqual({
			kind: "status",
			messageKey: "notice.lifecycle.started",
			persistent: true,
			ttlMs: 3_000,
			dedupeKey: "session-status",
		});
	});

	it("uses a safe, truncated tool description as the running body", () => {
		const description = "长工具描述".repeat(16);
		const event: SessionEvent = {
			...eventBase,
			type: "tool.start",
			toolCallId: "tool-1",
			toolName: "read",
			args: { description },
			startedAt: 1,
			source: "tool",
		};

		const notice = mapSessionEventToPetPresentation(event)?.bubble;
		expect(notice?.body).toBe(`${description.slice(0, 47)}…`);
		expect(notice?.messageKey).toBeUndefined();
		expect(notice?.persistent).toBe(true);
		expect(notice?.dedupeKey).toBe("session-status");
	});

	it("uses assistant final text as the terminal bubble body", () => {
		const event: SessionEvent = {
			...eventBase,
			type: "message.final",
			message: { role: "assistant", content: [{ type: "text", text: "已完成配置迁移" }] } as never,
		};

		expect(mapSessionEventToPetPresentation(event)?.bubble).toMatchObject({
			body: "已完成配置迁移",
			messageKey: "notice.lifecycle.completed",
		});
	});

	it("does not mark a tool-call-only assistant message as completed", () => {
		const event: SessionEvent = {
			...eventBase,
			type: "message.final",
			message: { role: "assistant", content: [] } as never,
		};

		expect(mapSessionEventToPetPresentation(event)).toBeNull();
	});

	it("marks errors as high-priority structured notices", () => {
		const event: SessionEvent = {
			...eventBase,
			type: "error",
			error: { code: "boom", message: "failed", retryable: false, origin: "runtime" },
		};

		expect(mapSessionEventToPetPresentation(event)?.bubble).toMatchObject({
			kind: "error",
			messageKey: "notice.error.generic",
			priority: "high",
		});
		expect(mapSessionEventToPetPresentation(event)?.actionId).toBe("penguin_review_facepalm");
	});

	it("cheers when the session completes", () => {
		const event: SessionEvent = { ...eventBase, type: "session.lifecycle", phase: "agent_end" };

		expect(mapSessionEventToPetPresentation(event)?.actionId).toBe("penguin_tests_passed_cheer");
	});

	it("waits on the spinner while compacting context", () => {
		const event: SessionEvent = { ...eventBase, type: "compaction.start", reason: "threshold" };

		expect(mapSessionEventToPetPresentation(event)?.actionId).toBe("penguin_wait_for_compile");
	});

	it("scratches its head when a retry starts", () => {
		const event: SessionEvent = {
			...eventBase,
			type: "retry.start",
			attempt: 2,
			maxAttempts: 3,
			delayMs: 1_000,
			errorMessage: "timeout",
		};

		expect(mapSessionEventToPetPresentation(event)?.actionId).toBe("penguin_debug_scratch_laptop");
	});

	it("facepalms when a tool fails", () => {
		const event: SessionEvent = {
			...eventBase,
			type: "tool.end",
			toolCallId: "tool-1",
			toolName: "bash",
			isError: true,
			result: "exit 1",
			startedAt: 1,
			durationMs: 2,
			phases: [],
		};

		expect(mapSessionEventToPetPresentation(event)?.actionId).toBe("penguin_review_facepalm");
	});
});
