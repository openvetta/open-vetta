import { describe, expect, it } from "vitest";
import { findTestHygieneViolations } from "./check-test-hygiene.mjs";

const file = (path, text) => ({ path, text });

describe("test hygiene guard", () => {
	it("rejects snapshot assertions", () => {
		const violations = findTestHygieneViolations([
			file("apps/desktop/src/a.test.ts", "expect(tree).toMatchSnapshot();"),
		]);
		expect(violations).toHaveLength(1);
		expect(violations[0]).toContain("[snapshot]");
	});

	it("rejects .only and empty test bodies", () => {
		const violations = findTestHygieneViolations([
			file("apps/desktop/src/a.test.ts", 'describe.only("x", () => {});'),
			file("apps/desktop/src/b.test.ts", 'it("does nothing", () => {});'),
		]);
		expect(violations.map((line) => line.match(/\[(?:only|empty-test)\]/u)?.[0])).toEqual(["[only]", "[empty-test]"]);
	});

	it("allows .skip only inside the reviewed allowlist", () => {
		const denied = findTestHygieneViolations([file("apps/desktop/src/a.test.ts", 'it.skip("x", () => {});')]);
		expect(denied).toHaveLength(1);
		const allowed = findTestHygieneViolations([
			file("packages/agent/test/bedrock-models.test.ts", 'it.skip("skipped - set AWS credentials", () => {});'),
		]);
		expect(allowed).toEqual([]);
	});

	it("ignores non-test files and its own sources", () => {
		const violations = findTestHygieneViolations([
			file("apps/desktop/src/a.ts", "expect(tree).toMatchSnapshot();"),
			file("scripts/quality/check-test-hygiene.mjs", "expect(tree).toMatchSnapshot();"),
			file("scripts/quality/check-test-hygiene.test.mjs", "expect(tree).toMatchSnapshot();"),
		]);
		expect(violations).toEqual([]);
	});
});
