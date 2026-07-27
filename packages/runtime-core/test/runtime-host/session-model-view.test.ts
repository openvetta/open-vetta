import type { Api, Model } from "@vetta/ai";
import { describe, expect, it, vi } from "vitest";
import { LegacyRuntimeSessionModelView, type RuntimeSession, type RuntimeSessionModelView } from "../../src/index.js";
import { resolvePeripheralCandidates } from "../../src/runtime-host/peripheral-tasks.js";

function createModel(provider: string, id: string): Model<Api> {
	return { api: "openai-responses", provider, id, input: ["text"] } as Model<Api>;
}

describe("RuntimeSessionModelView", () => {
	it("adapts the legacy current model, available snapshot, refresh and API key lookup", async () => {
		const current = createModel("legacy-view", "current");
		const available = [createModel("legacy-view", "available")];
		const refresh = vi.fn();
		const getAvailable = vi.fn(() => available);
		const getApiKey = vi.fn(async () => "api-key");
		const session = {
			model: current,
			modelRegistry: { refresh, getAvailable, getApiKey },
		} as unknown as RuntimeSession;
		const view = new LegacyRuntimeSessionModelView(session);

		view.refreshAvailableModels();
		const snapshot = view.readAvailableModels();

		expect(view.readCurrentModel()).toBe(current);
		expect(refresh).toHaveBeenCalledOnce();
		expect(snapshot).toEqual(available);
		expect(snapshot).not.toBe(available);
		await expect(view.resolveApiKey(available[0])).resolves.toBe("api-key");
		expect(getApiKey).toHaveBeenCalledWith(available[0]);
	});

	it("keeps current-model priority, deduplication, available order and the three-candidate limit", async () => {
		const current = createModel("stage43-priority", "current");
		const second = createModel("stage43-priority", "second");
		const third = createModel("stage43-priority", "third");
		const fourth = createModel("stage43-priority", "fourth");
		const view = createView(current, [current, second, third, fourth], async (model) => `key:${model.id}`);

		const candidates = await resolvePeripheralCandidates(view);

		expect(candidates.map((candidate) => candidate.key)).toEqual([
			"stage43-priority/current",
			"stage43-priority/second",
			"stage43-priority/third",
		]);
		expect(view.refreshAvailableModels).toHaveBeenCalledOnce();
		expect(view.resolveApiKey).toHaveBeenCalledTimes(3);
	});

	it("skips candidates without credentials while preserving later available candidates", async () => {
		const current = createModel("stage43-credentials", "current");
		const available = createModel("stage43-credentials", "available");
		const view = createView(current, [available], async (model) =>
			model.id === "available" ? "available-key" : undefined,
		);

		const candidates = await resolvePeripheralCandidates(view);

		expect(candidates).toHaveLength(1);
		expect(candidates[0]).toMatchObject({ key: "stage43-credentials/available", apiKey: "available-key" });
	});
});

function createView(
	current: Model<Api> | undefined,
	available: readonly Model<Api>[],
	resolve: (model: Model<Api>) => Promise<string | undefined>,
): RuntimeSessionModelView & {
	refreshAvailableModels: ReturnType<typeof vi.fn>;
	resolveApiKey: ReturnType<typeof vi.fn>;
} {
	return {
		readCurrentModel: () => current,
		refreshAvailableModels: vi.fn(),
		readAvailableModels: () => available,
		resolveApiKey: vi.fn(resolve),
	};
}
