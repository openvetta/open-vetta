import { Type } from "@sinclair/typebox";
import {
	type AssistantMessage,
	type AssistantMessageEvent,
	EventStream,
	type Message,
	type Model,
	type UserMessage,
} from "@vetta/ai";
import { describe, expect, it } from "vitest";
import { agentLoop, agentLoopContinue } from "../src/agent-loop.js";
import type { AgentContext, AgentEvent, AgentLoopConfig, AgentMessage, AgentTool } from "../src/types.js";

// Mock stream for testing - mimics MockAssistantStream
class MockAssistantStream extends EventStream<AssistantMessageEvent, AssistantMessage> {
	constructor() {
		super(
			(event) => event.type === "done" || event.type === "error",
			(event) => {
				if (event.type === "done") return event.message;
				if (event.type === "error") return event.error;
				throw new Error("Unexpected event type");
			},
		);
	}
}

function createUsage() {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};
}

function createModel(): Model<"openai-responses"> {
	return {
		id: "mock",
		name: "mock",
		api: "openai-responses",
		provider: "openai",
		baseUrl: "https://example.invalid",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 8192,
		maxTokens: 2048,
	};
}

function createAssistantMessage(
	content: AssistantMessage["content"],
	stopReason: AssistantMessage["stopReason"] = "stop",
): AssistantMessage {
	return {
		role: "assistant",
		content,
		api: "openai-responses",
		provider: "openai",
		model: "mock",
		usage: createUsage(),
		stopReason,
		timestamp: Date.now(),
	};
}

function createUserMessage(text: string): UserMessage {
	return {
		role: "user",
		content: text,
		timestamp: Date.now(),
	};
}

// Simple identity converter for tests - just passes through standard messages
function identityConverter(messages: AgentMessage[]): Message[] {
	return messages.filter((m) => m.role === "user" || m.role === "assistant" || m.role === "toolResult") as Message[];
}

describe("agentLoop with AgentMessage", () => {
	it("should emit events with AgentMessage types", async () => {
		const context: AgentContext = {
			systemPrompt: "You are helpful.",
			messages: [],
			tools: [],
		};

		const userPrompt: AgentMessage = createUserMessage("Hello");

		const config: AgentLoopConfig = {
			model: createModel(),
			convertToLlm: identityConverter,
		};

		const streamFn = () => {
			const stream = new MockAssistantStream();
			queueMicrotask(() => {
				const message = createAssistantMessage([{ type: "text", text: "Hi there!" }]);
				stream.push({ type: "done", reason: "stop", message });
			});
			return stream;
		};

		const events: AgentEvent[] = [];
		const stream = agentLoop([userPrompt], context, config, undefined, streamFn);

		for await (const event of stream) {
			events.push(event);
		}

		const messages = await stream.result();

		// Should have user message and assistant message
		expect(messages.length).toBe(2);
		expect(messages[0].role).toBe("user");
		expect(messages[1].role).toBe("assistant");

		// Verify event sequence
		const eventTypes = events.map((e) => e.type);
		expect(eventTypes).toContain("agent_start");
		expect(eventTypes).toContain("turn_start");
		expect(eventTypes).toContain("message_start");
		expect(eventTypes).toContain("message_end");
		expect(eventTypes).toContain("turn_end");
		expect(eventTypes).toContain("agent_end");
	});

	it("passes the current conversation and cancellation signal to the continuation provider", async () => {
		const controller = new AbortController();
		const continuationContexts: string[][] = [];
		let continuationDelivered = false;
		let callIndex = 0;
		const config: AgentLoopConfig = {
			model: createModel(),
			convertToLlm: identityConverter,
			getContinuationMessages: async (messages, signal) => {
				expect(signal).toBe(controller.signal);
				continuationContexts.push(messages.map(({ role }) => role));
				if (continuationDelivered) return [];
				continuationDelivered = true;
				return [createUserMessage("continue")];
			},
		};
		const stream = agentLoop(
			[createUserMessage("start")],
			{ systemPrompt: "", messages: [], tools: [] },
			config,
			controller.signal,
			() => {
				const response = new MockAssistantStream();
				const text = callIndex === 0 ? "first" : "second";
				callIndex += 1;
				queueMicrotask(() => {
					response.push({
						type: "done",
						reason: "stop",
						message: createAssistantMessage([{ type: "text", text }]),
					});
				});
				return response;
			},
		);

		for await (const _event of stream) {
			// consume
		}

		expect(callIndex).toBe(2);
		expect(continuationContexts).toEqual([
			["user", "assistant"],
			["user", "assistant", "user", "assistant"],
		]);
	});

	it("should handle custom message types via convertToLlm", async () => {
		// Create a custom message type
		interface CustomNotification {
			role: "notification";
			text: string;
			timestamp: number;
		}

		const notification: CustomNotification = {
			role: "notification",
			text: "This is a notification",
			timestamp: Date.now(),
		};

		const context: AgentContext = {
			systemPrompt: "You are helpful.",
			messages: [notification as unknown as AgentMessage], // Custom message in context
			tools: [],
		};

		const userPrompt: AgentMessage = createUserMessage("Hello");

		let convertedMessages: Message[] = [];
		const config: AgentLoopConfig = {
			model: createModel(),
			convertToLlm: (messages) => {
				// Filter out notifications, convert rest
				convertedMessages = messages
					.filter((m) => (m as { role: string }).role !== "notification")
					.filter((m) => m.role === "user" || m.role === "assistant" || m.role === "toolResult") as Message[];
				return convertedMessages;
			},
		};

		const streamFn = () => {
			const stream = new MockAssistantStream();
			queueMicrotask(() => {
				const message = createAssistantMessage([{ type: "text", text: "Response" }]);
				stream.push({ type: "done", reason: "stop", message });
			});
			return stream;
		};

		const events: AgentEvent[] = [];
		const stream = agentLoop([userPrompt], context, config, undefined, streamFn);

		for await (const event of stream) {
			events.push(event);
		}

		// The notification should have been filtered out in convertToLlm
		expect(convertedMessages.length).toBe(1); // Only user message
		expect(convertedMessages[0].role).toBe("user");
	});

	it("should apply transformContext before convertToLlm", async () => {
		const context: AgentContext = {
			systemPrompt: "You are helpful.",
			messages: [
				createUserMessage("old message 1"),
				createAssistantMessage([{ type: "text", text: "old response 1" }]),
				createUserMessage("old message 2"),
				createAssistantMessage([{ type: "text", text: "old response 2" }]),
			],
			tools: [],
		};

		const userPrompt: AgentMessage = createUserMessage("new message");

		let transformedMessages: AgentMessage[] = [];
		let convertedMessages: Message[] = [];

		const config: AgentLoopConfig = {
			model: createModel(),
			transformContext: async (messages) => {
				// Keep only last 2 messages (prune old ones)
				transformedMessages = messages.slice(-2);
				return transformedMessages;
			},
			convertToLlm: (messages) => {
				convertedMessages = messages.filter(
					(m) => m.role === "user" || m.role === "assistant" || m.role === "toolResult",
				) as Message[];
				return convertedMessages;
			},
		};

		const streamFn = () => {
			const stream = new MockAssistantStream();
			queueMicrotask(() => {
				const message = createAssistantMessage([{ type: "text", text: "Response" }]);
				stream.push({ type: "done", reason: "stop", message });
			});
			return stream;
		};

		const stream = agentLoop([userPrompt], context, config, undefined, streamFn);

		for await (const _ of stream) {
			// consume
		}

		// transformContext should have been called first, keeping only last 2
		expect(transformedMessages.length).toBe(2);
		// Then convertToLlm receives the pruned messages
		expect(convertedMessages.length).toBe(2);
	});

	it("should handle tool calls and results", async () => {
		const toolSchema = Type.Object({ value: Type.String() });
		const executed: string[] = [];
		const tool: AgentTool<typeof toolSchema, { value: string }> = {
			name: "echo",
			label: "Echo",
			description: "Echo tool",
			parameters: toolSchema,
			async execute(_toolCallId, params) {
				executed.push(params.value);
				return {
					content: [{ type: "text", text: `echoed: ${params.value}` }],
					details: { value: params.value },
				};
			},
		};

		const context: AgentContext = {
			systemPrompt: "",
			messages: [],
			tools: [tool],
		};

		const userPrompt: AgentMessage = createUserMessage("echo something");

		const config: AgentLoopConfig = {
			model: createModel(),
			convertToLlm: identityConverter,
		};

		let callIndex = 0;
		const streamFn = () => {
			const stream = new MockAssistantStream();
			queueMicrotask(() => {
				if (callIndex === 0) {
					// First call: return tool call
					const message = createAssistantMessage(
						[{ type: "toolCall", id: "tool-1", name: "echo", arguments: { value: "hello" } }],
						"toolUse",
					);
					stream.push({ type: "done", reason: "toolUse", message });
				} else {
					// Second call: return final response
					const message = createAssistantMessage([{ type: "text", text: "done" }]);
					stream.push({ type: "done", reason: "stop", message });
				}
				callIndex++;
			});
			return stream;
		};

		const events: AgentEvent[] = [];
		const stream = agentLoop([userPrompt], context, config, undefined, streamFn);

		for await (const event of stream) {
			events.push(event);
		}

		// Tool should have been executed
		expect(executed).toEqual(["hello"]);

		// Should have tool execution events
		const toolStart = events.find((e) => e.type === "tool_execution_start");
		const toolEnd = events.find((e) => e.type === "tool_execution_end");
		expect(toolStart).toBeDefined();
		expect(toolEnd).toBeDefined();
		if (toolEnd?.type === "tool_execution_end") {
			expect(toolEnd.isError).toBe(false);
		}
	});

	it("ends after an active tool resolves an aborted turn", async () => {
		const controller = new AbortController();
		const toolSchema = Type.Object({});
		const tool: AgentTool<typeof toolSchema, Record<string, never>> = {
			name: "wait",
			label: "Wait",
			description: "Wait for cancellation",
			parameters: toolSchema,
			async execute() {
				controller.abort();
				return {
					content: [{ type: "text", text: "cancelled" }],
					details: {},
				};
			},
		};
		let modelCalls = 0;
		const events: AgentEvent[] = [];
		const stream = agentLoop(
			[createUserMessage("wait")],
			{ systemPrompt: "", messages: [], tools: [tool] },
			{ model: createModel(), convertToLlm: identityConverter },
			controller.signal,
			() => {
				modelCalls += 1;
				const response = new MockAssistantStream();
				queueMicrotask(() => {
					response.push({
						type: "done",
						reason: "toolUse",
						message: createAssistantMessage(
							[{ type: "toolCall", id: "tool-1", name: "wait", arguments: {} }],
							"toolUse",
						),
					});
				});
				return response;
			},
		);

		for await (const event of stream) {
			events.push(event);
		}

		expect(modelCalls).toBe(1);
		expect(events.at(-1)?.type).toBe("agent_end");
		expect((await stream.result()).map(({ role }) => role)).toEqual(["user", "assistant", "toolResult"]);
	});

	it("should inject queued messages and skip remaining tool calls", async () => {
		const toolSchema = Type.Object({ value: Type.String() });
		const executed: string[] = [];
		const tool: AgentTool<typeof toolSchema, { value: string }> = {
			name: "echo",
			label: "Echo",
			description: "Echo tool",
			parameters: toolSchema,
			async execute(_toolCallId, params) {
				executed.push(params.value);
				return {
					content: [{ type: "text", text: `ok:${params.value}` }],
					details: { value: params.value },
				};
			},
		};

		const context: AgentContext = {
			systemPrompt: "",
			messages: [],
			tools: [tool],
		};

		const userPrompt: AgentMessage = createUserMessage("start");
		const queuedUserMessage: AgentMessage = createUserMessage("interrupt");

		let queuedDelivered = false;
		let callIndex = 0;
		let sawInterruptInContext = false;

		const config: AgentLoopConfig = {
			model: createModel(),
			convertToLlm: identityConverter,
			getSteeringMessages: async () => {
				// Return steering message after first tool executes
				if (executed.length === 1 && !queuedDelivered) {
					queuedDelivered = true;
					return [queuedUserMessage];
				}
				return [];
			},
		};

		const events: AgentEvent[] = [];
		const stream = agentLoop([userPrompt], context, config, undefined, (_model, ctx, _options) => {
			// Check if interrupt message is in context on second call
			if (callIndex === 1) {
				sawInterruptInContext = ctx.messages.some(
					(m) => m.role === "user" && typeof m.content === "string" && m.content === "interrupt",
				);
			}

			const mockStream = new MockAssistantStream();
			queueMicrotask(() => {
				if (callIndex === 0) {
					// First call: return two tool calls
					const message = createAssistantMessage(
						[
							{ type: "toolCall", id: "tool-1", name: "echo", arguments: { value: "first" } },
							{ type: "toolCall", id: "tool-2", name: "echo", arguments: { value: "second" } },
						],
						"toolUse",
					);
					mockStream.push({ type: "done", reason: "toolUse", message });
				} else {
					// Second call: return final response
					const message = createAssistantMessage([{ type: "text", text: "done" }]);
					mockStream.push({ type: "done", reason: "stop", message });
				}
				callIndex++;
			});
			return mockStream;
		});

		for await (const event of stream) {
			events.push(event);
		}

		// Only first tool should have executed
		expect(executed).toEqual(["first"]);

		// Second tool should be skipped
		const toolEnds = events.filter(
			(e): e is Extract<AgentEvent, { type: "tool_execution_end" }> => e.type === "tool_execution_end",
		);
		expect(toolEnds.length).toBe(2);
		expect(toolEnds[0].isError).toBe(false);
		expect(toolEnds[1].isError).toBe(true);
		if (toolEnds[1].result.content[0]?.type === "text") {
			expect(toolEnds[1].result.content[0].text).toContain("Skipped due to queued user message");
		}

		// Queued message should appear in events
		const queuedMessageEvent = events.find(
			(e) =>
				e.type === "message_start" &&
				e.message.role === "user" &&
				typeof e.message.content === "string" &&
				e.message.content === "interrupt",
		);
		expect(queuedMessageEvent).toBeDefined();

		// Interrupt message should be in context when second LLM call is made
		expect(sawInterruptInContext).toBe(true);
	});
});

describe("agentLoopContinue with AgentMessage", () => {
	it("should throw when context has no messages", () => {
		const context: AgentContext = {
			systemPrompt: "You are helpful.",
			messages: [],
			tools: [],
		};

		const config: AgentLoopConfig = {
			model: createModel(),
			convertToLlm: identityConverter,
		};

		expect(() => agentLoopContinue(context, config)).toThrow("Cannot continue: no messages in context");
	});

	it("should continue from existing context without emitting user message events", async () => {
		const userMessage: AgentMessage = createUserMessage("Hello");

		const context: AgentContext = {
			systemPrompt: "You are helpful.",
			messages: [userMessage],
			tools: [],
		};

		const config: AgentLoopConfig = {
			model: createModel(),
			convertToLlm: identityConverter,
		};

		const streamFn = () => {
			const stream = new MockAssistantStream();
			queueMicrotask(() => {
				const message = createAssistantMessage([{ type: "text", text: "Response" }]);
				stream.push({ type: "done", reason: "stop", message });
			});
			return stream;
		};

		const events: AgentEvent[] = [];
		const stream = agentLoopContinue(context, config, undefined, streamFn);

		for await (const event of stream) {
			events.push(event);
		}

		const messages = await stream.result();

		// Should only return the new assistant message (not the existing user message)
		expect(messages.length).toBe(1);
		expect(messages[0].role).toBe("assistant");

		// Should NOT have user message events (that's the key difference from agentLoop)
		const messageEndEvents = events.filter((e) => e.type === "message_end");
		expect(messageEndEvents.length).toBe(1);
		expect((messageEndEvents[0] as any).message.role).toBe("assistant");
	});

	it("should allow custom message types as last message (caller responsibility)", async () => {
		// Custom message that will be converted to user message by convertToLlm
		interface CustomMessage {
			role: "custom";
			text: string;
			timestamp: number;
		}

		const customMessage: CustomMessage = {
			role: "custom",
			text: "Hook content",
			timestamp: Date.now(),
		};

		const context: AgentContext = {
			systemPrompt: "You are helpful.",
			messages: [customMessage as unknown as AgentMessage],
			tools: [],
		};

		const config: AgentLoopConfig = {
			model: createModel(),
			convertToLlm: (messages) => {
				// Convert custom to user message
				return messages
					.map((m) => {
						if ((m as any).role === "custom") {
							return {
								role: "user" as const,
								content: (m as any).text,
								timestamp: m.timestamp,
							};
						}
						return m;
					})
					.filter((m) => m.role === "user" || m.role === "assistant" || m.role === "toolResult") as Message[];
			},
		};

		const streamFn = () => {
			const stream = new MockAssistantStream();
			queueMicrotask(() => {
				const message = createAssistantMessage([{ type: "text", text: "Response to custom message" }]);
				stream.push({ type: "done", reason: "stop", message });
			});
			return stream;
		};

		// Should not throw - the custom message will be converted to user message
		const stream = agentLoopContinue(context, config, undefined, streamFn);

		const events: AgentEvent[] = [];
		for await (const event of stream) {
			events.push(event);
		}

		const messages = await stream.result();
		expect(messages.length).toBe(1);
		expect(messages[0].role).toBe("assistant");
	});

	it("waits for a model-call context checkpoint before invoking the model", async () => {
		const preparedMessage = createUserMessage("prepared");
		let modelCalls = 0;
		const stream = agentLoopContinue(
			{
				systemPrompt: "You are helpful.",
				messages: [createUserMessage("original")],
				tools: [],
			},
			{
				model: createModel(),
				convertToLlm: identityConverter,
				contextCheckpoints: true,
			},
			undefined,
			(_model, context) => {
				modelCalls += 1;
				expect(context.messages).toEqual([preparedMessage]);
				const response = new MockAssistantStream();
				queueMicrotask(() => {
					response.push({
						type: "done",
						reason: "stop",
						message: createAssistantMessage([{ type: "text", text: "done" }]),
					});
				});
				return response;
			},
		);

		for await (const event of stream) {
			if (event.type !== "context_checkpoint") continue;
			if (event.request.reason === "model_call") {
				expect(modelCalls).toBe(0);
				event.request.complete({ messages: [preparedMessage] });
				continue;
			}
			expect(event.request.reason).toBe("assistant_result");
			expect(modelCalls).toBe(1);
			event.request.complete();
		}

		expect(modelCalls).toBe(1);
	});

	it("ends without calling the model when a context checkpoint fails", async () => {
		let modelCalls = 0;
		const stream = agentLoopContinue(
			{
				systemPrompt: "You are helpful.",
				messages: [createUserMessage("original")],
				tools: [],
			},
			{
				model: createModel(),
				convertToLlm: identityConverter,
				contextCheckpoints: true,
			},
			undefined,
			() => {
				modelCalls += 1;
				return new MockAssistantStream();
			},
		);

		for await (const event of stream) {
			if (event.type === "context_checkpoint") {
				event.request.fail(new Error("checkpoint failed"));
			}
		}

		expect(modelCalls).toBe(0);
		expect(await stream.result()).toEqual([]);
	});

	it("retries an assistant error only when the host checkpoint requests recovery", async () => {
		const initialMessage = createUserMessage("hello");
		const steeringMessage = createUserMessage("steer during recovery");
		const responses = [
			createAssistantMessage([{ type: "text", text: "overflow" }], "error"),
			createAssistantMessage([{ type: "text", text: "recovered" }]),
		];
		let modelCalls = 0;
		let steeringDelivered = false;
		const recoveryAttempts: number[] = [];
		const callRoles: string[][] = [];
		const stream = agentLoopContinue(
			{
				systemPrompt: "You are helpful.",
				messages: [initialMessage],
				tools: [],
			},
			{
				model: createModel(),
				convertToLlm: identityConverter,
				contextCheckpoints: true,
				getSteeringMessages: async () => {
					if (modelCalls !== 1 || steeringDelivered) return [];
					steeringDelivered = true;
					return [steeringMessage];
				},
			},
			undefined,
			(_model, context) => {
				callRoles.push(context.messages.map(({ role }) => role));
				const response = new MockAssistantStream();
				const message = responses[modelCalls];
				modelCalls += 1;
				if (!message) throw new Error("Missing response");
				queueMicrotask(() => {
					if (message.stopReason === "error") {
						response.push({ type: "error", reason: "error", error: message });
						return;
					}
					response.push({ type: "done", reason: "stop", message });
				});
				return response;
			},
		);

		for await (const event of stream) {
			if (event.type !== "context_checkpoint") continue;
			if (event.request.reason === "model_call" || event.request.reason === "assistant_result") {
				event.request.complete();
				continue;
			}
			recoveryAttempts.push(event.request.recoveryAttempt);
			event.request.complete({
				messages: [initialMessage],
				contextMessages: [initialMessage],
				retry: true,
			});
		}

		expect(modelCalls).toBe(2);
		expect(recoveryAttempts).toEqual([0]);
		expect(callRoles).toEqual([["user"], ["user", "user"]]);
		expect((await stream.result()).map(({ role }) => role)).toEqual(["assistant", "user", "assistant"]);
	});
});
