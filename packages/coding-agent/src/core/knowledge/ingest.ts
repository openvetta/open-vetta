/**
 * 摄入编排的工程侧操作（非 agent）。
 *
 * 一轮加工的工程侧职责：
 *   prepareRound  —— 算 diff；moved 纯元数据更新；本轮 deleted 标 orphaned_at；
 *                    返回 added/changed 给 agent，以及 toReap（上一轮孤儿）供 agent 复判。
 *   finalizeRound —— agent 复判/抢救完成后，物理删除仍为孤儿的上一轮孤儿；并重建缓存。
 *
 * 缓存（tags.json / manifest.json / indexes/INDEX.md）是 frontmatter 的派生产物，
 * 一轮只在 finalizeRound 收尾时重建一次（不在 prepareRound、也不在每次 kb_write_page）。
 * diff 基线直接据当前 wiki frontmatter 现算，不依赖 manifest.json——即便它损坏/过期，
 * 也不会把整库误判为新增而触发整库重加工。
 *
 * moved/markOrphans 只动 frontmatter（真相源），不重加工、不耗 token。
 */

import { rebuildManifest, rebuildTagsIndex, type WikiPageRef } from "./cache.js";
import { diffRaws, planOrphans, type RawsDiff } from "./differ.js";
import { buildIndexMap } from "./index-map.js";
import {
	deleteWikiPage,
	pruneEmptyWikiDirs,
	scanRaws,
	scanWikiPages,
	writeIndexMap,
	writeManifest,
	writeTagsIndex,
	writeWikiPage,
} from "./store.js";
import type { ManifestEntry } from "./types.js";

/** 据真相源（wiki frontmatter）重建 tags.json / manifest.json。 */
export async function rebuildAllCaches(root: string): Promise<void> {
	const { pages } = await scanWikiPages(root);
	const refs: WikiPageRef[] = pages.map((p) => ({ frontmatter: p.frontmatter, path: p.path }));
	await Promise.all([
		writeManifest(root, rebuildManifest(refs)),
		writeTagsIndex(root, rebuildTagsIndex(refs)),
		writeIndexMap(root, buildIndexMap(refs)),
	]);
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
	// diff 基线据当前 wiki frontmatter 现算（不读 manifest.json，避免缓存损坏导致误判）。
	const { pages } = await scanWikiPages(root);
	const refs: WikiPageRef[] = pages.map((p) => ({ frontmatter: p.frontmatter, path: p.path }));
	const manifest = rebuildManifest(refs);

	const raws = await scanRaws(root);
	const diff = diffRaws(manifest.pages, raws);
	const plan = planOrphans(manifest, diff, now);

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

	return { diff, toReap: plan.toReap };
}

/**
 * 一轮加工的工程侧收尾：物理删除仍为孤儿的上一轮孤儿、清理 wiki 空目录，并重建缓存。
 * 删除与空目录清理均为确定性工程动作（不经 agent）。重建无条件执行——它是本轮唯一一次
 * 缓存重建（kb_write_page 与 prepareRound 都不再重建），无孤儿可回收时也要刷新缓存。
 */
export async function finalizeRound(root: string, toReap: ManifestEntry[]): Promise<void> {
	if (toReap.length > 0) {
		const { pages } = await scanWikiPages(root);
		const stillOrphan = new Map(
			pages.filter((p) => p.frontmatter.orphaned_at != null).map((p) => [p.frontmatter.id, p.path]),
		);
		let deleted = 0;
		for (const entry of toReap) {
			const path = stillOrphan.get(entry.id);
			if (path) {
				await deleteWikiPage(root, path);
				deleted += 1;
			}
		}
		// 删页可能留下空主题目录，自底向上清理（不删 wiki 根）。
		if (deleted > 0) await pruneEmptyWikiDirs(root);
	}
	await rebuildAllCaches(root);
}
