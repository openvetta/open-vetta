import type { AbilityItem, AbilityScope } from "../types";

export interface AbilityCatalogQuery {
	scope: AbilityScope;
	keyword?: string;
	category?: string;
	types?: AbilityItem["type"][];
	sourceIds?: string[];
	page: number;
	pageSize: number;
}

export interface AbilityCatalogPage {
	items: AbilityItem[];
	total: number;
	page: number;
	pageSize: number;
	pageCount: number;
}

/** 排序：待配置 > 可更新 > 已安装 > 热度 > 标题 > id。 */
export function compareAbilities(a: AbilityItem, b: AbilityItem): number {
	if (a.setupRequired !== b.setupRequired) return a.setupRequired ? -1 : 1;
	if (a.needsUpdate !== b.needsUpdate) return a.needsUpdate ? -1 : 1;
	if (a.installed !== b.installed) return a.installed ? -1 : 1;
	if (a.downloadCount !== b.downloadCount) return b.downloadCount - a.downloadCount;
	const titleOrder = a.title.localeCompare(b.title);
	return titleOrder || a.id.localeCompare(b.id);
}

function sourceId(item: AbilityItem): string {
	if (item.origin?.kind === "github-marketplace") return item.origin.sourceId ?? item.origin.repository;
	if (item.fromMarket) return "server";
	if (item.isBuiltin) return "builtin";
	return "local";
}

export function queryAbilityCatalog(items: AbilityItem[], query: AbilityCatalogQuery): AbilityCatalogPage {
	const keyword = query.keyword?.trim().toLowerCase() ?? "";
	const types = query.types ? new Set(query.types) : null;
	const sourceIds = query.sourceIds ? new Set(query.sourceIds) : null;
	const page = Number.isInteger(query.page) && query.page > 0 ? query.page : 1;
	const pageSize = Number.isInteger(query.pageSize) && query.pageSize > 0 ? query.pageSize : 60;
	const filtered = items
		.filter((item) => (query.scope === "discover" ? item.fromMarket : item.installed))
		.filter((item) => !keyword || item.searchTerms.some((term) => term.toLowerCase().includes(keyword)))
		.filter((item) => !query.category || item.category === query.category)
		.filter((item) => !types || types.has(item.type))
		.filter((item) => !sourceIds || sourceIds.has(sourceId(item)))
		.sort(compareAbilities);
	const total = filtered.length;
	return {
		items: filtered.slice((page - 1) * pageSize, page * pageSize),
		total,
		page,
		pageSize,
		pageCount: Math.ceil(total / pageSize),
	};
}
