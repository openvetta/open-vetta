import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Api, Model } from "@vetta/ai";
import type { CodingAgentModelRegistrySource } from "@vetta/coding-agent/runtime-host/greenfield";
import type { ConversationOwnershipManager } from "@vetta/runtime-storage/conversation";
import { describe, expect, it } from "vitest";
import { createGreenfieldRuntimeComposition } from "../src/greenfield-runtime-composition.js";

describe("Greenfield ownership cleanup retry", () => {
	it("retries a failed Session ownership release during final Runtime cleanup", async () => {
		const conversationDir = await mkdtemp(join(tmpdir(), "greenfield-ownership-cleanup-"));
		let releaseAttempts = 0;
		const ownershipManager: ConversationOwnershipManager = {
			acquire: async (conversationPath) => ({
				conversationPath,
				lockPath: `${conversationPath}.owner.lock`,
				holder: {
					token: "owner",
					pid: 1,
					hostname: "test",
					acquiredAt: new Date(0).toISOString(),
				},
				release: async () => {
					releaseAttempts++;
					if (releaseAttempts === 1) throw new Error("transient ownership release failure");
				},
			}),
		};
		const composition = await createGreenfieldRuntimeComposition({
			conversationDir,
			conversationOwnershipManager: ownershipManager,
			modelRegistry: modelRegistry(),
			initialModel: MODEL,
			initialThinkingLevel: "off",
			enableSubagents: false,
			activation: { mode: "explicit", toolNames: [] },
			createSystemPromptOptionsResolver: () => () => ({ customPrompt: "test", scenario: "cli" }),
		});

		try {
			const session = await composition.backend.create({ sessionId: "session-1" });
			await expect(session.dispose()).rejects.toThrow("transient ownership release failure");
			await expect(composition.dispose()).resolves.toBeUndefined();
			expect(releaseAttempts).toBe(2);
		} finally {
			await composition.dispose().catch(() => undefined);
			await rm(conversationDir, { force: true, recursive: true });
		}
	});
});

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

const MODEL: Model<Api> = {
	id: "recorded-model",
	name: "Recorded Model",
	api: "openai-responses",
	provider: "test",
	baseUrl: "https://example.test",
	reasoning: true,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 8_000,
	maxTokens: 1_000,
};
