/**
 * 知识库写入编排：把 upsert 解析 + 写盘串成一个操作。
 *
 * frontmatter 是唯一真相源。本模块只负责写出页这一份真相，不重建缓存——
 * tags.json / manifest.json / indexes/INDEX.md 由 ingest 在每轮收尾时统一重建一次
 * （见 finalizeRound / rebuildAllCaches），避免一轮内每写一页就全量重建。
 * 被 kb_write_page 工具复用（该工具仅在加工轮内调用）。
 */

import { deleteWikiPage, generatePageId, scanWikiPages, writeWikiPage } from "./store.js";
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

	return { action: decision.action, id: fm.id, path: targetPath, movedFrom };
}
