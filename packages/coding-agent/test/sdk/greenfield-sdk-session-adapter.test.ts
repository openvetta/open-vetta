import type { AgentMessage, ThinkingLevel } from "@vetta/agent-core";
import type { Api, Model } from "@vetta/ai";
import type {
	PromptRequest,
	RuntimeExecutionObservationEvent,
	RuntimeSessionExecutionObservation,
	RuntimeSessionState,
} from "@vetta/runtime-core";
import { describe, expect, it, vi } from "vitest";
import { GreenfieldSdkSessionAdapter } from "../../src/public-api/sdk/greenfield-sdk-session-adapter.js";
import type { GreenfieldSdkSessionRuntimePort } from "../../src/public-api/sdk/sdk-session-contract.js";

describe("Greenfield SDK session adapter", () => {
	it("maps prompt, queue, model and thinking controls onto the narrow Runtime port", async () => {
		const runtime = new FakeSdkRuntime();
		const session = new GreenfieldSdkSessionAdapter(runtime);
		const image = { type: "image" as const, data: "image-data", mimeType: "image/png" };

		await session.prompt("first", { images: [image], metadata: { source: "sdk" } });
		await session.steer("steer", [image]);
		await session.followUp("follow-up");
		await session.setModel({ provider: "openai", id: "model-id" } as Model<Api>);
		session.setThinkingLevel("high");

		expect(runtime.prompts).toEqual([
			{ text: "first", images: [image], metadata: { source: "sdk" } },
			{ text: "steer", images: [image], streamingBehavior: "steer" },
			{ text: "follow-up", streamingBehavior: "followUp" },
		]);
		expect(runtime.selectedModelKeys).toEqual(["openai/model-id"]);
		expect(runtime.thinkingLevels).toEqual(["high"]);
		expect(session.sessionId).toBe("sdk-session");
		expect(session.sessionFile).toBe("C:/sessions/sdk-session.jsonl");
		expect(session.isStreaming).toBe(false);
	});

	it("projects complete execution observations onto existing Agent events", () => {
		const runtime = new FakeSdkRuntime();
		const session = new GreenfieldSdkSessionAdapter(runtime);
		const eventTypes: string[] = [];
		session.subscribe((event) => eventTypes.push(event.type));

		runtime.emit({ type: "agent.start" });
		runtime.emit({ type: "turn.start" });
		runtime.emit({
			type: "tool.execution.start",
			toolCallId: "call-1",
			toolName: "read",
			args: { path: "README.md" },
			startedAt: 1,
		});
		runtime.emit({ type: "agent.end", messages: [] });

		expect(eventTypes).toEqual(["agent_start", "turn_start", "tool_execution_start", "agent_end"]);
	});

	it("isolates listeners and closes Runtime ownership exactly once", async () => {
		const runtime = new FakeSdkRuntime();
		const session = new GreenfieldSdkSessionAdapter(runtime);
		const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const observed: string[] = [];
		session.subscribe(() => {
			throw new Error("listener failed");
		});
		session.subscribe((event) => observed.push(event.type));

		runtime.emit({ type: "agent.start" });
		expect(observed).toEqual(["agent_start"]);
		expect(warning).toHaveBeenCalledOnce();

		await Promise.all([session.close(), session.close()]);
		expect(runtime.disposeCalls).toBe(1);
		expect(runtime.observers.size).toBe(0);
		await expect(session.prompt("closed")).rejects.toThrow("AgentSession is closed");
		warning.mockRestore();
	});

	it("keeps the session closed while allowing failed cleanup to be retried", async () => {
		const runtime = new FakeSdkRuntime();
		runtime.disposeFailures = 1;
		const session = new GreenfieldSdkSessionAdapter(runtime);

		await expect(session.close()).rejects.toThrow("runtime cleanup failed");
		await expect(session.prompt("closed")).rejects.toThrow("AgentSession is closed");
		await expect(session.close()).resolves.toBeUndefined();
		expect(runtime.disposeCalls).toBe(2);
	});
});

class FakeSdkRuntime implements GreenfieldSdkSessionRuntimePort {
	readonly sessionId = "sdk-session";
	readonly sessionPath = "C:/sessions/sdk-session.jsonl";
	readonly prompts: PromptRequest[] = [];
	readonly selectedModelKeys: string[] = [];
	readonly thinkingLevels: ThinkingLevel[] = [];
	readonly observers = new Set<(observation: RuntimeSessionExecutionObservation) => Promise<void> | void>();
	disposeCalls = 0;
	disposeFailures = 0;
	private readonly runtimeState: RuntimeSessionState = {
		model: undefined,
		thinkingLevel: "medium",
		isStreaming: false,
		messageCount: 0,
		contextPercent: null,
		contextWindow: 0,
		activeToolNames: [],
	};

	async prompt(request: PromptRequest): Promise<void> {
		this.prompts.push(request);
	}

	async abort(): Promise<void> {}

	readState(): RuntimeSessionState {
		return this.runtimeState;
	}

	readMessages(): readonly AgentMessage[] {
		return [];
	}

	async selectModel(modelKey: string): Promise<void> {
		this.selectedModelKeys.push(modelKey);
	}

	setThinkingLevel(level: ThinkingLevel): void {
		this.thinkingLevels.push(level);
	}

	subscribeExecutionObservation(
		handler: (observation: RuntimeSessionExecutionObservation) => Promise<void> | void,
	): () => void {
		this.observers.add(handler);
		return () => this.observers.delete(handler);
	}

	async dispose(): Promise<void> {
		this.disposeCalls++;
		if (this.disposeFailures > 0) {
			this.disposeFailures--;
			throw new Error("runtime cleanup failed");
		}
	}

	emit(event: RuntimeExecutionObservationEvent): void {
		for (const observer of this.observers) {
			void observer({ turnId: "turn-1", event, timestamp: 1 });
		}
	}
}
