/**
 * upsert 解析器：决定 kb_write_page 是新建还是就地更新（纯函数）。
 *
 * 键判定顺序：
 *   1. 传入 id 且该页存在 → 就地更新（保留 id + created_at），用于内容变更
 *      由轮询器解析出旧 id 的场景，保住稳定 id。
 *   2. 否则 source_hash 已存在 → 命中更新（同内容重复写入）。
 *   3. 否则 → 新建并分配 id。
 *
 * 更新一律清除 orphaned_at（写入即复活）、刷新 updated_at。
 */

import type { WikiFrontmatter } from "./types.js";

export interface UpsertInput {
	/** 内容变更场景由轮询器解析出的旧页 id。 */
	id?: string;
	source: string;
	source_path: string;
	source_hash: string;
	tags: string[];
	title: string;
	summary: string;
}

export interface UpsertLookup {
	byId(id: string): WikiFrontmatter | undefined;
	bySourceHash(hash: string): WikiFrontmatter | undefined;
}

export type UpsertDecision =
	| { action: "create"; frontmatter: WikiFrontmatter }
	| { action: "update"; id: string; frontmatter: WikiFrontmatter };

/**
 * @param now ISO 时间戳。
 * @param genId 生成新页 id 的函数（新建时调用）。
 */
export function resolveUpsert(
	input: UpsertInput,
	lookup: UpsertLookup,
	now: string,
	genId: () => string,
): UpsertDecision {
	const existing = (input.id != null ? lookup.byId(input.id) : undefined) ?? lookup.bySourceHash(input.source_hash);

	if (existing) {
		const frontmatter: WikiFrontmatter = {
			id: existing.id,
			source: input.source,
			source_path: input.source_path,
			source_hash: input.source_hash,
			tags: [...input.tags],
			title: input.title,
			summary: input.summary,
			created_at: existing.created_at,
			updated_at: now,
			orphaned_at: null,
		};
		return { action: "update", id: existing.id, frontmatter };
	}

	const frontmatter: WikiFrontmatter = {
		id: genId(),
		source: input.source,
		source_path: input.source_path,
		source_hash: input.source_hash,
		tags: [...input.tags],
		title: input.title,
		summary: input.summary,
		created_at: now,
		updated_at: now,
		orphaned_at: null,
	};
	return { action: "create", frontmatter };
}
