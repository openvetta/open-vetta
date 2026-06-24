/**
 * 知识库写入编排：把 upsert 解析 + 写盘串成一个操作。
 *
 * frontmatter 是唯一真相源。本模块只负责写出页这一份真相，不重建缓存——
 * tags.json / manifest.json / indexes/INDEX.md 由 ingest 在每轮收尾时统一重建一次
 * （见 finalizeRound / rebuildAllCaches），避免一轮内每写一页就全量重建。
 *
 * 一轮加工要写很多页，且这些页可能由多个并发 agent 会话同时写（见桌面轮询器的
 * 会话池）。createKbWriteSession 在轮始扫一次 wiki/ 建内存 PageIndex，之后每次写页
 * 只对内存索引决策 + 增量更新，避免「每写一页都全量 scanWikiPages」的 O(N²)；并用
 * max=1 的限制器把「决策→写盘→更新索引」串成原子段，杜绝并发读-改-写产生重复页。
 * 单次写（加工轮外的通用 session / UI）走 writeKnowledgePage —— 它建一个一次性
 * session，行为与旧实现一致（每次现扫一次）。
 */

import { createLimiter } from "../concurrency-limit.js";
import { deleteWikiPage, generatePageId, scanWikiPages, writeWikiPage } from "./store.js";
import type { WikiFrontmatter } from "./types.js";
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

/** 一轮加工期间的共享写页会话：内存 PageIndex + 串行提交互斥。 */
export interface KbWriteSession {
	/** upsert 一个 wiki 页。并发调用安全（内部串行提交）。 */
	write(req: WritePageRequest, now: string): Promise<WritePageResult>;
}

const normalizeWikiPath = (p: string): string => {
	let s = p.replace(/\\/g, "/").replace(/^\/+/, "");
	if (!s.endsWith(".md")) s += ".md";
	return s;
};

/** 在 ".md" 前插入后缀，如 "产品/计费.md" + "ab12cd34" → "产品/计费-ab12cd34.md"。 */
const withSuffix = (p: string, suffix: string): string => `${p.slice(0, -3)}-${suffix}.md`;

/**
 * 建一个轮级写页会话：先扫一次 wiki/ 建内存索引，之后 write 只对内存决策 + 增量更新，
 * 并以串行互斥保护读-改-写。多个并发会话各持自己的 session，但加工轮应共享同一个，
 * 才能让并发批之间看见彼此刚写的页（避免重复建页）。
 */
export async function createKbWriteSession(root: string): Promise<KbWriteSession> {
	const { pages } = await scanWikiPages(root);
	const byId = new Map<string, WikiFrontmatter>();
	const byHash = new Map<string, WikiFrontmatter>();
	const idToPath = new Map<string, string>();
	const pathToId = new Map<string, string>();
	for (const p of pages) {
		byId.set(p.frontmatter.id, p.frontmatter);
		byHash.set(p.frontmatter.source_hash, p.frontmatter);
		idToPath.set(p.frontmatter.id, p.path);
		pathToId.set(p.path, p.frontmatter.id);
	}

	// 该路径未被占用，或正被本页自己占用（更新就地写）→ 可用。
	const isFree = (p: string, id: string): boolean => {
		const owner = pathToId.get(p);
		return owner == null || owner === id;
	};

	// 为 id 挑一个不与「别的页」冲突的物理路径：优先用 LLM 给的语义路径；
	// 被别的页占用时退到稳定的 id 后缀路径（同一页跨轮恒定，不再抢同一路径）。
	// 这是同名不同目录原始文件互相覆盖、manifest 丢条目、进而无限重复加工的根因防线。
	const resolveFreePath = (desired: string, id: string): string => {
		if (isFree(desired, id)) return desired;
		const base = withSuffix(desired, id.slice(0, 8));
		if (isFree(base, id)) return base;
		for (let n = 2; ; n++) {
			const cand = withSuffix(desired, `${id.slice(0, 8)}-${n}`);
			if (isFree(cand, id)) return cand;
		}
	};

	const commit = createLimiter(1);

	return {
		write(req: WritePageRequest, now: string): Promise<WritePageResult> {
			return commit.run(async () => {
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
				const prev = byId.get(fm.id);
				const oldPath = decision.action === "update" ? idToPath.get(fm.id) : undefined;
				const targetPath = resolveFreePath(normalizeWikiPath(req.path), fm.id);

				await writeWikiPage(root, targetPath, fm, req.body);

				let movedFrom: string | undefined;
				if (oldPath && oldPath !== targetPath) {
					await deleteWikiPage(root, oldPath);
					pathToId.delete(oldPath);
					movedFrom = oldPath;
				}

				// 增量更新内存索引（hash 变更时清掉旧 hash 键，避免后续 bySourceHash 误命中）。
				if (prev && prev.source_hash !== fm.source_hash) byHash.delete(prev.source_hash);
				byId.set(fm.id, fm);
				byHash.set(fm.source_hash, fm);
				idToPath.set(fm.id, targetPath);
				pathToId.set(targetPath, fm.id);

				return { action: decision.action, id: fm.id, path: targetPath, movedFrom };
			});
		},
	};
}

/**
 * 单次 upsert 一个 wiki 页（加工轮外的通用 session / UI 用）。每次现扫一次 wiki/，
 * 行为与旧实现一致。加工轮内的批量写请改用 createKbWriteSession 共享索引。
 * @param now ISO 时间戳。
 */
export async function writeKnowledgePage(root: string, req: WritePageRequest, now: string): Promise<WritePageResult> {
	const session = await createKbWriteSession(root);
	return session.write(req, now);
}
