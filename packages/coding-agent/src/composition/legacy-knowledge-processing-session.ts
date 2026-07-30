import type { ThinkingLevel } from "@vetta/agent-core";
import type { AgentSessionEvent } from "../core/agent-session.js";
import type { ToolDefinition } from "../core/extensions/types.js";
import type { WritePageRequest, WritePageResult } from "../core/knowledge/writer.js";
import type { ModelRegistry } from "../core/model-registry.js";
import { type CreateAgentSessionOptions, createAgentSession } from "../core/sdk.js";
import { SessionManager } from "../core/session-manager/index.js";
import { createKbWritePageTool } from "../core/tools/kb-write-page/index.js";

export interface KnowledgeProcessingUsage {
	readonly inputTokens: number;
	readonly outputTokens: number;
	readonly cacheReadTokens: number;
	readonly cacheWriteTokens: number;
	readonly costTotal: number;
}

export interface KnowledgeProcessingPageWriter {
	write(request: WritePageRequest, now: string): Promise<WritePageResult>;
}

export interface KnowledgeProcessingSession {
	run(prompt: string): Promise<void>;
	abort(): Promise<void>;
	subscribeUsage(listener: (usage: KnowledgeProcessingUsage) => void): () => void;
	dispose(): void;
}

export interface KnowledgeProcessingSessionRequest {
	readonly cwd: string;
	readonly sessionDir: string;
	readonly modelKey: string;
	readonly reasoningLevel?: ThinkingLevel;
	readonly todoItems: readonly string[];
	readonly writer: KnowledgeProcessingPageWriter;
	readonly appendSystemPrompt: string;
	readonly env: Record<string, string>;
}

export interface KnowledgeProcessingSessionFactory {
	create(request: KnowledgeProcessingSessionRequest): Promise<KnowledgeProcessingSession>;
}

export interface LegacyKnowledgeProcessingSessionFactoryOptions {
	readonly getModelRegistry: () => ModelRegistry;
}

/**
 * Preserves the existing AgentSession-backed knowledge processor behind a
 * narrow product port. Greenfield implementations can satisfy the same port
 * without exposing AgentSession internals to Desktop.
 */
export function createLegacyKnowledgeProcessingSessionFactory(
	options: LegacyKnowledgeProcessingSessionFactoryOptions,
): KnowledgeProcessingSessionFactory {
	return {
		async create(request) {
			const modelRegistry = options.getModelRegistry();
			const createOptions: CreateAgentSessionOptions = {
				cwd: request.cwd,
				sessionManager: SessionManager.create(request.cwd, request.sessionDir),
				modelRegistry,
				scenario: "kb-processing",
				customTools: [createKbWritePageTool(undefined, request.writer) as unknown as ToolDefinition],
				appendSystemPrompt: request.appendSystemPrompt,
				enableBackgroundTasks: false,
				env: request.env,
			};
			const { session } = await createAgentSession(createOptions);
			if (request.todoItems.length > 0) {
				session.todoStore.createMany([...request.todoItems]);
				session.todoStore.lock("scene");
			}
			return {
				run: async (prompt) => {
					await applyProcessingModel(session, request.modelKey, request.reasoningLevel);
					await waitForCompletion(session, prompt);
				},
				abort: () => session.abort(),
				subscribeUsage: (listener) =>
					session.subscribe((event) => {
						if (event.type !== "message_end") return;
						const usage = readUsage(event.message);
						if (usage) listener(usage);
					}),
				dispose: () => session.dispose(),
			};
		},
	};
}

async function applyProcessingModel(
	session: Awaited<ReturnType<typeof createAgentSession>>["session"],
	modelKey: string,
	reasoningLevel: ThinkingLevel | undefined,
): Promise<void> {
	const slash = modelKey.indexOf("/");
	if (slash <= 0) return;
	const provider = modelKey.slice(0, slash);
	const modelId = modelKey.slice(slash + 1);
	await session.modelRegistry.loadRemoteModels();
	const model = session.modelRegistry.find(provider, modelId);
	if (!model) {
		throw new Error(`知识库加工模型未找到：${modelKey}（请在知识库设置里重新选择加工模型）`);
	}
	await session.setModel(model);
	if (reasoningLevel) session.setThinkingLevel(reasoningLevel);
}

function waitForCompletion(
	session: Awaited<ReturnType<typeof createAgentSession>>["session"],
	prompt: string,
): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		let settled = false;
		const finish = (fn: () => void) => {
			if (settled) return;
			settled = true;
			unsubscribe();
			fn();
		};
		const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
			if (event.type === "agent_end") finish(resolve);
		});
		session.prompt(prompt).then(
			() => finish(resolve),
			(error) => finish(() => reject(error)),
		);
	});
}

function readUsage(message: unknown): KnowledgeProcessingUsage | undefined {
	if (typeof message !== "object" || message === null || !("usage" in message)) return undefined;
	const usage = (message as { usage?: unknown }).usage;
	if (typeof usage !== "object" || usage === null) return undefined;
	const usageRecord = usage as Record<string, unknown>;
	const cost = usageRecord.cost;
	const costRecord = typeof cost === "object" && cost !== null ? (cost as Record<string, unknown>) : {};
	return {
		inputTokens: readFiniteNumber(usageRecord, "input"),
		outputTokens: readFiniteNumber(usageRecord, "output"),
		cacheReadTokens: readFiniteNumber(usageRecord, "cacheRead"),
		cacheWriteTokens: readFiniteNumber(usageRecord, "cacheWrite"),
		costTotal: readFiniteNumber(costRecord, "total"),
	};
}

function readFiniteNumber(record: Record<string, unknown>, key: string): number {
	const value = record[key];
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
