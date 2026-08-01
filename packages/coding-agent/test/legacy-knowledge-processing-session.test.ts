import type { Api, Model } from "@vetta/ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLegacyKnowledgeProcessingSessionFactory } from "../src/composition/legacy-knowledge-processing-session.js";
import type { AgentSession, AgentSessionEvent } from "../src/core/agent-session.js";
import type { ModelRegistry } from "../src/core/model-registry.js";

const createAgentSessionMock = vi.hoisted(() => vi.fn());

vi.mock("../src/core/sdk.js", () => ({
	createAgentSession: createAgentSessionMock,
}));

interface Fixture {
	readonly session: AgentSession;
	readonly modelRegistry: ModelRegistry;
	readonly model: Model<Api>;
	readonly listeners: Set<(event: AgentSessionEvent) => void>;
	readonly loadRemoteModels: ReturnType<typeof vi.fn>;
	readonly findModel: ReturnType<typeof vi.fn>;
	readonly setModel: ReturnType<typeof vi.fn>;
	readonly setThinkingLevel: ReturnType<typeof vi.fn>;
	readonly createTodos: ReturnType<typeof vi.fn>;
	readonly lockTodos: ReturnType<typeof vi.fn>;
	readonly prompt: ReturnType<typeof vi.fn>;
	readonly abort: ReturnType<typeof vi.fn>;
	readonly close: ReturnType<typeof vi.fn>;
}

function createFixture(): Fixture {
	const listeners = new Set<(event: AgentSessionEvent) => void>();
	const model = { id: "processing-model" } as Model<Api>;
	const loadRemoteModels = vi.fn(async () => {});
	const findModel = vi.fn(() => model);
	const modelRegistry = {
		loadRemoteModels,
		find: findModel,
	} as unknown as ModelRegistry;
	const setModel = vi.fn(async () => {});
	const setThinkingLevel = vi.fn();
	const createTodos = vi.fn();
	const lockTodos = vi.fn();
	const prompt = vi.fn(async () => {
		const usageEvent = {
			type: "message_end",
			message: {
				usage: {
					input: 10,
					output: 20,
					cacheRead: 3,
					cacheWrite: 4,
					cost: { total: 0.25 },
				},
			},
		} as unknown as AgentSessionEvent;
		const endEvent = { type: "agent_end" } as AgentSessionEvent;
		for (const listener of [...listeners]) listener(usageEvent);
		for (const listener of [...listeners]) listener(endEvent);
	});
	const abort = vi.fn(async () => {});
	const close = vi.fn(async () => {});
	const session = {
		modelRegistry,
		todoStore: {
			createMany: createTodos,
			lock: lockTodos,
		},
		setModel,
		setThinkingLevel,
		subscribe(listener: (event: AgentSessionEvent) => void) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		prompt,
		abort,
		close,
	} as unknown as AgentSession;
	return {
		session,
		modelRegistry,
		model,
		listeners,
		loadRemoteModels,
		findModel,
		setModel,
		setThinkingLevel,
		createTodos,
		lockTodos,
		prompt,
		abort,
		close,
	};
}

beforeEach(() => {
	createAgentSessionMock.mockReset();
});

describe("Legacy knowledge processing session adapter", () => {
	it("preserves model, todo, usage, prompt, abort, and disposal behavior", async () => {
		const fixture = createFixture();
		createAgentSessionMock.mockResolvedValue({ session: fixture.session });
		const factory = createLegacyKnowledgeProcessingSessionFactory({
			getModelRegistry: () => fixture.modelRegistry,
		});
		const writer = { write: vi.fn() };
		const session = await factory.create({
			cwd: "C:/workspace",
			sessionDir: "C:/sessions",
			modelKey: "provider/processing-model",
			reasoningLevel: "high",
			todoItems: ["first", "second"],
			writer,
			appendSystemPrompt: "knowledge instructions",
			env: { TMPDIR: "C:/tmp" },
		});

		expect(createAgentSessionMock).toHaveBeenCalledWith(
			expect.objectContaining({
				cwd: "C:/workspace",
				modelRegistry: fixture.modelRegistry,
				scenario: "kb-processing",
				appendSystemPrompt: "knowledge instructions",
				enableBackgroundTasks: false,
				env: { TMPDIR: "C:/tmp" },
				customTools: [expect.objectContaining({ name: "kb_write_page" })],
			}),
		);
		expect(fixture.createTodos).toHaveBeenCalledWith(["first", "second"]);
		expect(fixture.lockTodos).toHaveBeenCalledWith("scene");

		const usages: unknown[] = [];
		const unsubscribeUsage = session.subscribeUsage((usage) => usages.push(usage));
		await session.run("process this batch");

		expect(fixture.loadRemoteModels).toHaveBeenCalledOnce();
		expect(fixture.findModel).toHaveBeenCalledWith("provider", "processing-model");
		expect(fixture.setModel).toHaveBeenCalledWith(fixture.model);
		expect(fixture.setThinkingLevel).toHaveBeenCalledWith("high");
		expect(fixture.prompt).toHaveBeenCalledWith("process this batch");
		expect(usages).toEqual([
			{
				inputTokens: 10,
				outputTokens: 20,
				cacheReadTokens: 3,
				cacheWriteTokens: 4,
				costTotal: 0.25,
			},
		]);

		unsubscribeUsage();
		await session.abort();
		await session.dispose();
		expect(fixture.abort).toHaveBeenCalledOnce();
		expect(fixture.close).toHaveBeenCalledOnce();
		expect(fixture.listeners).toHaveLength(0);
	});

	it("fails with the existing explicit error when the configured model is unavailable", async () => {
		const fixture = createFixture();
		fixture.findModel.mockReturnValue(undefined);
		createAgentSessionMock.mockResolvedValue({ session: fixture.session });
		const session = await createLegacyKnowledgeProcessingSessionFactory({
			getModelRegistry: () => fixture.modelRegistry,
		}).create({
			cwd: "C:/workspace",
			sessionDir: "C:/sessions",
			modelKey: "provider/missing",
			todoItems: [],
			writer: { write: vi.fn() },
			appendSystemPrompt: "knowledge instructions",
			env: {},
		});

		await expect(session.run("process")).rejects.toThrow(
			"知识库加工模型未找到：provider/missing（请在知识库设置里重新选择加工模型）",
		);
		expect(fixture.prompt).not.toHaveBeenCalled();
	});

	it("settles when prompt completes even if the legacy agent_end event is absent", async () => {
		const fixture = createFixture();
		fixture.prompt.mockResolvedValue(undefined);
		createAgentSessionMock.mockResolvedValue({ session: fixture.session });
		const session = await createLegacyKnowledgeProcessingSessionFactory({
			getModelRegistry: () => fixture.modelRegistry,
		}).create({
			cwd: "C:/workspace",
			sessionDir: "C:/sessions",
			modelKey: "provider/processing-model",
			todoItems: [],
			writer: { write: vi.fn() },
			appendSystemPrompt: "knowledge instructions",
			env: {},
		});

		await expect(session.run("process")).resolves.toBeUndefined();
		expect(fixture.listeners).toHaveLength(0);
	});
});
