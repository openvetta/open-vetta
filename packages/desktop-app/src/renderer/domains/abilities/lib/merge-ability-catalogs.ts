import type { GitHubMarketplaceOrigin, OpenMarketplaceAbility } from "@preload/api";
import type { MarketAbility } from "@shared/lib/api";

export type OpenCatalogMarketAbility = MarketAbility & {
	origin: GitHubMarketplaceOrigin;
	configVersion: number;
};

function toMarketAbility(ability: OpenMarketplaceAbility, syncedAt: string | null): OpenCatalogMarketAbility {
	return {
		slug: ability.slug,
		type: ability.type,
		name: ability.name,
		description: ability.description,
		license: ability.license,
		version: ability.version,
		author: ability.author,
		icon: ability.icon,
		category: ability.category,
		tags: ability.tags,
		sha256: "",
		download_count: 0,
		config: {},
		detail: ability.detail,
		updated_at: syncedAt ?? "",
		origin: ability.origin,
		configVersion: ability.configVersion,
	};
}

/** 服务端市场优先；同 type + slug 的 GitHub 条目不覆盖服务端条目。 */
export function mergeAbilityCatalogs(
	serverAbilities: MarketAbility[],
	openAbilities: OpenMarketplaceAbility[],
	syncedAt: string | null,
): MarketAbility[] {
	const seen = new Set(serverAbilities.map((ability) => `${ability.type}:${ability.slug}`));
	const merged = [...serverAbilities];
	for (const ability of openAbilities) {
		const id = `${ability.type}:${ability.slug}`;
		if (seen.has(id)) continue;
		seen.add(id);
		merged.push(toMarketAbility(ability, syncedAt));
	}
	return merged;
}

export function getOpenCatalogOrigin(ability: MarketAbility): GitHubMarketplaceOrigin | undefined {
	const candidate = ability as MarketAbility & { origin?: GitHubMarketplaceOrigin };
	return candidate.origin?.kind === "github-marketplace" ? candidate.origin : undefined;
}
