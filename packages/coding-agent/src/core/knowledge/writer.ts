/**
 * 知识库写入编排：把 upsert 解析 + 写盘 + 缓存维护串成一个原子操作。
 *
 * frontmatter 是唯一真相源，本模块在每次写入后据真相源重建 tags.json /
 * manifest.json 缓存。被 kb_write_page 工具与桌面轮询器复用。
 */

import { rebuildManifest, rebuildTagsIndex, type WikiPageRef } from "./cache.js";
import {
	deleteWikiPage,
	generatePageId,
	scanWikiPages,
	writeManifest,
	writeTagsIndex,
	writeWikiPage,
} from "./store.js";
import { resolveUpsert, type UpsertInput } from "./upsert.js";

export interface WritePageRequest extends UpsertInput {
	/** 目标 wiki 页相对 wiki/ 的路径，如 "产品/计费.md"。由 LLM 按语义决定。 */
	path: string;
	/** 正文 markdown（不含 frontmatter）。 */
	body: string;
}

export interface WritePageResult {
	action: "create" | "update";
	id: string;
	path: string;
	/** 若更新时页在 wiki 树里换了位置，记录旧路径（已删除）。 */
	movedFrom?: string;
}

const normalizeWikiPath = (p: string): string => {
	let s = p.replace(/\\/g, "/").replace(/^\/+/, "");
	if (!s.endsWith(".md")) s += ".md";
	return s;
};

/**
 * upsert 一个 wiki 页并刷新缓存。
 * @param now ISO 时间戳。
 */
export async function writeKnowledgePage(root: string, req: WritePageRequest, now: string): Promise<WritePageResult> {
	const { pages } = await scanWikiPages(root);

	const byId = new Map(pages.map((p) => [p.frontmatter.id, p.frontmatter]));
	const byHash = new Map(pages.map((p) => [p.frontmatter.source_hash, p.frontmatter]));
	const idToPath = new Map(pages.map((p) => [p.frontmatter.id, p.path]));

	const decision = resolveUpsert(
		{
			id: req.id,
			source: req.source,
			source_path: req.source_path,
			source_hash: req.source_hash,
			tags: req.tags,
			title: req.title,
			summary: req.summary,
		},
		{ byId: (id) => byId.get(id), bySourceHash: (h) => byHash.get(h) },
		now,
		generatePageId,
	);

	const fm = decision.frontmatter;
	const targetPath = normalizeWikiPath(req.path);
	const oldPath = decision.action === "update" ? idToPath.get(fm.id) : undefined;

	await writeWikiPage(root, targetPath, fm, req.body);

	let movedFrom: string | undefined;
	if (oldPath && oldPath !== targetPath) {
		await deleteWikiPage(root, oldPath);
		movedFrom = oldPath;
	}

	// 据真相源重建缓存：用内存中的页集合替换/插入当前页，避免二次扫盘。
	const refs: WikiPageRef[] = pages
		.filter((p) => p.frontmatter.id !== fm.id && p.path !== targetPath)
		.map((p) => ({ frontmatter: p.frontmatter, path: p.path }));
	refs.push({ frontmatter: fm, path: targetPath });

	await Promise.all([writeManifest(root, rebuildManifest(refs)), writeTagsIndex(root, rebuildTagsIndex(refs))]);

	return { action: decision.action, id: fm.id, path: targetPath, movedFrom };
}
