import {
	type AgentContextCheckpointResult,
	type AgentEvent,
	type AgentLoopConfig,
	type AgentMessage,
	type AgentTool,
	AgentToolExecutionError,
	agentLoopContinue,
	type StreamFn,
} from "@vetta/agent-core";
import { type Api, type Message, type Model, type SimpleStreamOptions, Type } from "@vetta/ai";
import type { RuntimeSessionObservationEvent } from "../session-observation.js";
import type {
	RuntimeToolDefinition,
	RuntimeToolResult,
	TurnEngineContextCheckpointResult,
	TurnEngineEvent,
	TurnEnginePort,
	TurnEngineRequest,
} from "./contracts.js";
import { turnProtocolError } from "./errors.js";
import { composeModelCallSystemPrompt, resolveModelCallFrame } from "./model-call-frame.js";
import { RuntimeToolExecutionError } from "./tool-execution-error.js";

export interface AgentCoreTurnEngineOptions {
	/** 兼容静态组合；Greenfield 应通过 TurnEngineRequest.modelBinding 提供模型。 */
	readonly model?: Model<Api>;
	readonly streamOptions?: Omit<SimpleStreamOptions, "sessionId" | "signal">;
	readonly streamFn?: StreamFn;
	readonly getApiKey?: AgentLoopConfig["getApiKey"];
	/** Greenfield 按 Turn binding 的精确模型解析凭证，避免切模后读取另一个模型的凭证。 */
	readonly resolveApiKey?: (model: Model<Api>) => Promise<string | undefined> | string | undefined;
}

export class AgentCoreTurnEngine implements TurnEnginePort {
	private readonly options: AgentCoreTurnEngineOptions;

	constructor(options: AgentCoreTurnEngineOptions) {
		this.options = options;
	}

	async *execute(request: TurnEngineRequest): AsyncIterable<TurnEngineEvent> {
		request.signal.throwIfAborted();
		const stream = agentLoopContinue(
			{
				systemPrompt: composeModelCallSystemPrompt(request.snapshot),
				messages: [...request.messages],
				tools: [...request.snapshot.tools.values()].map((tool) => this.toAgentTool(tool, request)),
			},
			this.createConfig(request),
			request.signal,
			this.options.streamFn,
		);
		let finalAssistantMessage: Extract<Message, { role: "assistant" }> | undefined;

		for await (const event of stream) {
			if (event.type === "context_checkpoint") {
				yield {
					type: "context_checkpoint",
					request: {
						reason: event.request.reason,
						messages: event.request.messages.filter(isRuntimeMessage),
						assistantMessage: event.request.assistantMessage,
						recoveryAttempt: event.request.recoveryAttempt,
						complete: (result) => {
							event.request.complete(toAgentCheckpointResult(result));
						},
						fail: (error) => {
							event.request.fail(error);
						},
					},
				};
				continue;
			}
			const observation = mapAgentCoreEventToObservation(event);
			if (observation) {
				yield { type: "observation", observation };
			}
			if (event.type !== "message_end" || !isRuntimeMessage(event.message)) continue;
			if (event.message.role === "assistant") {
				finalAssistantMessage = event.message;
			}
			yield {
				type: "message",
				message: event.message,
			};
		}

		if (!finalAssistantMessage) {
			throw turnProtocolError("agent-core completed without an assistant message");
		}

		yield {
			type: "completed",
			stopReason: finalAssistantMessage.stopReason,
		};
	}

	private createConfig(request: TurnEngineRequest): AgentLoopConfig {
		const inputQueue = request.inputQueue;
		const contextTransformer = request.snapshot.modelCallContextTransformer;
		const model = request.modelBinding?.model ?? this.options.model;
		if (!model) {
			throw turnProtocolError("Agent Core turn requires a model binding");
		}
		const getApiKey = this.options.resolveApiKey
			? (_provider: string) => this.options.resolveApiKey?.(model)
			: this.options.getApiKey;
		return {
			...this.options.streamOptions,
			...(request.modelBinding ? { reasoning: request.modelBinding.reasoning } : {}),
			model,
			sessionId: request.sessionId,
			getApiKey,
			convertToLlm: convertToLlm,
			contextCheckpoints: request.contextCheckpoints,
			transformContext: contextTransformer
				? async (messages, signal) => {
						const executionSignal = signal ?? request.signal;
						return [
							...(await contextTransformer.transform(
								{
									sessionId: request.sessionId,
									turnId: request.turnId,
									messages: messages.filter(isRuntimeMessage),
									modelBinding: request.modelBinding ?? {
										model,
										reasoning: this.options.streamOptions?.reasoning,
									},
								},
								executionSignal,
							)),
						];
					}
				: undefined,
			getSteeringMessages: inputQueue ? async () => [...inputQueue.takeSteering()] : undefined,
			getContinuationMessages:
				inputQueue || request.snapshot.continuationPolicy
					? async (messages, signal) => {
							const executionSignal = signal ?? request.signal;
							const policyMessages =
								(await request.snapshot.continuationPolicy?.collect({
									sessionId: request.sessionId,
									turnId: request.turnId,
									signal: executionSignal,
									messages: messages.filter(isRuntimeMessage),
									modelBinding: request.modelBinding,
								})) ?? [];
							if (!inputQueue) return [...policyMessages];
							inputQueue.enqueueFollowUps(policyMessages);
							return [...inputQueue.takeFollowUps()];
						}
					: undefined,
			resolveCallContext: async (_context, signal) => {
				const executionSignal = signal ?? request.signal;
				const frame = await resolveModelCallFrame(request.snapshot, {
					sessionId: request.sessionId,
					turnId: request.turnId,
					signal: executionSignal,
					input: request.input,
					messages: _context.messages.filter(isRuntimeMessage),
					modelBinding: request.modelBinding ?? {
						model,
						reasoning: this.options.streamOptions?.reasoning,
					},
				});
				return {
					systemPrompt: composeModelCallSystemPrompt(frame),
					tools: [...frame.tools.values()].map((tool) => this.toAgentTool(tool, request)),
				};
			},
		};
	}

	private toAgentTool(
		tool: RuntimeToolDefinition,
		request: TurnEngineRequest,
	): AgentTool<ReturnType<typeof Type.Unsafe<Record<string, unknown>>>, unknown> {
		return {
			name: tool.name,
			label: tool.label,
			description: tool.description,
			parameters: Type.Unsafe<Record<string, unknown>>({ ...tool.inputSchema }),
			async execute(toolCallId, input, signal, onUpdate, context) {
				const executionSignal = signal ?? request.signal;
				executionSignal.throwIfAborted();
				const authorized = await request.snapshot.toolPolicy.authorize(
					{
						sessionId: request.sessionId,
						turnId: request.turnId,
						toolName: tool.name,
						input,
					},
					executionSignal,
				);
				if (!authorized) {
					throw new Error(`Tool execution denied by policy: ${tool.name}`);
				}

				try {
					const result = await tool.execute({
						sessionId: request.sessionId,
						turnId: request.turnId,
						toolCallId,
						input,
						messages: context?.messages?.filter(isRuntimeMessage),
						signal: executionSignal,
						onUpdate: onUpdate
							? (update) => {
									onUpdate(toAgentToolResult(update));
								}
							: undefined,
						reportPhase: context?.phase,
					});
					return toAgentToolResult(result);
				} catch (error) {
					if (error instanceof RuntimeToolExecutionError) {
						throw new AgentToolExecutionError(error.message, error.details, { cause: error });
					}
					throw error;
				}
			},
		};
	}
}

function toAgentCheckpointResult(
	result: TurnEngineContextCheckpointResult | undefined,
): AgentContextCheckpointResult | undefined {
	if (!result) return undefined;
	return {
		messages: result.messages,
		contextMessages: result.contextMessages,
		retry: result.retry,
	};
}

function mapAgentCoreEventToObservation(event: AgentEvent): RuntimeSessionObservationEvent | undefined {
	if (
		event.type === "agent_start" ||
		event.type === "agent_end" ||
		event.type === "turn_start" ||
		event.type === "turn_end"
	) {
		return { type: "lifecycle", phase: event.type, source: "runtime-core" };
	}
	if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
		return { type: "message.delta", delta: event.assistantMessageEvent.delta, source: "agent" };
	}
	if (event.type === "message_update" && event.assistantMessageEvent.type === "thinking_delta") {
		return { type: "thinking.delta", delta: event.assistantMessageEvent.delta, source: "agent" };
	}
	if (event.type === "message_update" && event.assistantMessageEvent.type === "toolcall_start") {
		const toolCall = event.assistantMessageEvent.partial.content[event.assistantMessageEvent.contentIndex];
		if (toolCall?.type !== "toolCall") return undefined;
		return {
			type: "toolcall.start",
			toolCallId: String(toolCall.id ?? ""),
			toolName: String(toolCall.name ?? ""),
			source: "agent",
		};
	}
	if (event.type === "tool_execution_start") {
		return {
			type: "tool.start",
			toolCallId: event.toolCallId,
			toolName: event.toolName,
			args: event.args,
			startedAt: event.startedAt,
			source: "tool",
		};
	}
	if (event.type === "tool_execution_update") {
		return {
			type: "tool.update",
			toolCallId: event.toolCallId,
			toolName: event.toolName,
			partialResult: event.partialResult,
			source: "tool",
		};
	}
	if (event.type === "tool_execution_phase") {
		return {
			type: "tool.phase",
			toolCallId: event.toolCallId,
			toolName: event.toolName,
			label: event.label,
			atMs: event.atMs,
			source: "tool",
		};
	}
	if (event.type === "tool_execution_end") {
		return {
			type: "tool.end",
			toolCallId: event.toolCallId,
			toolName: event.toolName,
			isError: event.isError,
			result: event.result,
			startedAt: event.startedAt,
			durationMs: event.durationMs,
			phases: event.phases,
			source: "tool",
		};
	}
	return undefined;
}

function convertToLlm(messages: AgentMessage[]): Message[] {
	return messages.filter(isRuntimeMessage);
}

function isRuntimeMessage(message: AgentMessage): message is Message {
	return (
		"role" in message && (message.role === "user" || message.role === "assistant" || message.role === "toolResult")
	);
}

function toAgentToolResult(result: RuntimeToolResult): {
	readonly content: [...RuntimeToolResult["content"]];
	readonly details: unknown;
} {
	return {
		content: [...result.content],
		details: result.details,
	};
}
