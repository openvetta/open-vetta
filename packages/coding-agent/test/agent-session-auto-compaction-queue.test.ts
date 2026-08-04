import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Agent } from "@vetta/agent-core";
import type { Api, Model } from "@vetta/ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentSession } from "../src/core/agent-session.js";
import { AuthStorage } from "../src/core/auth-storage.js";
import { ModelRegistry } from "../src/core/model-registry.js";
import { SessionManager } from "../src/core/session-manager/index.js";
import { SettingsManager } from "../src/core/settings-manager.js";
import { createTestResourceLoader } from "./utilities.js";

const TEST_MODEL: Model<Api> = {
	id: "model",
	name: "Model",
	api: "openai-responses",
	provider: "test",
	baseUrl: "https://example.test",
	reasoning: false,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 8_000,
	maxTokens: 1_000,
};

vi.mock("../src/compaction/index.js", () => ({
	CompactionCircuitBreaker: class {
		consecutiveFailures = 0;
		canAttempt = () => true;
		recordFailure = () => {
			this.consecutiveFailures++;
		};
		recordSuccess = () => {
			this.consecutiveFailures = 0;
		};
	},
	calculateContextTokens: () => 0,
	collectEntriesForBranchSummary: () => ({ entries: [], commonAncestorId: null }),
	compact: async (preparation: { firstKeptEntryId: string }) => ({
		summary: "compacted",
		firstKeptEntryId: preparation.firstKeptEntryId,
		tokensBefore: 100,
		details: {},
	}),
	estimateContextTokens: () => ({ tokens: 0, usageTokens: 0, trailingTokens: 0, lastUsageIndex: -1 }),
	fingerprintCompactionPrefix: () => undefined,
	generateBranchSummary: async () => ({ summary: "", aborted: false, readFiles: [], modifiedFiles: [] }),
	isPrefireCacheValid: () => false,
	microcompact: <T>(messages: T): T => messages,
	prepareCompaction: (entries: Array<{ id: string }>) => ({ firstKeptEntryId: entries[0]?.id }),
	shouldCompact: () => false,
	shouldPrefire: () => false,
}));

describe("AgentSession auto-compaction queue resume", () => {
	let session: AgentSession;
	let tempDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `pi-auto-compaction-queue-${Date.now()}`);
		mkdirSync(tempDir, { recursive: true });
		vi.useFakeTimers();

		const agent = new Agent({
			initialState: {
				model: TEST_MODEL,
				systemPrompt: "Test",
				tools: [],
			},
		});

		const sessionManager = SessionManager.inMemory();
		const settingsManager = SettingsManager.create(tempDir, tempDir);
		const authStorage = AuthStorage.create(join(tempDir, "auth.json"));
		authStorage.setRuntimeApiKey("anthropic", "test-key");
		const modelRegistry = new ModelRegistry(authStorage, tempDir);
		vi.spyOn(modelRegistry, "getApiKey").mockResolvedValue("test-key");

		session = new AgentSession({
			agent,
			sessionManager,
			settingsManager,
			cwd: tempDir,
			modelRegistry,
			resourceLoader: createTestResourceLoader(),
		});
	});

	afterEach(() => {
		session.dispose();
		vi.useRealTimers();
		vi.restoreAllMocks();
		if (tempDir && existsSync(tempDir)) {
			rmSync(tempDir, { recursive: true });
		}
	});

	it("should resume after threshold compaction when only agent-level queued messages exist", async () => {
		let compactionError: string | undefined;
		let compactionResult: unknown;
		let compactionAborted: boolean | undefined;
		session.subscribe((event) => {
			if (event.type === "auto_compaction_end") {
				compactionError = event.errorMessage;
				compactionResult = event.result;
				compactionAborted = event.aborted;
			}
		});
		session.sessionManager.appendMessage({ role: "user", content: "Persisted message", timestamp: Date.now() });
		session.agent.followUp({
			role: "custom",
			customType: "test",
			content: [{ type: "text", text: "Queued custom" }],
			display: false,
			timestamp: Date.now(),
		});

		expect(session.pendingMessageCount).toBe(0);
		expect(session.agent.hasQueuedMessages()).toBe(true);
		expect(session.model).toBeDefined();

		const continueSpy = vi.spyOn(session.agent, "continue").mockResolvedValue();

		const compaction = (
			session as unknown as {
				_compaction: {
					_continuationTimers: Set<ReturnType<typeof setTimeout>>;
					runAutoCompaction: (reason: "overflow" | "threshold", willRetry: boolean) => Promise<void>;
				};
			}
		)._compaction;

		await compaction.runAutoCompaction("threshold", false);
		expect(compactionError).toBeUndefined();
		expect(compactionAborted).toBe(false);
		expect(compactionResult).toBeDefined();
		expect(compaction._continuationTimers.size).toBe(1);
		await vi.advanceTimersByTimeAsync(100);
		expect(continueSpy).toHaveBeenCalledTimes(1);
	});
});
