import { describe, expect, it } from "vitest";
import {
	collectCodingAgentCompositionContractState,
	findCodingAgentCompositionContractViolations,
	REQUIRED_COMPOSITION_OPTION_FACETS,
} from "./check-coding-agent-composition-contract.mjs";

describe("Coding Agent Composition contract gate", () => {
	it("accepts responsibility facets without Adapter dependencies", () => {
		const state = collectCodingAgentCompositionContractState([
			{
				path: "packages/coding-agent/src/composition/contracts/runtime-composition-options.ts",
				text: [
					...REQUIRED_COMPOSITION_OPTION_FACETS.map((facet) => `export interface ${facet} {}`),
					`export interface GreenfieldRuntimeCompositionOptions extends ${REQUIRED_COMPOSITION_OPTION_FACETS.join(", ")} {}`,
				].join("\n"),
			},
			{
				path: "packages/coding-agent/src/composition/greenfield-runtime-composition-contract.ts",
				text: 'export type { Options } from "./contracts/index.js";',
			},
		]);

		expect(findCodingAgentCompositionContractViolations(state)).toEqual([]);
		expect(state.adapterDependencies).toHaveLength(0);
	});

	it("rejects Adapter imports, missing facets and oversized contract facades", () => {
		const state = collectCodingAgentCompositionContractState([
			{
				path: "packages/coding-agent/src/composition/contracts/runtime-composition-options.ts",
				text: [
					'import type { Runtime } from "../../adapters/runtime-core/runtime.js";',
					`export interface ${REQUIRED_COMPOSITION_OPTION_FACETS[0]} {}`,
					`export interface GreenfieldRuntimeCompositionOptions extends ${REQUIRED_COMPOSITION_OPTION_FACETS[0]} {}`,
				].join("\n"),
			},
			{
				path: "packages/coding-agent/src/composition/greenfield-runtime-composition-contract.ts",
				text: Array.from({ length: 41 }, () => "export {};").join("\n"),
			},
		]);

		const violations = findCodingAgentCompositionContractViolations(state);
		expect(violations).toContain(
			"packages/coding-agent/src/composition/contracts/runtime-composition-options.ts: public Composition contract depends on Adapter (../../adapters/runtime-core/runtime.js)",
		);
		expect(violations).toContain(
			"packages/coding-agent/src/composition/greenfield-runtime-composition-contract.ts: Composition contract module has 41 lines (limit 40)",
		);
		expect(violations).toHaveLength(11);
	});
});
