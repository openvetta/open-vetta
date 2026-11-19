/**
 * 断言深度棘轮：`toHaveBeenCalled*` 只许降，不许升。
 *
 * 为什么要管这一条：`expect(fn).toHaveBeenCalled()` 只证明「我调用了它」，
 * 不证明「用户目标成立」。它对实现细节上锁，重构时要么挂、要么被无脑刷新。
 * 但它是**成本最低的绿灯**——在红灯压力和上下文将满时，Agent 会稳定地选它。
 *
 * 实测存量（2026-11-18）：2,858 次 / 620 个文件 / 占全部断言 10.4%。
 * 这个数字不完美（`expect(fetch).not.toHaveBeenCalled()` 其实是强断言），
 * 但作为**趋势盯防**足够：只要求它不涨。
 *
 * 维护方式与 baselines/coding-agent-rewrite.json 一致：
 *   - 删条目 = 该文件已清理干净（值得庆祝）
 *   - 加条目或调高数值 = 必须说明理由
 *   - 新增测试文件默认上限 0
 */

import { join } from "node:path";
import { fail, isDirectRun, ok, readText, rel, repoRoot, walkFiles } from "./lib.mjs";

const BASELINE_PATH = join(repoRoot, "scripts/quality/baselines/test-assertion-baseline.json");
const SOURCE_DIRECTORIES = Object.freeze(["apps", "packages", "scripts"]);
const EXTENSIONS = Object.freeze([".ts", ".tsx", ".mjs", ".cjs"]);
const TEST_FILE = /\.(?:test|node-test)\.(?:ts|tsx|mjs|cjs)$/u;
const WEIRD = /\btoHaveBeenCalled(?:Times|With|Once)?\b/gu;

export function loadAssertionBaseline(text) {
	const parsed = JSON.parse(text);
	const files = parsed.weakAssertionFiles ?? {};
	if (typeof files !== "object" || files === null || Array.isArray(files)) {
		throw new Error("[test-assertion-depth] baseline 缺少 weakAssertionFiles 对象");
	}
	return { version: parsed.version ?? 0, files };
}

export function countWeakAssertions(text) {
	return (text.match(WEIRD) ?? []).length;
}

export function findAssertionDepthViolations(files, baseline) {
	const violations = [];
	for (const file of files) {
		if (!TEST_FILE.test(file.path)) continue;
		const actual = countWeakAssertions(file.text);
		const allowed = baseline.files[file.path] ?? 0;
		if (actual <= allowed) continue;
		const known = file.path in baseline.files;
		violations.push(
			`${file.path}: 调用类断言 ${actual} 次，超出基线 ${allowed} 次。` +
				`改为断言可观察结果（最终状态、持久化事实、用户可见输出）；` +
				(known
					? `若确实只能验证边界调用，说明理由后显式更新基线——只许降不许升。`
					: `新增测试文件默认预算 0：要豁免必须在本文件写明理由并同步基线。`),
		);
	}
	return violations;
}

function collectFiles(selected) {
	const paths =
		selected.length > 0
			? selected
					.map((file) => file.replaceAll("\\", "/"))
					.filter((file) => TEST_FILE.test(file))
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
	const args = process.argv.slice(2);
	const report = args.includes("--report");
	const selected = args.filter((argument) => !argument.startsWith("--"));
	const files = collectFiles(selected);
	const baseline = loadAssertionBaseline(readText(BASELINE_PATH));
	const violations = findAssertionDepthViolations(files, baseline);
	if (report) {
		const ranked = files
			.map((file) => ({
				path: file.path,
				actual: countWeakAssertions(file.text),
				allowed: baseline.files[file.path] ?? 0,
			}))
			.filter((entry) => entry.actual > 0)
			.sort((a, b) => b.actual - b.allowed - (a.actual - a.allowed) || b.actual - a.actual);
		for (const entry of ranked.slice(0, 20)) {
			const delta = entry.actual - entry.allowed;
			ok(
				`[test-assertion-depth] ${String(entry.actual).padStart(4)} 次 (基线 ${entry.allowed}, Δ${delta >= 0 ? "+" : ""}${delta})  ${entry.path}`,
			);
		}
	}
	if (violations.length > 0) {
		for (const violation of violations) fail(`[test-assertion-depth] ${violation}`);
	} else {
		ok(`[test-assertion-depth] ok (${files.filter((file) => TEST_FILE.test(file.path)).length} test files)`);
	}
}
