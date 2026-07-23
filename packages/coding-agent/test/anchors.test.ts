import { describe, expect, test } from "vitest";
import {
	anchorLineHash,
	parseAnchor,
	renderAnchoredLines,
	renderAnchorRegion,
	validateAnchor,
} from "../src/core/tools/anchors.js";

describe("anchorLineHash", () => {
	test("2 base36 chars, whitespace-insensitive", () => {
		const h = anchorLineHash("const x = 1;");
		expect(h).toMatch(/^[0-9a-z]{2}$/);
		expect(anchorLineHash("  const x = 1;  ")).toBe(h);
		expect(anchorLineHash("const\tx =  1;")).toBe(h);
		expect(anchorLineHash("const y = 1;")).not.toBe(h);
	});
});

describe("parseAnchor", () => {
	test("parses line:hash", () => {
		expect(parseAnchor("42:ab")).toEqual({ line: 42, hash: "ab" });
	});
	test("tolerates a full anchored line pasted in (strips → and content)", () => {
		expect(parseAnchor("42:ab→const x = 1;")).toEqual({ line: 42, hash: "ab" });
	});
	test("rejects malformed anchors", () => {
		expect(parseAnchor("42")).toBeUndefined();
		expect(parseAnchor("ab:42")).toBeUndefined();
		expect(parseAnchor("0:ab")).toBeUndefined();
		expect(parseAnchor("42:abc")).toBeUndefined();
		expect(parseAnchor("")).toBeUndefined();
	});
});

describe("validateAnchor", () => {
	const lines = ["alpha", "beta", "gamma", "delta", "epsilon"];
	const anchorFor = (line: number) => ({ line, hash: anchorLineHash(lines[line - 1]) });

	test("ok when line and hash match", () => {
		expect(validateAnchor(lines, anchorFor(3))).toEqual({ status: "ok", line: 3 });
	});

	test("shifted: hash found within radius when line moved", () => {
		// 声称在第 1 行，内容其实在第 3 行
		const anchor = { line: 1, hash: anchorLineHash("gamma") };
		expect(validateAnchor(lines, anchor)).toEqual({ status: "shifted", line: 3 });
	});

	test("stale when hash not found within radius", () => {
		const anchor = { line: 2, hash: anchorLineHash("nonexistent-content") };
		expect(validateAnchor(lines, anchor)).toEqual({ status: "stale" });
	});

	test("stale when shift exceeds radius", () => {
		const many = Array.from({ length: 100 }, (_, i) => `line-${i}`);
		many[99] = "target";
		const anchor = { line: 1, hash: anchorLineHash("target") };
		expect(validateAnchor(many, anchor, 20)).toEqual({ status: "stale" });
	});
});

describe("renderAnchoredLines / renderAnchorRegion", () => {
	test("prefixes each line with its anchor", () => {
		const rendered = renderAnchoredLines(["a", "b"], 10);
		expect(rendered[0]).toBe(`10:${anchorLineHash("a")}→a`);
		expect(rendered[1]).toBe(`11:${anchorLineHash("b")}→b`);
	});

	test("region clamps to file bounds", () => {
		const lines = ["a", "b", "c"];
		const region = renderAnchorRegion(lines, 1, 3);
		expect(region.split("\n")).toHaveLength(3);
		expect(region.startsWith(`1:${anchorLineHash("a")}→a`)).toBe(true);
	});
});
