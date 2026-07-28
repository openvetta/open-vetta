import type { OpenMarketplaceAbility } from "@preload/api";
import type { MarketAbility } from "@shared/lib/api";
import { describe, expect, it } from "vitest";
import { getOpenCatalogOrigin, mergeAbilityCatalogs } from "./merge-ability-catalogs";

function serverAbility(slug: string): MarketAbility {
	return {
		slug,
		type: "skill",
		name: `Server ${slug}`,
		description: "",
		license: "",
		version: "1.0.0",
		author: "",
		icon: "",
		category: "",
		tags: [],
		sha256: "digest",
		download_count: 1,
		config: {},
		detail: {},
		updated_at: "",
	};
}

function openAbility(slug: string): OpenMarketplaceAbility {
	return {
		slug,
		type: "skill",
		name: `Open ${slug}`,
		description: "",
		license: "MIT",
		version: "2.0.0",
		configVersion: 1,
		author: "",
		icon: "",
		category: "",
		tags: [],
		detail: {},
		origin: {
			kind: "github-marketplace",
			marketplace: "vetta-open-abilities",
			marketplaceVersion: "2026.07.1",
			repository: "https://github.com/example/vetta-abilities",
		},
	};
}

describe("mergeAbilityCatalogs", () => {
	it("adds GitHub abilities with their origin metadata", () => {
		const merged = mergeAbilityCatalogs([], [openAbility("demo")], "2026-07-28T00:00:00.000Z");

		expect(merged[0]).toMatchObject({ slug: "demo", download_count: 0, updated_at: "2026-07-28T00:00:00.000Z" });
		expect(getOpenCatalogOrigin(merged[0] as MarketAbility)).toMatchObject({ kind: "github-marketplace" });
	});

	it("keeps the server entry when type and slug conflict", () => {
		const merged = mergeAbilityCatalogs([serverAbility("demo")], [openAbility("demo")], null);

		expect(merged).toHaveLength(1);
		expect(merged[0]?.name).toBe("Server demo");
		expect(getOpenCatalogOrigin(merged[0] as MarketAbility)).toBeUndefined();
	});
});
