import { describe, expect, it } from "vitest";
import {
	countWeakAssertions,
	findAssertionDepthViolations,
	loadAssertionBaseline,
} from "./check-test-assertion-depth.mjs";

const file = (path, text) => ({ path, text });

/** 拼接构造，避免本文件自身被棘轮计入。 */
const WEAK = "toHaveBeen" + "Called";
const weak = (suffix = "") => `${WEAK}${suffix}`;

describe("assertion depth ratchet", () => {
	const baseline = loadAssertionBaseline(
		JSON.stringify({ version: 1, weakAssertionFiles: { "apps/desktop/src/a.test.ts": 2 } }),
	);

	it("counts every call-shaped assertion variant", () => {
		expect(countWeakAssertions(`expect(a).${weak()}; expect(b).${weak()}Times(2);`)).toBe(2);
	});

	it("fails only when a file exceeds its baseline", () => {
		const atBaseline = findAssertionDepthViolations(
			[file("apps/desktop/src/a.test.ts", `expect(a).${weak()}; expect(b).${weak()};`)],
			baseline,
		);
		expect(atBaseline).toEqual([]);
		const grown = findAssertionDepthViolations(
			[file("apps/desktop/src/a.test.ts", `expect(a).${weak()}; expect(b).${weak()}; expect(c).${weak()};`)],
			baseline,
		);
		expect(grown).toHaveLength(1);
		expect(grown[0]).toContain("超出基线 2 次");
	});

	it("gives new test files a zero budget", () => {
		const unbudgeted = findAssertionDepthViolations(
			[file("apps/desktop/src/new.test.ts", `expect(a).${weak()};`)],
			baseline,
		);
		expect(unbudgeted).toHaveLength(1);
		expect(unbudgeted[0]).toContain("新增测试文件默认预算 0");
		expect(
			findAssertionDepthViolations([file("apps/desktop/src/new.test.ts", "expect(a).toBe(1);")], baseline),
		).toEqual([]);
	});
});
