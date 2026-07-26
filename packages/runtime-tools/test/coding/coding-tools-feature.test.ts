import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AssistantMessage, type AssistantMessageEvent, EventStream, type Message, type Model } from "@vetta/ai";
import {
	AgentCoreTurnEngine,
	type AgentProfile,
	FeatureCompiler,
	type IdGenerator,
	PassthroughContextStrategy,
	type TurnEngineEvent,
} from "@vetta/runtime-core/kernel";
import { describe, expect, it } from "vitest";
import {
	CURRENT_TIME_TOOL_CATEGORY,
	CURRENT_TIME_TOOL_SCOPES,
	createCodingToolsFeature,
	createCurrentTimeTool,
	createCurrentTimeToolRegistration,
	createReadToolRegistration,
	READ_TOOL_CATEGORY,
	READ_TOOL_SCOPES,
	selectCodingToolsForScope,
} from "../../src/coding/index.js";

class SnapshotIdGenerator implements IdGenerator {
	next(scope: "snapshot" | "turn"): string {
		return `${scope}-1`;
	}
}

class RecordedAssistantStream extends EventStream<AssistantMessageEvent, AssistantMessage> {
	constructor(message: AssistantMessage) {
		super(
			(event) => event.type === "done" || event.type === "error",
			(event) => {
				if (event.type === "done") return event.message;
				if (event.type === "error") return event.error;
				throw new Error("Unexpected assistant event");
			},
		);
		queueMicrotask(() => {
			if (message.stopReason === "error" || message.stopReason === "aborted") {
				this.push({ type: "error", reason: message.stopReason, error: message });
				return;
			}
			this.push({
				type: "done",
				reason: message.stopReason,
				message,
			});
		});
	}
}

function model(): Model<"openai-responses"> {
	return {
		id: "recorded-model",
		name: "Recorded Model",
		api: "openai-responses",
		provider: "openai",
		baseUrl: "https://example.invalid",
		reasoning: false,
		input: ["text"],
		cost: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
		},
		contextWindow: 8_000,
		maxTokens: 1_000,
	};
}

function assistantMessage(
	content: AssistantMessage["content"],
	stopReason: AssistantMessage["stopReason"] = "stop",
): AssistantMessage {
	return {
		role: "assistant",
		content,
		api: "openai-responses",
		provider: "openai",
		model: "recorded-model",
		usage: {
			input: 1,
			output: 1,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 2,
			cost: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				total: 0,
			},
		},
		stopReason,
		timestamp: 2,
	};
}

function profile(now: () => Date, cwd = process.cwd()): AgentProfile {
	return {
		id: "coding",
		instructions: [],
		features: [
			createCodingToolsFeature({
				scope: "project",
				cwd,
				currentTime: { now },
			}),
		],
		contextStrategy: new PassthroughContextStrategy(),
		toolPolicy: {
			async authorize(_request, signal) {
				signal.throwIfAborted();
				return true;
			},
		},
		tokenBudget: 8_000,
		reservedOutputTokens: 1_000,
	};
}

async function compileSnapshot(now: () => Date, cwd = process.cwd()) {
	const compiler = new FeatureCompiler({
		idGenerator: new SnapshotIdGenerator(),
	});
	return compiler.compile(profile(now, cwd), new AbortController().signal);
}

async function collectEngineEvents(
	engine: AgentCoreTurnEngine,
	runtimeSnapshot: Awaited<ReturnType<typeof compileSnapshot>>["snapshot"],
): Promise<TurnEngineEvent[]> {
	const events: TurnEngineEvent[] = [];
	for await (const event of engine.execute({
		sessionId: "session-1",
		turnId: "turn-1",
		snapshot: runtimeSnapshot,
		messages: [
			{
				role: "user",
				content: "What time is it?",
				timestamp: 1,
			},
		],
		signal: new AbortController().signal,
	})) {
		events.push(event);
	}
	return events;
}

describe("greenfield coding tools feature", () => {
	it("keeps scenario exposure metadata outside the runtime tool definition", () => {
		const registration = createCurrentTimeToolRegistration();
		const readRegistration = createReadToolRegistration(process.cwd());
		const projectOnlyRegistration = {
			...registration,
			scopeUse: ["project"] as const,
		};

		expect(registration.category).toBe(CURRENT_TIME_TOOL_CATEGORY);
		expect(registration.scopeUse).toEqual(CURRENT_TIME_TOOL_SCOPES);
		expect(selectCodingToolsForScope([registration], "project").map(({ name }) => name)).toEqual(["current_time"]);
		expect(selectCodingToolsForScope([projectOnlyRegistration], "conversation")).toEqual([]);
		expect(registration.tool).not.toHaveProperty("scopeUse");
		expect(registration.tool).not.toHaveProperty("category");
		expect(readRegistration.category).toBe(READ_TOOL_CATEGORY);
		expect(readRegistration.scopeUse).toEqual(READ_TOOL_SCOPES);
		expect(readRegistration.tool).not.toHaveProperty("scopeUse");
		expect(readRegistration.tool).not.toHaveProperty("category");
	});

	it("provides a deterministic TypeBox-backed current time tool", async () => {
		const tool = createCurrentTimeTool({
			now: () => new Date(2026, 6, 26, 14, 30, 45),
		});

		const result = await tool.execute({
			sessionId: "session-1",
			turnId: "turn-1",
			toolCallId: "tool-call-1",
			input: {
				description: "Check the local time",
			},
			signal: new AbortController().signal,
		});

		expect(result).toEqual({
			content: [{ type: "text", text: "2026-07-26 14:30:45" }],
			details: { timestamp: "2026-07-26 14:30:45" },
		});
		expect(tool.inputSchema).toMatchObject({
			type: "object",
			properties: {
				description: {
					type: "string",
					maxLength: 100,
				},
			},
		});
		expect(tool.inputSchema).not.toHaveProperty("additionalProperties");
	});

	it("preserves the legacy current-time behavior for an already-aborted direct call", async () => {
		let invocationCount = 0;
		const tool = createCurrentTimeTool({
			now() {
				invocationCount += 1;
				return new Date(2026, 6, 26, 14, 30, 45);
			},
		});
		const controller = new AbortController();
		controller.abort();

		const result = await tool.execute({
			sessionId: "session-1",
			turnId: "turn-1",
			toolCallId: "tool-call-1",
			input: {},
			signal: controller.signal,
		});

		expect(invocationCount).toBe(1);
		expect(result.content).toEqual([{ type: "text", text: "2026-07-26 14:30:45" }]);
	});

	it("runs the compiled feature through the real agent-core tool loop", async () => {
		const compiled = await compileSnapshot(() => new Date(2026, 6, 26, 14, 30, 45));
		const responses = [
			assistantMessage([{ type: "toolCall", id: "tool-call-1", name: "current_time", arguments: {} }], "toolUse"),
			assistantMessage([{ type: "text", text: "It is 14:30:45." }]),
		];
		let responseIndex = 0;
		const engine = new AgentCoreTurnEngine({
			model: model(),
			streamFn: () => {
				const response = responses[responseIndex];
				responseIndex += 1;
				if (!response) throw new Error("Missing recorded response");
				return new RecordedAssistantStream(response);
			},
		});

		const events = await collectEngineEvents(engine, compiled.snapshot);
		const messages = events
			.filter((event): event is Extract<TurnEngineEvent, { type: "message" }> => event.type === "message")
			.map(({ message }) => message);
		const toolResult = messages.find(
			(message): message is Extract<Message, { role: "toolResult" }> => message.role === "toolResult",
		);

		expect(compiled.snapshot.tools.has("current_time")).toBe(true);
		expect(compiled.snapshot.tools.has("read")).toBe(true);
		expect(toolResult).toMatchObject({
			isError: false,
			content: [{ type: "text", text: "2026-07-26 14:30:45" }],
			details: { timestamp: "2026-07-26 14:30:45" },
		});
		expect(events.at(-1)).toEqual({
			type: "completed",
			stopReason: "stop",
		});
		await compiled.dispose();
	});

	it("runs read through the compiled feature and real agent-core tool loop", async () => {
		const directory = mkdtempSync(join(tmpdir(), "runtime-tools-feature-read-"));
		try {
			writeFileSync(join(directory, "message.txt"), "hello from read");
			const compiled = await compileSnapshot(() => new Date(2026, 6, 26, 14, 30, 45), directory);
			const responses = [
				assistantMessage(
					[
						{
							type: "toolCall",
							id: "tool-call-read",
							name: "read",
							arguments: { path: "message.txt" },
						},
					],
					"toolUse",
				),
				assistantMessage([{ type: "text", text: "Read complete." }]),
			];
			let responseIndex = 0;
			const engine = new AgentCoreTurnEngine({
				model: model(),
				streamFn: () => {
					const response = responses[responseIndex];
					responseIndex += 1;
					if (!response) throw new Error("Missing recorded response");
					return new RecordedAssistantStream(response);
				},
			});

			const events = await collectEngineEvents(engine, compiled.snapshot);
			const toolResult = events.find(
				(
					event,
				): event is Extract<TurnEngineEvent, { type: "message" }> & {
					readonly message: Extract<Message, { role: "toolResult" }>;
				} => event.type === "message" && event.message.role === "toolResult",
			)?.message;

			expect(toolResult).toMatchObject({
				isError: false,
				content: [{ type: "text", text: expect.stringMatching(/^1:[0-9a-z]{4}→hello from read$/) }],
			});
			await compiled.dispose();
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it("preserves the legacy schema behavior for additional model arguments", async () => {
		let invocationCount = 0;
		const compiled = await compileSnapshot(() => {
			invocationCount += 1;
			return new Date(2026, 6, 26, 14, 30, 45);
		});
		const responses = [
			assistantMessage(
				[
					{
						type: "toolCall",
						id: "tool-call-1",
						name: "current_time",
						arguments: { unexpected: true },
					},
				],
				"toolUse",
			),
			assistantMessage([{ type: "text", text: "It is 14:30:45." }]),
		];
		let responseIndex = 0;
		const engine = new AgentCoreTurnEngine({
			model: model(),
			streamFn: () => {
				const response = responses[responseIndex];
				responseIndex += 1;
				if (!response) throw new Error("Missing recorded response");
				return new RecordedAssistantStream(response);
			},
		});

		const events = await collectEngineEvents(engine, compiled.snapshot);
		const toolResult = events.find(
			(
				event,
			): event is Extract<TurnEngineEvent, { type: "message" }> & {
				readonly message: Extract<Message, { role: "toolResult" }>;
			} => event.type === "message" && event.message.role === "toolResult",
		)?.message;

		expect(invocationCount).toBe(1);
		expect(toolResult).toMatchObject({
			isError: false,
			content: [{ type: "text", text: "2026-07-26 14:30:45" }],
		});
		await compiled.dispose();
	});
});
