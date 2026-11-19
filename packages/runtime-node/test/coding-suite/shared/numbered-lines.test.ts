import { describe, expect, test } from "vitest";
import {
	lineNumberRange,
	renderNumberedLines,
	renderNumberedRegion,
	stripLineNumberPrefixes,
} from "../../../src/coding/shared/numbered-lines.js";

describe("renderNumberedLines", () => {
	test("prefixes each line with its 1-based number and nothing else", () => {
		expect(renderNumberedLines(["a", "b"], 10)).toEqual(["10:a", "11:b"]);
	});

	test("keeps empty lines addressable", () => {
		// A blank line still has its own number — that is the whole point of numbering instead of
		// hashing content, where every blank line shares one identity.
		expect(renderNumberedLines(["", "", "x"], 1)).toEqual(["1:", "2:", "3:x"]);
	});
});

describe("renderNumberedRegion", () => {
	test("clamps to file bounds", () => {
		const region = renderNumberedRegion(["a", "b", "c"], 1, 3);
		expect(region.split("\n")).toHaveLength(3);
		expect(region.startsWith("1:a")).toBe(true);
	});

	test("reports an empty file explicitly", () => {
		expect(renderNumberedRegion([], 1, 2)).toBe("(file is empty)");
	});
});

describe("stripLineNumberPrefixes", () => {
	test("removes a number the model was shown for the block it replaces", () => {
		const result = stripLineNumberPrefixes("42:const a = 1;", lineNumberRange(42, 42));
		expect(result.text).toBe("const a = 1;");
		expect(result.strippedLines).toEqual([1]);
	});

	test("removes a consecutive run copied from the replaced range", () => {
		const result = stripLineNumberPrefixes("42:a\n43:b", lineNumberRange(42, 43));
		expect(result.text).toBe("a\nb");
		expect(result.strippedLines).toEqual([1, 2]);
	});

	test("leaves a number that was not part of the replaced block alone", () => {
		// Real content such as a `12:` mapping key must survive: only numbers the model was actually
		// shown for this block are treated as leaked prefixes.
		const result = stripLineNumberPrefixes("7:a\n12:b", lineNumberRange(7, 7));
		expect(result.text).toBe("a\n12:b");
		expect(result.strippedLines).toEqual([1]);
	});

	test("leaves text without prefixes untouched", () => {
		const result = stripLineNumberPrefixes("const a = 1;", lineNumberRange(1, 9));
		expect(result.text).toBe("const a = 1;");
		expect(result.strippedLines).toEqual([]);
	});
});
