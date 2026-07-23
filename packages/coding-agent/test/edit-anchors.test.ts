import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { anchorLineHash } from "../src/core/tools/anchors.js";
import { createEditTool } from "../src/core/tools/edit/index.js";

describe("edit tool anchor mode", () => {
	let dir: string;
	let file: string;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "vetta-edit-anchors-"));
		file = join(dir, "sample.ts");
		writeFileSync(file, ["const a = 1;", "const b = 2;", "const c = 3;", "const d = 4;", "const e = 5;"].join("\n"));
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	const anchorFor = (content: string, line: number) => `${line}:${anchorLineHash(content)}`;
	const tool = () => createEditTool(dir);

	test("replaces a single anchored line", async () => {
		const result = await tool().execute("t", {
			path: file,
			edits: [{ anchor: anchorFor("const b = 2;", 2), new_text: "const b = 20;" }],
		});
		expect(readFileSync(file, "utf-8").split("\n")[1]).toBe("const b = 20;");
		expect(result.details?.appliedEdits).toBe(1);
		expect((result.content[0] as { type: "text"; text: string }).text).toContain("Fresh anchors");
	});

	test("replaces an inclusive range and deletes with empty new_text", async () => {
		await tool().execute("t", {
			path: file,
			edits: [
				{
					anchor: anchorFor("const b = 2;", 2),
					end_anchor: anchorFor("const d = 4;", 4),
					new_text: "",
				},
			],
		});
		expect(readFileSync(file, "utf-8")).toBe("const a = 1;\nconst e = 5;");
	});

	test("insert_after inserts below the anchor line", async () => {
		await tool().execute("t", {
			path: file,
			edits: [{ anchor: anchorFor("const a = 1;", 1), new_text: "const a2 = 1.5;", insert_after: true }],
		});
		const lines = readFileSync(file, "utf-8").split("\n");
		expect(lines[0]).toBe("const a = 1;");
		expect(lines[1]).toBe("const a2 = 1.5;");
		expect(lines[2]).toBe("const b = 2;");
	});

	test("multi-edit batch applies with line-number compensation", async () => {
		await tool().execute("t", {
			path: file,
			edits: [
				{ anchor: anchorFor("const a = 1;", 1), new_text: "const a = 1;\nconst a1 = 11;" },
				{ anchor: anchorFor("const e = 5;", 5), new_text: "const e = 50;" },
			],
		});
		const lines = readFileSync(file, "utf-8").split("\n");
		expect(lines).toHaveLength(6);
		expect(lines[1]).toBe("const a1 = 11;");
		expect(lines[5]).toBe("const e = 50;");
	});

	test("shifted anchor is recovered by hash search", async () => {
		// 声称第 1 行，内容实际在第 4 行
		await tool().execute("t", {
			path: file,
			edits: [{ anchor: anchorFor("const d = 4;", 1), new_text: "const d = 40;" }],
		});
		expect(readFileSync(file, "utf-8").split("\n")[3]).toBe("const d = 40;");
	});

	test("stale anchor rejects the WHOLE batch and returns fresh anchors", async () => {
		const goodAnchor = anchorFor("const a = 1;", 1);
		await expect(
			tool().execute("t", {
				path: file,
				edits: [
					{ anchor: goodAnchor, new_text: "const a = 10;" },
					{ anchor: "3:zz", new_text: "const c = 30;" },
				],
			}),
		).rejects.toThrow(/STALE[\s\S]*Fresh anchors[\s\S]*Retry the FULL batch/);
		// 原子性：好锚点也未应用
		expect(readFileSync(file, "utf-8").split("\n")[0]).toBe("const a = 1;");
	});

	test("overlapping edits are rejected", async () => {
		await expect(
			tool().execute("t", {
				path: file,
				edits: [
					{ anchor: anchorFor("const b = 2;", 2), end_anchor: anchorFor("const d = 4;", 4), new_text: "x" },
					{ anchor: anchorFor("const c = 3;", 3), new_text: "y" },
				],
			}),
		).rejects.toThrow(/overlap/);
	});

	test("malformed anchor errors immediately", async () => {
		await expect(
			tool().execute("t", { path: file, edits: [{ anchor: "not-an-anchor", new_text: "x" }] }),
		).rejects.toThrow(/malformed/);
	});

	test("mode exclusivity and missing payload", async () => {
		await expect(
			tool().execute("t", { path: file, oldText: "const a = 1;", newText: "x", edits: [] }),
		).rejects.toThrow(/not both/);
		await expect(tool().execute("t", { path: file })).rejects.toThrow(/Missing edit payload/);
	});

	test("exact-text mode still works (backwards compatible)", async () => {
		const result = await tool().execute("t", {
			path: file,
			oldText: "const c = 3;",
			newText: "const c = 33;",
		});
		expect(readFileSync(file, "utf-8").split("\n")[2]).toBe("const c = 33;");
		expect(result.details?.diff).toContain("const c = 33;");
	});

	test("preserves CRLF line endings", async () => {
		writeFileSync(file, "a\r\nb\r\nc");
		await tool().execute("t", {
			path: file,
			edits: [{ anchor: `2:${anchorLineHash("b")}`, new_text: "B" }],
		});
		expect(readFileSync(file, "utf-8")).toBe("a\r\nB\r\nc");
	});
});
