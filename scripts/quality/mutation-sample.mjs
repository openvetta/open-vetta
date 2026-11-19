#!/usr/bin/env node
/**
 * 每周抽样 mutation 检查：证明"测试会失败"。
 *
 * 为什么需要它：现有 19 条门禁防的是"流程偷懒"，没有一条防"验证伪造"。
 * 一个恒真测试、一个对着已修好的实现补出来的回归测试，都能让 CI 全绿。
 * 唯一能机械验证"这条测试真的在看行为"的办法，是把它看着的那行代码改坏，看它红不红。
 *
 * 成本：每次抽样 N 个文件、每个跑一次 test:impact，10–15 分钟量级，不进 CI，
 * 用 cron/本地周一跑，结果作为周报数字（存活率 > 20% 就该排查该区域）。
 *
 * 安全性：每次变异都先写 .bak，finally 里强制还原；中断后可用 `git checkout -- <file>` 兜底。
 * 只在干净工作区运行，避免和用户改动混在一起。
 */

import { execFileSync } from "node:child_process";
import { copyFileSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./lib.mjs";

const LIMIT = Number(process.env.VETTA_MUTATION_LIMIT ?? 20);

/** 语义等价度最高的几种文本变异：翻转比较、短路与或、取反布尔字面量。 */
const MUTATORS = [
	{ name: "=== → !==", find: /===/u, replace: "!==" },
	{ name: "!== → ===", find: /!==/u, replace: "===" },
	{ name: "<= → <", find: /<=/u, replace: "<" },
	{ name: ">= → >", find: />=/u, replace: ">" },
	{ name: "&& → ||", find: /&&/u, replace: "||" },
	{ name: "true → false", find: /\btrue\b/u, replace: "false" },
	{ name: "false → true", find: /\bfalse\b/u, replace: "true" },
];

function isCleanTree() {
	return execFileSync("git", ["status", "--porcelain"], { cwd: repoRoot, encoding: "utf8" }).trim() === "";
}

function sampleFiles() {
	const candidates = execFileSync("git", ["ls-files", "packages/*/src/**/*.ts", "apps/desktop/src/**/*.ts"], {
		cwd: repoRoot,
		encoding: "utf8",
	})
		.split("\n")
		.filter((file) => file && !file.endsWith(".test.ts") && !file.endsWith(".d.ts"));
	const picked = new Set();
	while (picked.size < LIMIT && picked.size < candidates.length) {
		picked.add(candidates[Math.floor(Math.random() * candidates.length)]);
	}
	return [...picked];
}

/** 返回 {name} 表示变异成功；null 表示该文件没有可用变异点。 */
function mutate(filePath) {
	const absolute = join(repoRoot, filePath);
	const original = readFileSync(absolute, "utf8");
	for (const mutator of MUTATORS) {
		if (!mutator.find.test(original)) continue;
		copyFileSync(absolute, `${absolute}.bak`);
		writeFileSync(absolute, original.replace(mutator.find, mutator.replace));
		return mutator.name;
	}
	return null;
}

function restore(filePath) {
	const absolute = join(repoRoot, filePath);
	try {
		renameSync(`${absolute}.bak`, absolute);
	} catch {
		// .bak 不存在说明 mutate 没写成功；git checkout 兜底在调用方
	}
	try {
		unlinkSync(`${absolute}.bak`);
	} catch {}
}

function testsFail(filePath) {
	try {
		execFileSync("node", ["scripts/quality/test-impact.mjs", filePath], { cwd: repoRoot, stdio: "ignore" });
		return false; // 退出码 0：测试没发现变异 → 存活
	} catch {
		return true; // 非 0：被杀 → 好事
	}
}

if (!isCleanTree()) {
	console.error("[mutation-sample] 工作区不干净，先提交或 stash 再跑（本脚本会临时改源码）");
	process.exit(2);
}

const results = [];
for (const file of sampleFiles()) {
	const applied = mutate(file);
	if (!applied) {
		results.push({ file, applied: "无变异点", survived: null });
		continue;
	}
	let survived;
	try {
		survived = !testsFail(file);
	} finally {
		restore(file);
	}
	results.push({ file, applied, survived });
}

const measured = results.filter((entry) => entry.survived !== null);
const survivors = measured.filter((entry) => entry.survived);
for (const entry of results) {
	const badge = entry.survived === null ? "skip" : entry.survived ? "SURVIVED" : "killed  ";
	console.log(`${badge}  ${entry.applied.padEnd(12)}  ${entry.file}`);
}
const rate = measured.length === 0 ? 0 : (survivors.length / measured.length) * 100;
console.log(
	`\n[mutation-sample] 存活 ${survivors.length}/${measured.length} = ${rate.toFixed(0)}%（>20% 说明这些区域缺少真实行为断言）`,
);
process.exit(rate > 20 ? 1 : 0);
