/**
 * 构造一轮加工的 agent 任务 prompt。
 *
 * 工程侧已处理 moved（纯元数据）与孤儿标记；交给 agent 的是：
 *   - added：读原始文件，新建 wiki 页（kb_write_page，不传 id）
 *   - changed：读原始文件，按 id 就地更新（kb_write_page 传 id）
 *   - toReap：上一轮孤儿，复判是否抢救/合并到别的页，之后工程侧会物理删除
 */

import { join } from "node:path";
import type { RawsDiff } from "./differ.js";
import { knowledgeRoot, rawsDir, wikiDir } from "./store.js";
import type { ManifestEntry } from "./types.js";

/** 知识库加工的静态约定，作为 appendSystemPrompt 注入。 */
export const KB_PROCESSING_GUIDE = `你是知识库加工 agent。把 ~/.vetta/knowledges/raws/ 下的原始文件加工成结构化的 wiki 页。

核心约定：
- raw ↔ wiki 为 1:1：一个原始文件对应恰好一个 wiki 页。
- raws/ 是**只读**原始来源：绝不要写入、修改或在其中创建任何临时/中间文件。一切临时产物（解压、OCR 中间结果、格式转换等）一律写到任务中给出的「临时工作目录」（系统 tmp），完成后无需手动清理。也不要把临时文件写进 wiki/、indexes/ 或知识库根目录。
- 用 read / extract_text_from_pdf / extract_text_from_img / render_pdf_page 读取原始文件内容（任务里给出每个文件的**绝对路径**，直接用，勿自行拼相对路径）。
- 用且仅用 kb_write_page 写 wiki 页：它守封闭 frontmatter schema、分配稳定 id、按 id/source_hash upsert、自动刷新缓存。绝不要用通用 write 工具手写 wiki 的 .md。
- wiki 树由你按主题/语义自由组织（path 参数），不要镜像 raws 的目录结构。这棵树就是知识库的「目录」——把语义编排落在它的文件夹层级与文件命名上。
- 跨页引用写在正文里，形如 [[page-id]]，不要放进 frontmatter。
- 给每页打扁平字符串标签（tags），并写好简洁的一句话 summary（会进 indexes 导读）。
- indexes/INDEX.md 是**自动生成**的目录（镜像 wiki 树 + 各页 title/summary/id，每轮重建）：**绝不要手写或编辑 indexes/**。你只管组织好 wiki 树、写好 title/summary，目录会自动同步；它是后续检索的渐进式披露入口，可读它来导航下探。
- summary/标签要利于后续 kb_filter_by_tags 与渐进式探索检索。`;

const formatRaws = (label: string, items: string[]): string =>
	items.length === 0 ? "" : `\n## ${label}\n${items.map((s) => `- ${s}`).join("\n")}`;

/**
 * 渲染本轮任务 prompt。给出每个文件的绝对路径，避免 agent 因 cwd 非知识库根而拼错相对路径。
 * @param root 知识库根目录（默认 ~/.vetta/knowledges）。
 */
export function buildProcessingPrompt(diff: RawsDiff, toReap: ManifestEntry[], root?: string, tmpDir?: string): string {
	const resolvedRoot = knowledgeRoot(root);
	const rawsBase = rawsDir(resolvedRoot);
	const wikiBase = wikiDir(resolvedRoot);
	const added = diff.added.map(
		(a) =>
			`${join(rawsBase, a.raw.source_path)}（source=${a.raw.source}，source_path=${a.raw.source_path}，source_hash=${a.raw.source_hash}）→ 读它 → kb_write_page 新建`,
	);
	const changed = diff.changed.map(
		(c) =>
			`${join(rawsBase, c.source_path)}（source=${c.source}，source_path=${c.source_path}，新 source_hash=${c.newHash}）→ 读它 → kb_write_page 传 id="${c.id}" 就地更新`,
	);
	const orphans = toReap.map(
		(o) =>
			`${join(wikiBase, o.path)}（id=${o.id}，原 source_path=${o.source_path}）→ 复判：可把有价值内容/被引用关系合并迁移到别的页；处理完它会被物理删除`,
	);

	const sections = [
		formatRaws("新增文件（读原文 → kb_write_page 新建）", added),
		formatRaws("内容变更文件（读原文 → kb_write_page 按 id 更新）", changed),
		formatRaws("待回收孤儿（复判抢救，随后删除）", orphans),
	]
		.filter(Boolean)
		.join("\n");

	const tmpNote = tmpDir ? `\n\n临时工作目录（所有中间/临时文件写这里，勿污染 raws/）：${tmpDir}` : "";
	return `# 本轮知识库加工任务\n${sections}${tmpNote}\n\n组织好 wiki 树与各页 title/summary 即可；indexes/INDEX.md 目录会自动重建，无需手动维护。`;
}
