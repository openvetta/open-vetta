import type { ModelRegistry } from "@vetta/coding-agent/legacy/host-services";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDesktopKnowledgeProcessingSessionFactory } from "./processing-session-factory.js";

const factoryMocks = vi.hoisted(() => ({
	greenfield: vi.fn(() => ({ create: vi.fn() })),
	legacy: vi.fn(() => ({ create: vi.fn() })),
}));

vi.mock("@vetta/coding-agent/composition", () => ({
	createGreenfieldKnowledgeProcessingSessionFactory: factoryMocks.greenfield,
	createLegacyKnowledgeProcessingSessionFactory: factoryMocks.legacy,
}));

describe("createDesktopKnowledgeProcessingSessionFactory", () => {
	const modelRegistry = {} as ModelRegistry;
	const getModelRegistry = () => modelRegistry;

	beforeEach(() => {
		factoryMocks.greenfield.mockClear();
		factoryMocks.legacy.mockClear();
	});

	it("keeps the Legacy adapter selected by the default backend", () => {
		const factory = createDesktopKnowledgeProcessingSessionFactory({
			backend: "legacy",
			getModelRegistry,
		});

		expect(factory).toBe(factoryMocks.legacy.mock.results[0]?.value);
		expect(factoryMocks.legacy).toHaveBeenCalledWith({ getModelRegistry });
		expect(factoryMocks.greenfield).not.toHaveBeenCalled();
	});

	it("selects Greenfield only after the existing Desktop opt-in", () => {
		const factory = createDesktopKnowledgeProcessingSessionFactory({
			backend: "greenfield",
			getModelRegistry,
		});

		expect(factory).toBe(factoryMocks.greenfield.mock.results[0]?.value);
		expect(factoryMocks.greenfield).toHaveBeenCalledWith({ getModelRegistry });
		expect(factoryMocks.legacy).not.toHaveBeenCalled();
	});
});
