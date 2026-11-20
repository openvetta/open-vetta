#!/usr/bin/env node

/**
 * 发版素材：把「上一版之后到 HEAD」的提交整理成起草发布说明时该看的清单。
 *
 * 发布说明的正文不再在开发过程中逐条追加——那是流水账。定稿发生在发版当天，
 * 原料是 commit 与 PR 描述（PR 模板里的「What users will see」就是用户语言），
 * 这个脚本只负责把原料一次性取全，免得 agent 每次自己拼 git log 参数而漏掉东西。
 *
 * 输出是给人看的素材，不是正文；正文格式见 release-notes-format.mjs。
 */

import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { latestReleasedVersion } from "./release-version.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const FIELD = "\u001f";
const RECORD = "\u001e";

function git(root, args) {
	return execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }).trim();
}

/** 把 `git log --format=%h%x1f%s%x1f%b%x1e` 的输出拆成提交列表，正文只留第一段。 */
export function parseCommitLog(output) {
	return String(output ?? "")
		.split(RECORD)
		.map((record) => record.trim())
		.filter(Boolean)
		.map((record) => {
			const [sha = "", subject = "", body = ""] = record.split(FIELD);
			const why = body
				.split(/\r?\n\r?\n/)
				.map((paragraph) => paragraph.trim())
				.find(Boolean);
			return { sha: sha.trim(), subject: subject.trim(), why: why ?? null };
		});
}

/** 提交触及的顶层区域：apps/desktop、packages/plugins/presets/foo、docs…… */
export function areaOf(file) {
	const parts = file.split("/");
	if (parts.length === 1) return parts[0];
	if (parts[0] === "packages" && parts[1] === "plugins" && parts[2] && parts[3]) {
		return `packages/plugins/${parts[2]}/${parts[3]}`;
	}
	if ((parts[0] === "apps" || parts[0] === "packages") && parts[1]) return `${parts[0]}/${parts[1]}`;
	return parts[0];
}

/** 按文件数从多到少返回区域，起草时据此判断「这次主要动了哪块」。 */
export function summarizeAreas(files) {
	const counts = new Map();
	for (const file of files) {
		const area = areaOf(file);
		counts.set(area, (counts.get(area) ?? 0) + 1);
	}
	return [...counts.entries()]
		.map(([area, files]) => ({ area, files }))
		.sort((a, b) => b.files - a.files || a.area.localeCompare(b.area));
}

function issueRefs(subject) {
	return [...subject.matchAll(/(?<![\w/])#(\d+)/g)].map((match) => `#${match[1]}`);
}

export function formatDigest({ from, to, commits, areas, fileCount }) {
	const lines = [
		`# 发版素材：${from ?? "仓库起点"} → ${to}`,
		"",
		"这是起草发布说明的原料，不是正文。按「用户看到的区域」合并同类，写成双语条目：",
		"用户看不出差别的一律不写，细节留在 commit 与 PR 描述里。",
		"",
		`涉及区域：${areas.length > 0 ? areas.map((entry) => `${entry.area}（${entry.files} 个文件）`).join("、") : "无文件变化"}`,
		"",
		`## 提交（${commits.length} 个，不含合并提交，共 ${fileCount} 个文件变化）`,
		"",
	];
	for (const commit of commits) {
		lines.push(`- ${commit.sha} ${commit.subject}`);
		const refs = issueRefs(commit.subject);
		if (refs.length > 0) lines.push(`  - 关联：${refs.join("、")}（\`gh pr view <编号>\` 可读「What users will see」）`);
		if (commit.why) lines.push(`  - 动机：${commit.why.replace(/\s*\n\s*/g, " ")}`);
	}
	if (commits.length === 0) lines.push("（这个区间没有提交）");
	return `${lines.join("\n")}\n`;
}

export function collectDigest({ root = repositoryRoot, from = null, to = "HEAD", limit = 200 } = {}) {
	const version = latestReleasedVersion(git(root, ["tag", "--list", "v*"]).split(/\r?\n/).filter(Boolean));
	const since = from ?? (version ? `v${version}` : null);
	const range = since ? `${since}..${to}` : to;
	const commits = parseCommitLog(
		git(root, ["log", "--no-merges", `--max-count=${limit}`, "--format=%h%x1f%s%x1f%b%x1e", range]),
	);
	const files = git(root, ["diff", "--name-only", range]).split(/\r?\n/).filter(Boolean);
	return { from: since, to, commits, areas: summarizeAreas(files), fileCount: files.length };
}

function main(argv) {
	const fromIndex = argv.indexOf("--from");
	const from = fromIndex === -1 ? null : argv[fromIndex + 1];
	const toIndex = argv.indexOf("--to");
	const to = toIndex === -1 ? "HEAD" : argv[toIndex + 1];
	const digest = collectDigest({ from, to });
	if (argv.includes("--json")) {
		console.log(JSON.stringify(digest, null, 2));
		return;
	}
	console.log(formatDigest(digest));
}

function isExecutedDirectly() {
	const invoked = process.argv[1];
	if (!invoked) return false;
	return fileURLToPath(import.meta.url).toLowerCase() === resolve(invoked).toLowerCase();
}

if (isExecutedDirectly()) {
	try {
		main(process.argv.slice(2));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
