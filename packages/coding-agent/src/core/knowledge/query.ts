/**
 * 知识库检索：filter_by_tags 的落盘实现。
 *
 * 以 frontmatter 为真相源扫描（排除孤儿），用纯函数 filterByTags 过滤，
 * 返回带 title/summary/path 的命中页，便于 agent 直接下钻。
 */

import { scanWikiPages } from "./store.js";
import { filterByTags, type TagQuery } from "./tag-filter.js";

export interface FilteredPage {
	id: string;
	path: string;
	title: string;
	summary: string;
	tags: string[];
}

/** 按标签查询知识库，返回命中页（排除孤儿）。 */
export async function queryByTags(root: string, query: TagQuery): Promise<FilteredPage[]> {
	const { pages } = await scanWikiPages(root);
	const live = pages.filter((p) => p.frontmatter.orphaned_at == null);
	const matchedIds = new Set(
		filterByTags(
			live.map((p) => ({ id: p.frontmatter.id, tags: p.frontmatter.tags })),
			query,
		),
	);
	return live
		.filter((p) => matchedIds.has(p.frontmatter.id))
		.map((p) => ({
			id: p.frontmatter.id,
			path: p.path,
			title: p.frontmatter.title,
			summary: p.frontmatter.summary,
			tags: p.frontmatter.tags,
		}));
}
