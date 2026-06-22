import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { finalizeRound, prepareRound } from "../src/core/knowledge/ingest.js";
import { hashContent, rawsDir, readManifest, scanWikiPages } from "../src/core/knowledge/store.js";
import { writeKnowledgePage } from "../src/core/knowledge/writer.js";

describe("ingest round lifecycle (integration)", () => {
	let root: string;
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "kb-ingest-"));
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	const writeRaw = (relPath: string, content: string): string => {
		const full = join(rawsDir(root), relPath);
		mkdirSync(join(full, ".."), { recursive: true });
		writeFileSync(full, content, "utf-8");
		return hashContent(content);
	};

	it("moved：同 hash 换 path → 工程侧更新 frontmatter，不变成新增/删除", async () => {
		const hash = writeRaw("g1/a.md", "hello");
		await writeKnowledgePage(
			root,
			{
				path: "topic/a.md",
				source: "g1",
				source_path: "g1/a.md",
				source_hash: hash,
				tags: ["t"],
				title: "A",
				summary: "s",
				body: "body",
			},
			"2026-06-22T00:00:00.000Z",
		);

		// 移动原始文件：删旧建新（内容不变）
		rmSync(join(rawsDir(root), "g1"), { recursive: true, force: true });
		writeRaw("g2/a.md", "hello");

		const { diff } = await prepareRound(root, "2026-06-22T01:00:00.000Z");
		expect(diff.moved).toHaveLength(1);
		expect(diff.added).toHaveLength(0);
		expect(diff.deleted).toHaveLength(0);

		const { pages } = await scanWikiPages(root);
		expect(pages).toHaveLength(1);
		expect(pages[0].frontmatter.source).toBe("g2");
		expect(pages[0].frontmatter.source_path).toBe("g2/a.md");
		expect(pages[0].frontmatter.orphaned_at).toBeNull();
	});

	it("删除 → 标孤儿；下一轮 finalize 才物理删除（n+1）", async () => {
		const hash = writeRaw("g/a.md", "hello");
		await writeKnowledgePage(
			root,
			{
				path: "topic/a.md",
				source: "g",
				source_path: "g/a.md",
				source_hash: hash,
				tags: ["t"],
				title: "A",
				summary: "s",
				body: "body",
			},
			"2026-06-22T00:00:00.000Z",
		);

		// 第 N 轮：删除原始文件
		rmSync(join(rawsDir(root), "g"), { recursive: true, force: true });
		const round1 = await prepareRound(root, "2026-06-22T01:00:00.000Z");
		expect(round1.diff.deleted).toHaveLength(1);
		expect(round1.toReap).toHaveLength(0); // 本轮刚标记，不回收

		let { pages } = await scanWikiPages(root);
		expect(pages).toHaveLength(1);
		expect(pages[0].frontmatter.orphaned_at).toBe("2026-06-22T01:00:00.000Z");

		// finalize round1：toReap 为空，页仍在
		await finalizeRound(root, round1.toReap);
		({ pages } = await scanWikiPages(root));
		expect(pages).toHaveLength(1);

		// 第 N+1 轮：上一轮孤儿进入 toReap
		const round2 = await prepareRound(root, "2026-06-22T02:00:00.000Z");
		expect(round2.toReap).toHaveLength(1);
		expect(round2.toReap[0].path).toBe("topic/a.md");

		// finalize round2：物理删除
		await finalizeRound(root, round2.toReap);
		({ pages } = await scanWikiPages(root));
		expect(pages).toHaveLength(0);

		const manifest = await readManifest(root);
		expect(manifest.pages).toHaveLength(0);
	});

	it("added/changed 在 diff 中暴露给 agent", async () => {
		const h1 = writeRaw("g/new.md", "fresh");
		const { diff } = await prepareRound(root, "2026-06-22T00:00:00.000Z");
		expect(diff.added).toHaveLength(1);
		expect(diff.added[0].raw.source_hash).toBe(h1);
	});
});
