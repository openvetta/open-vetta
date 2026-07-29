import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Api, Model } from "@vetta/ai";
import { AuthStorage, ModelRegistry } from "@vetta/coding-agent";
import { createLegacyRuntimeHostOptions } from "@vetta/coding-agent/runtime-host";
import type { CodingAgentModelRegistrySource } from "@vetta/coding-agent/runtime-host/greenfield";
import { RuntimeHost } from "@vetta/runtime-core";
import { afterEach, describe, expect, it } from "vitest";
import { DesktopGreenfieldRuntimeBackendPool } from "./desktop-greenfield-runtime-backend-pool.js";

interface RuntimeFixture {
	readonly runtime: RuntimeHost;
	readonly dispose: () => Promise<void>;
}

describe("Desktop RuntimeHost Legacy/Greenfield differential gate", () => {
	const directories: string[] = [];
	const fixtures: RuntimeFixture[] = [];

	afterEach(async () => {
		for (const fixture of fixtures.splice(0).reverse()) await fixture.dispose();
		for (const directory of directories.splice(0).reverse()) {
			await rm(directory, { recursive: true, force: true });
		}
	});

	for (const backend of ["legacy", "greenfield"] as const) {
		it(`${backend} preserves the common Desktop host lifecycle contract`, async () => {
			const cwd = await temporaryDirectory(`desktop-${backend}-differential-workspace-`);
			const sessionDir = await temporaryDirectory(`desktop-${backend}-differential-sessions-`);
			const agentStateDir = await temporaryDirectory(`desktop-${backend}-differential-agent-`);
			const fixture = createRuntimeFixture(backend, agentStateDir);
			fixtures.push(fixture);

			const created = await fixture.runtime.createSession({
				cwd,
				sessionDir,
				model: MODEL,
				thinkingLevel: "medium",
				scenario: "batch",
				executionMode: "full-access",
				enableBackgroundTasks: false,
				includeAgentSkills: false,
			});
			const sessionPath = fixture.runtime.getSessionPath(created.sessionId);
			if (!sessionPath) throw new Error(`${backend} did not expose a session path`);

			expect(fixture.runtime.getState(created.sessionId)).toMatchObject({
				sessionId: created.sessionId,
				model: MODEL,
				thinkingLevel: "medium",
				executionMode: "full-access",
				scenario: "batch",
				isStreaming: false,
				messageCount: 0,
			});
			expect(fixture.runtime.getMessages(created.sessionId)).toEqual([]);
			expect(fixture.runtime.getFullHistory(created.sessionId)).toEqual([]);

			await fixture.runtime.updateSettings(created.sessionId, {
				thinkingLevel: "low",
				steeringMode: "all",
				followUpMode: "one-at-a-time",
			});
			expect(fixture.runtime.getState(created.sessionId).thinkingLevel).toBe("low");

			await fixture.runtime.disposeSession(created.sessionId);
			await fixture.runtime.disposeSession(created.sessionId);
			const resumed = await fixture.runtime.createSession({
				cwd,
				sessionDir,
				sessionPath,
				model: MODEL,
				scenario: "batch",
				executionMode: "full-access",
				enableBackgroundTasks: false,
				includeAgentSkills: false,
			});
			expect(fixture.runtime.getSessionPath(resumed.sessionId)).toBe(sessionPath);
			expect(fixture.runtime.getFullHistory(resumed.sessionId)).toEqual([]);
		});
	}

	function createRuntimeFixture(backend: "legacy" | "greenfield", agentStateDir: string): RuntimeFixture {
		if (backend === "legacy") {
			const registry = new ModelRegistry(
				AuthStorage.create(join(agentStateDir, "auth.json")),
				join(agentStateDir, "models.json"),
			);
			const runtime = new RuntimeHost(
				createLegacyRuntimeHostOptions({
					getDefaultExecutionMode: () => "full-access",
					modelRegistry: registry,
				}),
			);
			return {
				runtime,
				dispose: () => runtime.disposeAllSessions(),
			};
		}

		const pool = new DesktopGreenfieldRuntimeBackendPool({
			compositionDefaults: {
				modelRegistry: modelRegistry(),
				initialModel: MODEL,
				initialThinkingLevel: "off",
			},
		});
		const runtime = new RuntimeHost({
			sessionBackend: pool,
			getDefaultExecutionMode: () => "full-access",
		});
		return {
			runtime,
			dispose: async () => {
				try {
					await runtime.disposeAllSessions();
				} finally {
					await pool.dispose();
				}
			},
		};
	}

	async function temporaryDirectory(prefix: string): Promise<string> {
		const directory = await mkdtemp(join(tmpdir(), prefix));
		directories.push(directory);
		return directory;
	}
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
	id: "desktop-differential-model",
	name: "Desktop Differential Model",
	api: "openai-responses",
	provider: "test",
	baseUrl: "https://example.test",
	reasoning: true,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 8_000,
	maxTokens: 1_000,
};
