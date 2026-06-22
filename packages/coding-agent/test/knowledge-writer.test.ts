import { mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { queryByTags } from "../src/core/knowledge/query.js";
import { readManifest, readTagsIndex, scanWikiPages } from "../src/core/knowledge/store.js";
import { writeKnowledgePage } from "../src/core/knowledge/writer.js";

describe("writeKnowledgePage (integration)", () => {
	let root: string;
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "kb-writer-"));
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	const baseReq = {
		path: "产品/api.md",
		source: "手册",
		source_path: "手册/api.md",
		source_hash: "h1",
		tags: ["api", "manual"],
		title: "API",
		summary: "接口文档",
		body: "# API\n\n内容",
	};

	it("新建页：分配 id，写盘，刷新缓存", async () => {
		const res = await writeKnowledgePage(root, baseReq, "2026-06-22T00:00:00.000Z");
		expect(res.action).toBe("create");
		expect(res.id).toBeTruthy();

		const { pages } = await scanWikiPages(root);
		expect(pages).toHaveLength(1);
		expect(pages[0].frontmatter.title).toBe("API");

		const manifest = await readManifest(root);
		expect(manifest.pages).toHaveLength(1);
		expect(manifest.pages[0].path).toBe("产品/api.md");

		const tags = await readTagsIndex(root);
		expect(tags.tags.api).toEqual([res.id]);
		expect(tags.tags.manual).toEqual([res.id]);
	});

	it("按 id 就地更新：保留 id+created_at，刷新内容", async () => {
		const created = await writeKnowledgePage(root, baseReq, "2026-06-22T00:00:00.000Z");
		const updated = await writeKnowledgePage(
			root,
			{ ...baseReq, id: created.id, source_hash: "h2", title: "API v2", body: "# API v2" },
			"2026-06-23T00:00:00.000Z",
		);
		expect(updated.action).toBe("update");
		expect(updated.id).toBe(created.id);

		const { pages } = await scanWikiPages(root);
		expect(pages).toHaveLength(1);
		expect(pages[0].frontmatter.title).toBe("API v2");
		expect(pages[0].frontmatter.created_at).toBe("2026-06-22T00:00:00.000Z");
		expect(pages[0].frontmatter.updated_at).toBe("2026-06-23T00:00:00.000Z");
		expect(pages[0].frontmatter.source_hash).toBe("h2");
	});

	it("更新时换 path → 移动（旧文件删除，单页保持）", async () => {
		const created = await writeKnowledgePage(root, baseReq, "2026-06-22T00:00:00.000Z");
		const moved = await writeKnowledgePage(
			root,
			{ ...baseReq, id: created.id, path: "产品/接口/api.md" },
			"2026-06-23T00:00:00.000Z",
		);
		expect(moved.movedFrom).toBe("产品/api.md");

		const { pages } = await scanWikiPages(root);
		expect(pages).toHaveLength(1);
		expect(pages[0].path).toBe("产品/接口/api.md");
	});

	it("无 id 但同 source_hash → 命中更新而非新建", async () => {
		const created = await writeKnowledgePage(root, baseReq, "2026-06-22T00:00:00.000Z");
		const again = await writeKnowledgePage(root, { ...baseReq, title: "改了标题" }, "2026-06-23T00:00:00.000Z");
		expect(again.action).toBe("update");
		expect(again.id).toBe(created.id);
		const { pages } = await scanWikiPages(root);
		expect(pages).toHaveLength(1);
	});

	it("queryByTags 读到写入的页", async () => {
		await writeKnowledgePage(root, baseReq, "2026-06-22T00:00:00.000Z");
		await writeKnowledgePage(
			root,
			{
				...baseReq,
				path: "产品/billing.md",
				source_path: "手册/billing.md",
				source_hash: "hb",
				tags: ["billing"],
				title: "计费",
			},
			"2026-06-22T00:00:00.000Z",
		);
		const apiPages = await queryByTags(root, { all: ["api"] });
		expect(apiPages.map((p) => p.title)).toEqual(["API"]);
		const notBilling = await queryByTags(root, { none: ["billing"] });
		expect(notBilling.map((p) => p.title)).toEqual(["API"]);

		// 内容里的 frontmatter body 含 [[id]] 不影响解析
		const doc = await readFile(join(root, "wiki", "产品", "api.md"), "utf-8");
		expect(doc).toContain("source_hash: h1");
	});
});
