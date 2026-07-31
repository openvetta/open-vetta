import type { RuntimeSessionExecutionObservation } from "@vetta/runtime-core";
import type {
	AgentStartEvent,
	ToolExecutionEndEvent,
	ToolExecutionPhaseEvent,
	ToolExecutionStartEvent,
	ToolExecutionUpdateEvent,
	TurnEndEvent,
	TurnStartEvent,
} from "../../core/extensions/types.js";

export type CodingAgentGreenfieldObservedExtensionEvent =
	| AgentStartEvent
	| TurnStartEvent
	| TurnEndEvent
	| ToolExecutionStartEvent
	| ToolExecutionUpdateEvent
	| ToolExecutionPhaseEvent
	| ToolExecutionEndEvent;

/**
 * 将产品无关的 Runtime 执行观察事件适配为旧 Extension 观察事件。
 *
 * turnIndex 保持 Legacy EventRouter 的 Agent Run 级语义：agent_start 归零，
 * 每个 turn_end 完成后递增。
 */
export class CodingAgentGreenfieldExtensionObservationAdapter {
	private turnIndex = 0;

	constructor(private readonly emit: (event: CodingAgentGreenfieldObservedExtensionEvent) => Promise<void>) {}

	async observe(observation: RuntimeSessionExecutionObservation): Promise<void> {
		const { event } = observation;
		if (event.type === "agent.start") {
			this.turnIndex = 0;
			await this.emit({ type: "agent_start" });
			return;
		}
		if (event.type === "turn.start") {
			await this.emit({
				type: "turn_start",
				turnIndex: this.turnIndex,
				timestamp: observation.timestamp,
			});
			return;
		}
		if (event.type === "turn.end") {
			try {
				await this.emit({
					type: "turn_end",
					turnIndex: this.turnIndex,
					message: event.message,
					toolResults: [...event.toolResults],
				});
			} finally {
				this.turnIndex++;
			}
			return;
		}
		if (event.type === "tool.execution.start") {
			await this.emit({
				type: "tool_execution_start",
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				args: event.args,
				startedAt: event.startedAt,
			});
			return;
		}
		if (event.type === "tool.execution.update") {
			await this.emit({
				type: "tool_execution_update",
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				args: event.args,
				partialResult: {
					content: [...event.partialResult.content],
					details: event.partialResult.details,
				},
			});
			return;
		}
		if (event.type === "tool.execution.phase") {
			await this.emit({
				type: "tool_execution_phase",
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				label: event.label,
				atMs: event.atMs,
			});
			return;
		}
		await this.emit({
			type: "tool_execution_end",
			toolCallId: event.toolCallId,
			toolName: event.toolName,
			result: {
				content: [...event.result.content],
				details: event.result.details,
			},
			isError: event.isError,
			startedAt: event.startedAt,
			durationMs: event.durationMs,
			phases: [...event.phases],
		});
	}
}
