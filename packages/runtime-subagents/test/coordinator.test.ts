import { describe, expect, it, vi } from "vitest";
import {
	type SubagentChildEvent,
	type SubagentChildFactory,
	type SubagentChildHandle,
	SubagentCoordinator,
	type SubagentSnapshot,
	type SubagentSpawnRequest,
	type SubagentTypeDefinition,
	SubagentTypeRegistry,
} from "../src/index.js";

interface TestProfile {
	readonly kind: "explorer" | "workflow";
}

describe("SubagentCoordinator", () => {
	it("validates a batch before reserving any child", () => {
		const fixture = createFixture();

		expect(() => fixture.coordinator.spawnMany([request("valid_task"), request("Invalid")])).toThrow(
			"Invalid task_name",
		);
		expect(fixture.coordinator.list()).toEqual([]);
	});

	it("queues overflow in FIFO order and refills the active slot", async () => {
		const fixture = createFixture({ maxConcurrent: 1 });
		const snapshots = fixture.coordinator.spawnMany([request("first"), request("second"), request("third")]);

		expect(snapshots.map(({ status }) => status)).toEqual(["pending", "queued", "queued"]);
		await waitUntil(() => fixture.coordinator.get("first")?.status === "running");
		fixture.children[0]?.complete("first result");
		await waitUntil(
			() =>
				fixture.coordinator.get("first")?.status === "completed" &&
				fixture.coordinator.get("second")?.status === "running",
		);

		expect(fixture.coordinator.get("first")).toMatchObject({ status: "completed" });
		expect(fixture.coordinator.get("second")).toMatchObject({ status: "running" });
		expect(fixture.coordinator.get("third")).toMatchObject({ status: "queued" });
	});

	it("resolves id, task name and path to the same child", async () => {
		const fixture = createFixture();
		const snapshot = await fixture.coordinator.spawn(request("lookup"));

		expect(fixture.coordinator.get(snapshot.id)).toEqual(fixture.coordinator.get("lookup"));
		expect(fixture.coordinator.get("/root/lookup")).toEqual(fixture.coordinator.get("lookup"));
	});

	it("lets wait claim a generation before automatic notification", async () => {
		const onNotify = vi.fn();
		const fixture = createFixture({ onNotify, notificationDelayMs: 10 });
		await fixture.coordinator.spawn(request("claimed"));
		fixture.children[0]?.complete("done");
		const result = await fixture.coordinator.wait({ targets: ["claimed"], timeoutMs: 1_000 });
		await delay(20);

		expect(result.agents).toEqual([expect.objectContaining({ taskName: "claimed", finalText: "done" })]);
		expect(onNotify).not.toHaveBeenCalled();
		expect((await fixture.coordinator.wait({ targets: ["claimed"] })).agents).toEqual([]);
	});

	it("interrupts and resumes the same transcript through follow-up", async () => {
		const fixture = createFixture();
		await fixture.coordinator.spawn(request("resumable"));

		expect(fixture.coordinator.interrupt("resumable")).toMatchObject({
			status: "interrupted",
			generation: 1,
		});
		const resumed = await fixture.coordinator.followUp("resumable", "continue");

		expect(resumed).toMatchObject({ status: "running", task: "continue" });
		expect(fixture.children).toHaveLength(1);
		expect(fixture.children[0]?.prompts.at(-1)).toBe("continue");
	});

	it("keeps interrupted workflows when a new batch clears completed peers", async () => {
		const fixture = createFixture();
		await fixture.coordinator.spawn(request("completed", "workflow"));
		fixture.children[0]?.complete("done");
		await waitUntil(() => fixture.coordinator.get("completed")?.status === "completed");
		await fixture.coordinator.spawn(request("interrupted", "workflow"));
		fixture.coordinator.interrupt("interrupted");

		fixture.coordinator.spawnMany([request("new_scope", "workflow")]);

		expect(fixture.coordinator.get("completed")).toBeUndefined();
		expect(fixture.coordinator.get("interrupted")).toMatchObject({ status: "interrupted" });
		expect(fixture.coordinator.get("new_scope")).toBeDefined();
	});

	it("reuses a completed workflow name when the next batch replaces completed peers", async () => {
		const fixture = createFixture();
		await fixture.coordinator.spawn(request("same_scope", "workflow"));
		fixture.children[0]?.complete("done");
		await waitUntil(() => fixture.coordinator.get("same_scope")?.status === "completed");

		const [replacement] = fixture.coordinator.spawnMany([request("same_scope", "workflow")]);

		expect(replacement).toMatchObject({ taskName: "same_scope", agentType: "workflow" });
		expect(fixture.coordinator.list()).toHaveLength(1);
	});
});

function createFixture(
	options: {
		readonly maxConcurrent?: number;
		readonly notificationDelayMs?: number;
		readonly onNotify?: (payload: { readonly agents: readonly SubagentSnapshot[]; readonly text: string }) => void;
	} = {},
) {
	const children: TestChild[] = [];
	let nextId = 0;
	const factory: SubagentChildFactory<TestProfile> = {
		async create() {
			nextId += 1;
			const child = new TestChild(`child-${nextId}`);
			children.push(child);
			return child;
		},
	};
	const registry = new SubagentTypeRegistry<TestProfile>().register(type("explorer")).register(type("workflow"));
	const coordinator = new SubagentCoordinator({
		factory,
		typeRegistry: registry,
		parentSessionId: "root-session",
		maxConcurrent: options.maxConcurrent,
		notificationDelayMs: options.notificationDelayMs,
		onNotify: options.onNotify,
		idGenerator: { next: () => `reservation-${nextId + 1}` },
	});
	return { coordinator, children };
}

class TestChild implements SubagentChildHandle {
	readonly sessionFile: string;
	readonly prompts: string[] = [];
	private readonly listeners = new Set<(event: SubagentChildEvent) => void>();
	private streaming = false;
	private finalText: string | undefined;
	private resolvePrompt: (() => void) | undefined;

	constructor(readonly sessionId: string) {
		this.sessionFile = `.subagents/${sessionId}.conversation.jsonl`;
	}

	async prompt(text: string): Promise<void> {
		this.prompts.push(text);
		this.streaming = true;
		this.emit({ type: "agent_start" });
		await new Promise<void>((resolve) => {
			this.resolvePrompt = resolve;
		});
	}

	async sendMessage(): Promise<void> {}

	async followUp(text: string): Promise<void> {
		await this.prompt(text);
	}

	abort(): void {
		this.streaming = false;
		this.resolvePrompt?.();
		this.resolvePrompt = undefined;
	}

	async waitForIdle(): Promise<void> {
		await waitUntil(() => !this.streaming);
	}

	isStreaming(): boolean {
		return this.streaming;
	}

	getLastAssistantText(): string | undefined {
		return this.finalText;
	}

	dispose(): void {
		this.abort();
		this.listeners.clear();
	}

	subscribe(listener: (event: SubagentChildEvent) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	complete(text: string): void {
		this.finalText = text;
		this.streaming = false;
		this.emit({ type: "agent_end" });
		this.resolvePrompt?.();
		this.resolvePrompt = undefined;
	}

	private emit(event: SubagentChildEvent): void {
		for (const listener of this.listeners) listener(event);
	}
}

function request(taskName: string, agentType = "explorer"): SubagentSpawnRequest {
	return { taskName, agentType, message: `work on ${taskName}` };
}

function type(kind: TestProfile["kind"]): SubagentTypeDefinition<TestProfile> {
	return {
		id: kind,
		label: kind,
		description: `${kind} agent`,
		profile: { kind },
	};
}

async function waitUntil(predicate: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		if (predicate()) return;
		await delay(1);
	}
	throw new Error("Condition was not reached");
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
