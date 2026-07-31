import type { ToolPhase } from "@vetta/agent-core";
import type { Message, ToolResultMessage } from "@vetta/ai";
import type { RuntimeToolResult } from "./kernel/contracts.js";

/**
 * Turn Engine 暴露给 Session 级运行时适配器的完整执行观察事件。
 *
 * 它与面向应用的 SessionEvent 分离：这里保留 Extension 等执行期适配器需要的
 * 消息、工具结果和时序，同时不引入任何产品事件类型。
 */
export type RuntimeExecutionObservationEvent =
	| { readonly type: "agent.start" }
	| { readonly type: "turn.start" }
	| {
			readonly type: "turn.end";
			readonly message: Message;
			readonly toolResults: readonly ToolResultMessage[];
	  }
	| {
			readonly type: "tool.execution.start";
			readonly toolCallId: string;
			readonly toolName: string;
			readonly args: unknown;
			readonly startedAt: number;
	  }
	| {
			readonly type: "tool.execution.update";
			readonly toolCallId: string;
			readonly toolName: string;
			readonly args: unknown;
			readonly partialResult: RuntimeToolResult;
	  }
	| {
			readonly type: "tool.execution.phase";
			readonly toolCallId: string;
			readonly toolName: string;
			readonly label: string;
			readonly atMs: number;
	  }
	| {
			readonly type: "tool.execution.end";
			readonly toolCallId: string;
			readonly toolName: string;
			readonly result: RuntimeToolResult;
			readonly isError: boolean;
			readonly startedAt: number;
			readonly durationMs: number;
			readonly phases: readonly ToolPhase[];
	  };
