/**
 * 摄入编排的工程侧操作（非 agent）。
 *
 * 一轮加工的工程侧职责：
 *   prepareRound  —— 算 diff；moved 纯元数据更新；本轮 deleted 标 orphaned_at；
 *                    重建缓存；返回 added/changed 给 agent，以及 toReap（上一轮孤儿）供 agent 复判。
 *   finalizeRound —— agent 复判/抢救完成后，物理删除仍为孤儿的上一轮孤儿；重建缓存。
 *
 * moved/markOrphans 只动 frontmatter（真相源），不重加工、不耗 token。
 */

import { rebuildManifest, rebuildTagsIndex, type WikiPageRef } from "./cache.js";
import { diffRaws, planOrphans, type RawsDiff } from "./differ.js";
import {
	deleteWikiPage,
	readManifest,
	scanRaws,
	scanWikiPages,
	writeManifest,
	writeTagsIndex,
	writeWikiPage,
} from "./store.js";
import type { ManifestEntry } from "./types.js";

/** 据真相源（wiki frontmatter）重建 tags.json / manifest.json。 */
export async function rebuildAllCaches(root: string): Promise<void> {
	const { pages } = await scanWikiPages(root);
	const refs: WikiPageRef[] = pages.map((p) => ({ frontmatter: p.frontmatter, path: p.path }));
	await Promise.all([writeManifest(root, rebuildManifest(refs)), writeTagsIndex(root, rebuildTagsIndex(refs))]);
}

export interface PreparedRound {
	diff: RawsDiff;
	/** 上一轮（或更早）标记的孤儿，本轮交 agent 复判后回收。 */
	toReap: ManifestEntry[];
}

/**
 * 一轮加工的工程侧前置处理。
 * @param now 本轮开始时间（ISO）。
 */
export async function prepareRound(root: string, now: string): Promise<PreparedRound> {
	const manifest = await readManifest(root);
	const raws = await scanRaws(root);
	const diff = diffRaws(manifest.pages, raws);
	const plan = planOrphans(manifest, diff, now);

	const { pages } = await scanWikiPages(root);
	const byId = new Map(pages.map((p) => [p.frontmatter.id, p]));

	// moved：纯元数据更新（source / source_path），内容与 hash 不变。
	for (const m of diff.moved) {
		const page = byId.get(m.id);
		if (!page) continue;
		page.frontmatter.source = m.source;
		page.frontmatter.source_path = m.to;
		page.frontmatter.updated_at = now;
		await writeWikiPage(root, page.path, page.frontmatter, page.body);
	}

	// 本轮新删除 → 标 orphaned_at。
	for (const d of plan.toMark) {
		const page = byId.get(d.id);
		if (!page) continue;
		page.frontmatter.orphaned_at = now;
		page.frontmatter.updated_at = now;
		await writeWikiPage(root, page.path, page.frontmatter, page.body);
	}

	await rebuildAllCaches(root);
	return { diff, toReap: plan.toReap };
}

/**
 * 一轮加工的工程侧收尾：物理删除仍为孤儿的上一轮孤儿。
 * agent 复判（合并/重指引用）应已在此之前完成。
 */
export async function finalizeRound(root: string, toReap: ManifestEntry[]): Promise<void> {
	if (toReap.length === 0) return;
	const { pages } = await scanWikiPages(root);
	const stillOrphan = new Map(
		pages.filter((p) => p.frontmatter.orphaned_at != null).map((p) => [p.frontmatter.id, p.path]),
	);
	for (const entry of toReap) {
		const path = stillOrphan.get(entry.id);
		if (path) await deleteWikiPage(root, path);
	}
	await rebuildAllCaches(root);
}
