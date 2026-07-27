import { describe, expect, it, vi } from "vitest";
import { LegacyRuntimeSessionModelController, type RuntimeSession } from "../../src/index.js";

function createModelSessionDouble(options: { currentModel?: { provider: string; id: string } } = {}) {
	const availableModel = { provider: "available", id: "model/with/slash" };
	const fallbackModel = { provider: "fallback", id: "fallback-model" };
	const getAvailable = vi.fn(() => [availableModel]);
	const find = vi.fn((): typeof fallbackModel | undefined => fallbackModel);
	const setServerToken = vi.fn();
	const loadRemoteModels = vi.fn(async () => {});
	const setModel = vi.fn(async () => {});
	const setThinkingLevel = vi.fn();
	const session = {
		model: options.currentModel,
		modelRegistry: { getAvailable, find, setServerToken, loadRemoteModels },
		setModel,
		setThinkingLevel,
	} as unknown as RuntimeSession;

	return {
		controller: new LegacyRuntimeSessionModelController(session),
		availableModel,
		fallbackModel,
		getAvailable,
		find,
		setServerToken,
		loadRemoteModels,
		setModel,
		setThinkingLevel,
	};
}

describe("LegacyRuntimeSessionModelController", () => {
	it("prefers available models and preserves slash-delimited model IDs", async () => {
		const model = createModelSessionDouble();

		await model.controller.selectModel("available/model/with/slash", "always");

		expect(model.setModel).toHaveBeenCalledWith(model.availableModel);
		expect(model.find).not.toHaveBeenCalled();
	});

	it("falls back to registry.find when the available list does not contain the explicit selection", async () => {
		const model = createModelSessionDouble();
		model.getAvailable.mockReturnValue([]);

		await model.controller.selectModel("fallback/fallback-model", "always");

		expect(model.find).toHaveBeenCalledWith("fallback", "fallback-model");
		expect(model.setModel).toHaveBeenCalledWith(model.fallbackModel);
	});

	it("keeps the current model when no registry match exists", async () => {
		const model = createModelSessionDouble();
		model.getAvailable.mockReturnValue([]);
		model.find.mockReturnValue(undefined);

		await model.controller.selectModel("missing/model", "always");

		expect(model.setModel).not.toHaveBeenCalled();
	});

	it("distinguishes prompt if-changed selection from settings always selection", async () => {
		const model = createModelSessionDouble({ currentModel: { provider: "available", id: "model/with/slash" } });

		await model.controller.selectModel("available/model/with/slash", "if-changed");
		expect(model.setModel).not.toHaveBeenCalled();

		await model.controller.selectModel("available/model/with/slash", "always");
		expect(model.setModel).toHaveBeenCalledWith(model.availableModel);
	});

	it("delegates thinking level and refreshes auth before loading remote models", async () => {
		const model = createModelSessionDouble();

		model.controller.setThinkingLevel("high");
		await model.controller.refreshAuth("server-token");

		expect(model.setThinkingLevel).toHaveBeenCalledWith("high");
		expect(model.setServerToken).toHaveBeenCalledWith("server-token");
		expect(model.loadRemoteModels).toHaveBeenCalledOnce();
		expect(model.setServerToken.mock.invocationCallOrder[0]).toBeLessThan(
			model.loadRemoteModels.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
		);
	});
});
