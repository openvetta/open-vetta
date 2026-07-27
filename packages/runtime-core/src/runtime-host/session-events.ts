import { randomUUID } from "node:crypto";
import type { Message } from "@vetta/ai";
import type { AgentSession, AgentSessionEvent } from "@vetta/coding-agent";
import type { SessionEvent, SessionEventBase } from "../contracts.js";
import { runtimeError } from "../errors.js";
import type { RuntimeSessionLifecyclePhase, RuntimeSessionObservationEvent } from "../session-observation.js";
import { ASSISTANT_TURN_TIMING_TYPE, extractAssistantText } from "./history.js";

export function baseSessionEvent(
	sessionId: string,
	source: SessionEventBase["source"],
	timestamp = Date.now(),
): SessionEventBase {
	return {
		schemaVersion: 1,
		sessionId,
		eventId: randomUUID(),
		timestamp,
		source,
	};
}

export function lifecycleSessionEvent(
	sessionId: string,
	phase: RuntimeSessionLifecyclePhase,
	timestamp?: number,
): SessionEvent {
	return mapRuntimeSessionObservationEvent(sessionId, {
		type: "lifecycle",
		phase,
		source: "runtime-core",
		timestamp,
	});
}

/** 将独立 Runtime Session 观察事件封装为宿主稳定 SessionEvent。 */
export function mapRuntimeSessionObservationEvent(
	sessionId: string,
	event: RuntimeSessionObservationEvent,
	timestamp = event.timestamp,
): SessionEvent {
	const base = baseSessionEvent(sessionId, event.source, timestamp);
	switch (event.type) {
		case "lifecycle":
			return { ...base, type: "session.lifecycle", phase: event.phase };
		case "message.delta":
			return { ...base, type: event.type, delta: event.delta };
		case "thinking.delta":
			return { ...base, type: event.type, delta: event.delta };
		case "message.final":
			return { ...base, type: event.type, message: event.message };
		case "toolcall.start":
			return { ...base, type: event.type, toolCallId: event.toolCallId, toolName: event.toolName };
		case "tool.start":
			return {
				...base,
				type: event.type,
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				args: event.args,
				startedAt: event.startedAt,
			};
		case "tool.update":
			return {
				...base,
				type: event.type,
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				partialResult: event.partialResult,
			};
		case "tool.phase":
			return {
				...base,
				type: event.type,
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				label: event.label,
				atMs: event.atMs,
			};
		case "tool.end":
			return {
				...base,
				type: event.type,
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				isError: event.isError,
				result: event.result,
				startedAt: event.startedAt,
				durationMs: event.durationMs,
				phases: [...event.phases],
			};
		case "mcp.status":
			return { ...base, type: event.type, status: event.status, details: event.details };
		case "mcp.reload.start":
			return { ...base, type: event.type };
		case "mcp.reload.end":
			return { ...base, type: event.type, changed: event.changed, errorMessage: event.errorMessage };
		case "usage.update":
			return {
				...base,
				type: event.type,
				input: event.input,
				output: event.output,
				cacheRead: event.cacheRead,
				cacheWrite: event.cacheWrite,
				costTotal: event.costTotal,
				contextPercent: event.contextPercent,
				contextWindow: event.contextWindow,
			};
		case "error":
			return { ...base, type: event.type, error: event.error };
		case "todo_update":
			return { ...base, type: event.type, items: [...event.items] };
		case "background_tasks_update":
			return { ...base, type: event.type, tasks: [...event.tasks] };
		case "subagents_update":
			return { ...base, type: event.type, agents: [...event.agents] };
		case "compaction.start":
			return { ...base, type: event.type, reason: event.reason };
		case "compaction.end":
			return { ...base, type: event.type, success: event.success, errorMessage: event.errorMessage };
	}
}

export type MapAgentEventState = {
	/** 当前回合 start 时间；agent_start 写入，agent_end 消费后清除。 */
	currentTurnStartedAt: Map<string, number>;
};

/** 旧 coding-agent 事件到独立 Runtime Session 观察事件的兼容适配。 */
export function mapAgentSessionEventToObservations(
	sessionId: string,
	event: AgentSessionEvent,
	session: AgentSession,
	state: MapAgentEventState,
): RuntimeSessionObservationEvent[] {
	if (event.type === "agent_start") {
		const startedAt = Date.now();
		state.currentTurnStartedAt.set(sessionId, startedAt);
		return [{ type: "lifecycle", phase: "agent_start", source: "runtime-core", timestamp: startedAt }];
	}

	if (event.type === "turn_start" || event.type === "turn_end") {
		return [{ type: "lifecycle", phase: event.type, source: "runtime-core" }];
	}

	if (event.type === "agent_end") {
		const endedAt = Date.now();
		persistAssistantTurnTiming(sessionId, session, endedAt, state.currentTurnStartedAt);
		return [{ type: "lifecycle", phase: "agent_end", source: "runtime-core", timestamp: endedAt }];
	}

	if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
		return [{ type: "message.delta", delta: event.assistantMessageEvent.delta, source: "agent" }];
	}

	if (event.type === "message_update" && event.assistantMessageEvent.type === "thinking_delta") {
		return [{ type: "thinking.delta", delta: event.assistantMessageEvent.delta, source: "agent" }];
	}

	if (event.type === "message_update" && event.assistantMessageEvent.type === "toolcall_start") {
		const partial = event.assistantMessageEvent.partial;
		const toolContent = partial.content[event.assistantMessageEvent.contentIndex];
		if (toolContent?.type !== "toolCall") return [];
		return [
			{
				type: "toolcall.start",
				toolCallId: String(toolContent.id ?? ""),
				toolName: String(toolContent.name ?? ""),
				source: "agent",
			},
		];
	}

	if (event.type === "message_end" && event.message.role === "assistant") {
		const contextUsage = session.getContextUsage();
		const observations: RuntimeSessionObservationEvent[] = [
			{ type: "message.final", message: event.message, source: "agent" },
			{
				type: "usage.update",
				input: event.message.usage.input,
				output: event.message.usage.output,
				cacheRead: event.message.usage.cacheRead,
				cacheWrite: event.message.usage.cacheWrite,
				costTotal: event.message.usage.cost.total,
				contextPercent: contextUsage?.percent ?? null,
				contextWindow: contextUsage?.contextWindow ?? 0,
				source: "agent",
			},
		];

		if (event.message.stopReason === "error") {
			const errorText =
				extractAssistantText(event.message.content) ||
				(event.message as Message & { errorMessage?: string }).errorMessage ||
				"Assistant response ended with error";
			console.error(`[RuntimeHost.event] session=${sessionId} type=assistant_error message=${errorText}`);
			observations.push({
				type: "error",
				error: runtimeError("INTERNAL_ERROR", errorText, true, "provider"),
				source: "agent",
			});
		} else if (event.message.stopReason === "aborted") {
			console.warn(`[RuntimeHost.event] session=${sessionId} type=aborted`);
			observations.push({
				type: "lifecycle",
				phase: "aborted",
				source: "runtime-core",
				timestamp: Date.now(),
			});
		}
		return observations;
	}

	if (event.type === "tool_execution_start") {
		return [
			{
				type: "tool.start",
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				args: event.args,
				startedAt: event.startedAt,
				source: "tool",
			},
		];
	}

	if (event.type === "tool_execution_update") {
		return [
			{
				type: "tool.update",
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				partialResult: event.partialResult,
				source: "tool",
			},
		];
	}

	if (event.type === "tool_execution_phase") {
		return [
			{
				type: "tool.phase",
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				label: event.label,
				atMs: event.atMs,
				source: "tool",
			},
		];
	}

	if (event.type === "tool_execution_end") {
		return [
			{
				type: "tool.end",
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				isError: event.isError,
				result: event.result,
				startedAt: event.startedAt,
				durationMs: event.durationMs,
				phases: event.phases,
				source: "tool",
			},
		];
	}

	if (event.type === "auto_retry_start") {
		console.warn(
			`[RuntimeHost.event] session=${sessionId} type=auto_retry_start attempt=${event.attempt}/${event.maxAttempts} delayMs=${event.delayMs} message=${event.errorMessage}`,
		);
		return [
			{
				type: "error",
				error: runtimeError("INTERNAL_ERROR", event.errorMessage, true, "provider"),
				source: "agent",
			},
		];
	}

	if (event.type === "todo_update") {
		return [{ type: "todo_update", items: event.items, source: "agent" }];
	}
	if (event.type === "background_tasks_update") {
		return [{ type: "background_tasks_update", tasks: event.tasks, source: "agent" }];
	}
	if (event.type === "subagents_update") {
		return [{ type: "subagents_update", agents: event.agents, source: "agent" }];
	}
	if (event.type === "auto_compaction_start") {
		return [{ type: "compaction.start", reason: event.reason, source: "agent" }];
	}
	if (event.type === "auto_compaction_end") {
		return [
			{
				type: "compaction.end",
				success: Boolean(event.result) && !event.aborted,
				errorMessage: event.errorMessage,
				source: "agent",
			},
		];
	}
	if (event.type === "mcp_reload_start") {
		return [{ type: "mcp.reload.start", source: "agent" }];
	}
	if (event.type === "mcp_reload_end") {
		return [
			{
				type: "mcp.reload.end",
				changed: event.changed,
				errorMessage: event.errorMessage,
				source: "agent",
			},
		];
	}

	return [];
}

/** 保留现有 RuntimeHost 调用面的旧事件兼容入口。 */
export function mapAgentSessionEvent(
	sessionId: string,
	event: AgentSessionEvent,
	session: AgentSession,
	state: MapAgentEventState,
): SessionEvent[] {
	return mapAgentSessionEventToObservations(sessionId, event, session, state).map((observation) =>
		mapRuntimeSessionObservationEvent(sessionId, observation),
	);
}

export function persistAssistantTurnTiming(
	sessionId: string,
	session: AgentSession,
	endedAt: number,
	currentTurnStartedAt: Map<string, number>,
): void {
	const startedAt = currentTurnStartedAt.get(sessionId);
	if (!startedAt) return;
	currentTurnStartedAt.delete(sessionId);
	session.sessionManager.appendCustomEntry(ASSISTANT_TURN_TIMING_TYPE, {
		startedAt,
		endedAt,
		durationMs: Math.max(0, endedAt - startedAt),
	});
}
