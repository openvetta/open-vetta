/**
 * Keep the test suite from decaying into a green illusion.
 *
 * 四类退化都会让红灯消失而不验证任何行为，成本却只有 1 行：
 *   1. `it.skip` / `it.todo`        —— 直接关掉
 *   2. `toMatchSnapshot`            —— 自动生成、永远绿、无人阅读
 *   3. `it.only`                    —— 静默让其余用例不跑
 *   4. 空用例体 `it("x", () => {})` —— 满足「存在测试」却零断言
 *
 * 当前存量：0 快照、0 only、2 skip（均在 live 测试文件里）。趁存量接近 0 时立法，
 * 否则半年后要办一次「大赦」，门禁的公信力就没了。
 *
 * 配套的断言深度治理见 check-test-assertion-depth.mjs。
 */

import { join } from "node:path";
import { fail, isDirectRun, ok, readText, rel, repoRoot, walkFiles } from "./lib.mjs";

/**
 * 允许保留的 skip：path → { reason, owner, reviewBy }。
 * 只允许保留 live/凭据类测试，且必须写明为什么不能跑。到期必须重新确认。
 */
export const ALLOWED_SKIPS = Object.freeze({
	"packages/agent/test/bedrock-models.test.ts": {
		reason: "live Bedrock 模型枚举，需要真实 AWS 凭据和 BEDROCK_EXTENSIVE_MODEL_TEST=1",
		owner: "agent",
		reviewBy: "2027-06-30",
	},
	"packages/ai/test/stream.test.ts": {
		reason: "live Provider thinking 流，真实计费调用",
		owner: "ai",
		reviewBy: "2027-06-30",
	},
});

const SOURCE_DIRECTORIES = Object.freeze(["apps", "packages", "scripts"]);
const EXTENSIONS = Object.freeze([".ts", ".tsx", ".mjs", ".cjs"]);
const TEST_FILE = /\.(?:test|node-test)\.(?:ts|tsx|mjs|cjs)$/u;
const SELF = new Set(["scripts/quality/check-test-hygiene.mjs", "scripts/quality/check-test-hygiene.test.mjs"]);

/** 每种违规一条规则；顺序即报告顺序。 */
const RULES = Object.freeze([
	{
		id: "snapshot",
		pattern: /\btoMatch(?:Inline)?Snapshot\s*\(/u,
		message: "禁止快照断言：它自动生成、永远通过、没人阅读。改为断言用户可见结果或具体数值。",
	},
	{
		id: "only",
		pattern: /\b(?:it|test|describe)\.only\s*\(/u,
		message: "禁止 .only：它会静默跳过其余用例，本地绿而 CI 红。",
	},
	{
		id: "empty-test",
		pattern: /\b(?:it|test)\s*\(\s*(?:"[^"]*"|'[^']*'|`[^`]*`)\s*,\s*(?:async\s*)?\(\s*\)\s*=>\s*\{\s*\}\s*\)/u,
		message: "禁止空用例体：它满足「存在测试」，却零断言。要么写断言，要么删掉并让 test:impact 报错。",
	},
	{
		id: "skip",
		pattern: /\b(?:it|test|describe)\.(?:skip|todo)\s*\(/u,
		message: "禁止新增 .skip/.todo：红灯要修，不要在 ALLOWED_SKIPS 之外关掉它。",
	},
]);

function isTestFile(path) {
	return TEST_FILE.test(path);
}

export function findTestHygieneViolations(files) {
	const violations = [];
	for (const file of files) {
		if (SELF.has(file.path) || !isTestFile(file.path)) continue;
		const allowedHere = ALLOWED_SKIPS[file.path];
		for (const [index, line] of file.text.split(/\r?\n/u).entries()) {
			for (const rule of RULES) {
				if (!rule.pattern.test(line)) continue;
				if (rule.id === "skip" && allowedHere) continue;
				violations.push(`${file.path}:${index + 1}: [${rule.id}] ${rule.message}`);
			}
		}
		if (allowedHere) {
			const reviewBy = Date.parse(`${allowedHere.reviewBy}T00:00:00Z`);
			if (Number.isFinite(reviewBy) && reviewBy < Date.now()) {
				violations.push(
					`${file.path}: ALLOWED_SKIPS 条目已过期（reviewBy ${allowedHere.reviewBy}），请重新确认理由或修好测试`,
				);
			}
		}
	}
	return violations;
}

function collectFiles(selected) {
	const paths =
		selected.length > 0
			? selected
					.map((file) => file.replaceAll("\\", "/"))
					.filter((file) => isTestFile(file))
					.map((file) => join(repoRoot, file))
			: SOURCE_DIRECTORIES.flatMap((directory) =>
					walkFiles(join(repoRoot, directory), { extensions: [...EXTENSIONS] }),
				);
	return paths.map((filePath) => {
		try {
			return { path: rel(filePath), text: readText(filePath) };
		} catch {
			return { path: rel(filePath), text: "" };
		}
	});
}

if (isDirectRun(import.meta.url)) {
	const files = collectFiles(process.argv.slice(2));
	const violations = findTestHygieneViolations(files);
	if (violations.length > 0) {
		for (const violation of violations) fail(`[test-hygiene] ${violation}`);
	} else {
		ok(`[test-hygiene] ok (${files.filter((file) => isTestFile(file.path)).length} test files)`);
	}
}
