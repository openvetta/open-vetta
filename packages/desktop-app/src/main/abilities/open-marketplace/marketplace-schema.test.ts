import { describe, expect, it } from "vitest";
import { parseMarketplaceManifest } from "./marketplace-schema";

function validManifest(): Record<string, unknown> {
	return {
		schemaVersion: 1,
		name: "vetta-open-abilities",
		marketplaceVersion: "2026.07.1",
		repository: "https://github.com/example/vetta-abilities",
		abilities: [
			{
				type: "skill",
				slug: "demo-skill",
				name: "Demo Skill",
				description: "Demo",
				version: "1.0.0",
				source: { path: "abilities/skills/demo-skill" },
			},
		],
	};
}

describe("parseMarketplaceManifest", () => {
	it("fills backward-compatible defaults for optional catalog fields", () => {
		const manifest = parseMarketplaceManifest(validManifest());

		expect(manifest.abilities[0]).toMatchObject({
			configVersion: 1,
			license: "",
			author: "",
			tags: [],
			detail: {},
		});
	});

	it("rejects source paths that escape the repository root", () => {
		const manifest = validManifest();
		const abilities = manifest.abilities as Array<Record<string, unknown>>;
		abilities[0] = { ...abilities[0], source: { path: "../../outside" } };

		expect(() => parseMarketplaceManifest(manifest)).toThrow("escapes marketplace root");
	});

	it("rejects duplicate type and slug entries", () => {
		const manifest = validManifest();
		const abilities = manifest.abilities as Array<Record<string, unknown>>;
		abilities.push(structuredClone(abilities[0]));

		expect(() => parseMarketplaceManifest(manifest)).toThrow("Duplicate ability");
	});

	it("rejects the same slug across skill and scene because the local manifest shares a namespace", () => {
		const manifest = validManifest();
		const abilities = manifest.abilities as Array<Record<string, unknown>>;
		abilities.push({ ...structuredClone(abilities[0]), type: "scene" });

		expect(() => parseMarketplaceManifest(manifest)).toThrow("Duplicate ability slug");
	});

	it("rejects unsupported ability types in schema version 1", () => {
		const manifest = validManifest();
		const abilities = manifest.abilities as Array<Record<string, unknown>>;
		abilities[0] = { ...abilities[0], type: "plugin" };

		expect(() => parseMarketplaceManifest(manifest)).toThrow();
	});
});
