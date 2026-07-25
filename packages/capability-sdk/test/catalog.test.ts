import { Type } from "@sinclair/typebox";
import { describe, expect, it } from "vitest";
import { createCapabilityCatalog } from "../src/catalog.js";
import { CAPABILITY_LAYERS, CAPABILITY_PREFIXES, defineCapability } from "../src/contracts.js";
import { defineCapabilityInputSchema, defineCapabilityNoOutputSchema } from "../src/schema.js";

const catalogInputSchema = defineCapabilityInputSchema(
	Type.Unsafe<Record<string, never>>({ type: "object", additionalProperties: false }),
);

const catalogCapability = defineCapability<Record<string, never>, undefined>({
	id: `${CAPABILITY_PREFIXES.VETTA_DOMAIN}catalog.test`,
	kind: "command",
	layer: CAPABILITY_LAYERS.DOMAIN,
	version: 1,
	input: catalogInputSchema,
	output: defineCapabilityNoOutputSchema(),
});

describe("capability catalog", () => {
	it("requires schema-bearing tokens and rejects duplicate ids", () => {
		const parserOnlyCapability = defineCapability<Record<string, never>, undefined>({
			id: `${CAPABILITY_PREFIXES.VETTA_DOMAIN}catalog.parser-only`,
			kind: "command",
			layer: CAPABILITY_LAYERS.DOMAIN,
			version: 1,
			parseInput: () => ({}),
			parseOutput: () => undefined,
		});

		expect(() => createCapabilityCatalog([parserOnlyCapability])).toThrowError(
			"Capability catalog requires input and output schemas",
		);
		expect(() => createCapabilityCatalog([catalogCapability, catalogCapability])).toThrowError(
			"Capability catalog contains duplicate id",
		);
	});

	it("publishes immutable data without parser functions", () => {
		const catalog = createCapabilityCatalog([catalogCapability]);

		expect(Object.isFrozen(catalog)).toBe(true);
		expect(Object.isFrozen(catalog[0])).toBe(true);
		expect(Object.isFrozen(catalog[0]?.inputSchema)).toBe(true);
		expect(JSON.parse(JSON.stringify(catalog))).toEqual([
			{
				id: catalogCapability.id,
				inputSchema: { type: "object", additionalProperties: false },
				kind: "command",
				layer: "domain",
				outputSchema: false,
				version: 1,
			},
		]);
	});
});
