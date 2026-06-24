/**
 * 知识库文件「加工态」推导：以 manifest.json（wiki 反查缓存）+ raws 实时 hash 对比得出。
 *
 * - processed   ：manifest 有对应活跃页且 source_hash 与当前文件一致。
 * - stale       ：manifest 有对应活跃页，但源文件已改（hash 不一致），等待下一轮重加工。
 * - unprocessed ：manifest 无对应活跃页（从未加工或已被标为孤儿）。
 *
 * key 为 source_path（相对 raws/ 的 posix 路径，首段即知识库名），
 * 与 UI 节点的 `${kbId}/${node.id}` 对齐。
 */

import { join } from "node:path";
import { knowledge } from "@vetta/coding-agent";

export type KnowledgeProcessStatus = "processed" | "stale" | "unprocessed";

export interface KnowledgeFileStatus {
	status: KnowledgeProcessStatus;
	/** 加工产物 wiki md 的本地绝对路径（processed / stale 有，供「查看 wiki」预览）。 */
	wikiPath?: string;
}

/** 推导全部 raws 文件的加工态，按 source_path 索引。 */
export async function getKnowledgeFileStatuses(): Promise<Record<string, KnowledgeFileStatus>> {
	const root = knowledge.knowledgeRoot();
	const [manifest, raws] = await Promise.all([knowledge.readManifest(root), knowledge.scanRaws(root)]);

	// 仅活跃页（非孤儿）参与判定，按 source_path 索引。
	const live = new Map<string, { hash: string; wikiPath: string }>();
	for (const page of manifest.pages) {
		if (page.orphaned_at !== null) continue;
		live.set(page.source_path, { hash: page.source_hash, wikiPath: join(knowledge.wikiDir(root), page.path) });
	}

	const result: Record<string, KnowledgeFileStatus> = {};
	for (const raw of raws) {
		const page = live.get(raw.source_path);
		if (!page) {
			result[raw.source_path] = { status: "unprocessed" };
		} else {
			result[raw.source_path] = {
				status: page.hash === raw.source_hash ? "processed" : "stale",
				wikiPath: page.wikiPath,
			};
		}
	}
	return result;
}
