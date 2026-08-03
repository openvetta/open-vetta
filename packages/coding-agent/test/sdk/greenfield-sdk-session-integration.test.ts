import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Api, AssistantMessage, AssistantMessageEvent, Model } from "@vetta/ai";
import { EventStream } from "@vetta/ai";
import { afterEach, describe, expect, it } from "vitest";
import type { CodingAgentModelRegistrySource } from "../../src/adapters/runtime-core/greenfield.js";
import { createGreenfieldRuntimeComposition } from "../../src/composition/greenfield-runtime-composition.js";
import type { GreenfieldRuntimeComposition } from "../../src/composition/greenfield-runtime-composition-contract.js";
import { bindGreenfieldSdkSessionRuntime } from "../../src/public-api/sdk/greenfield-sdk-runtime-binding.js";
import { GreenfieldSdkSessionAdapter } from "../../src/public-api/sdk/greenfield-sdk-session-adapter.js";

describe("Greenfield SDK session integration", () => {
	const temporaryDirectories: string[] = [];
	const compositions: GreenfieldRuntimeComposition[] = [];

	afterEach(async () => {
		await Promise.all(compositions.splice(0).map((composition) => composition.dispose()));
		await Promise.all(
			temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
		);
	});

	it("runs the SDK core facade through the real Greenfield composition", async () => {
		const conversationDir = await temporaryDirectory("greenfield-sdk-conversations-");
		const workspace = await temporaryDirectory("greenfield-sdk-workspace-");
		const composition = await createGreenfieldRuntimeComposition({
			conversationDir,
			cwd: workspace,
			modelRegistry: modelRegistry(),
			initialModel: MODEL,
			initialThinkingLevel: "off",
			enableSubagents: false,
			activation: { mode: "explicit", toolNames: [] },
			streamFn: () => new RecordedAssistantStream(assistantMessage("Greenfield SDK response")),
		});
		compositions.push(composition);
		const runtimeSession = await composition.backend.create({
			sessionId: "sdk-integration",
			includeAgentSkills: false,
		});
		const session = new GreenfieldSdkSessionAdapter(bindGreenfieldSdkSessionRuntime(runtimeSession));
		const eventTypes: string[] = [];
		session.subscribe((event) => eventTypes.push(event.type));

		await session.prompt("Run through the SDK facade");

		expect(session.messages.map(({ role }) => role)).toEqual(["user", "assistant"]);
		expect(session.model).toEqual(MODEL);
		expect(session.thinkingLevel).toBe("off");
		expect(eventTypes).toEqual([
			"agent_start",
			"turn_start",
			"message_start",
			"message_end",
			"message_start",
			"message_end",
			"turn_end",
			"agent_end",
		]);
		await session.close();
	});

	async function temporaryDirectory(prefix: string): Promise<string> {
		const directory = await mkdtemp(join(tmpdir(), prefix));
		temporaryDirectories.push(directory);
		return directory;
	}
});

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
			this.push({ type: "done", reason: message.stopReason, message });
		});
	}
}

function modelRegistry(): CodingAgentModelRegistrySource {
	return {
		refresh() {},
		getAvailable: () => [MODEL],
		find: (provider, modelId) => (provider === MODEL.provider && modelId === MODEL.id ? MODEL : undefined),
		getApiKey: async () => "test-key",
		setServerToken() {},
		loadRemoteModels: async () => undefined,
	};
}

function assistantMessage(text: string): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
		api: MODEL.api,
		provider: MODEL.provider,
		model: MODEL.id,
		usage: {
			input: 1,
			output: 1,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 2,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: 2,
	};
}

const MODEL: Model<Api> = {
	id: "sdk-recorded-model",
	name: "SDK Recorded Model",
	api: "openai-responses",
	provider: "test",
	baseUrl: "https://example.test",
	reasoning: true,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 8_000,
	maxTokens: 1_000,
};
