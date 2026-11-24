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
	it("switches to the working animation when a session starts", () => {
		const event: SessionEvent = { ...eventBase, type: "session.lifecycle", phase: "agent_start" };

		expect(mapSessionEventToPetPresentation(event)).toEqual({
			state: "thinking",
			actionId: "stoat_work_laptop_typing_desk_cushion",
		});
	});

	it("shows working while a tool runs", () => {
		const event: SessionEvent = {
			...eventBase,
			type: "tool.start",
			toolCallId: "tool-1",
			toolName: "read",
			args: { description: "读取配置文件" },
			startedAt: 1,
			source: "tool",
		};

		expect(mapSessionEventToPetPresentation(event)).toEqual({
			state: "working",
			actionId: "stoat_work_laptop_typing_desk_cushion",
		});
	});

	it("keeps the previous state for an assistant final message", () => {
		const event = {
			...eventBase,
			channel: "assistant",
			source: "agent",
			modelCallIndex: 0,
			type: "done",
			reason: "stop",
			message: { role: "assistant", content: [{ type: "text", text: "已完成配置迁移" }] },
		} as unknown as SessionEvent;

		expect(mapSessionEventToPetPresentation(event)).toBeNull();
	});

	it("switches to the error animation on failure", () => {
		const event: SessionEvent = {
			...eventBase,
			type: "error",
			error: { code: "boom", message: "failed", retryable: false, origin: "runtime" },
		};

		expect(mapSessionEventToPetPresentation(event)).toEqual({
			state: "error",
			actionId: "stoat_wave_backflip_smoke_fade_exit",
		});
	});
});
