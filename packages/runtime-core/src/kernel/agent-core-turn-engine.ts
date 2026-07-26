import {
	type AgentLoopConfig,
	type AgentMessage,
	type AgentTool,
	agentLoopContinue,
	type StreamFn,
} from "@vetta/agent-core";
import { type Api, type Message, type Model, type SimpleStreamOptions, Type } from "@vetta/ai";
import type {
	RuntimeToolDefinition,
	RuntimeToolResult,
	TurnEngineEvent,
	TurnEnginePort,
	TurnEngineRequest,
} from "./contracts.js";
import { turnProtocolError } from "./errors.js";

export interface AgentCoreTurnEngineOptions {
	readonly model: Model<Api>;
	readonly streamOptions?: Omit<SimpleStreamOptions, "sessionId" | "signal">;
	readonly streamFn?: StreamFn;
	readonly getApiKey?: AgentLoopConfig["getApiKey"];
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
				systemPrompt: composeSystemPrompt(request),
				messages: [...request.messages],
				tools: [...request.snapshot.tools.values()].map((tool) => this.toAgentTool(tool, request)),
			},
			this.createConfig(request),
			request.signal,
			this.options.streamFn,
		);
		let finalAssistantMessage: Extract<Message, { role: "assistant" }> | undefined;

		for await (const event of stream) {
			if (event.type !== "message_end" || !isRuntimeMessage(event.message)) continue;
			if (event.message.role === "user") continue;
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
		return {
			...this.options.streamOptions,
			model: this.options.model,
			sessionId: request.sessionId,
			getApiKey: this.options.getApiKey,
			convertToLlm: convertToLlm,
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

				const result = await tool.execute({
					sessionId: request.sessionId,
					turnId: request.turnId,
					toolCallId,
					input,
					signal: executionSignal,
					onUpdate: onUpdate
						? (update) => {
								onUpdate(toAgentToolResult(update));
							}
						: undefined,
					reportPhase: context?.phase,
				});
				return toAgentToolResult(result);
			},
		};
	}
}

function composeSystemPrompt(request: TurnEngineRequest): string {
	return request.snapshot.instructions
		.map(({ content }) => content)
		.filter((content) => content.length > 0)
		.join("\n\n");
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
