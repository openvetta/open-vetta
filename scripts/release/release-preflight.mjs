#!/usr/bin/env node

/**
 * 打 tag 之前的最后一道闸：在合并好的 main 上运行，确认要发的就是想发的那一版。
 *
 * 必须在推 tag 之前拦住，因为 desktop-release 对版本号对不上的 tag 只会跳过：
 * run 显示成功，什么都没发出去，监视也不会报警。
 *
 * 检查规则是纯函数（evaluatePreflight），git / gh 的事实由 collectFacts 收集，
 * 测试只喂事实、不碰真实仓库。
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { desktopVersion, parseReleaseStatus, releaseNotesPath } from "./release-notes.mjs";
import { classifyBump, latestReleasedVersion, lockfileDesktopVersion } from "./release-version.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PLACEHOLDER = /\b(TODO|TBD|FIXME)\b|待补|待填|占位/;

/** 发布说明里每个二级标题下的条目数。 */
export function countSections(text) {
	const counts = {};
	let current = null;
	for (const line of text.split(/\r?\n/)) {
		const heading = /^## (.+)$/.exec(line);
		if (heading) {
			current = heading[1].trim();
			counts[current] = 0;
		} else if (current && /^- \S/.test(line)) {
			counts[current] += 1;
		}
	}
	return counts;
}

/**
 * @param {object} facts
 * @returns {{ problems: string[], warnings: string[], summary: string[] }}
 */
export function evaluatePreflight(facts) {
	const problems = [];
	const warnings = [];
	const version = facts.tag.replace(/^v/, "");

	// 1. 版本号处处一致
	if (!/^v\d+\.\d+\.\d+$/.test(facts.tag)) problems.push(`tag 必须是 v<major>.<minor>.<patch>，收到 ${facts.tag}`);
	if (facts.packageVersion !== version) {
		problems.push(`apps/desktop/package.json 是 ${facts.packageVersion}，要打的 tag 是 ${facts.tag}（流水线会静默跳过）`);
	}
	if (facts.lockVersion !== version) problems.push(`bun.lock 里桌面端版本是 ${facts.lockVersion ?? "（没找到）"}，应为 ${version}`);
	if (!facts.notes) {
		problems.push(`缺少发布说明 ${releaseNotesPath(version)}`);
	} else {
		const title = /^# Vetta (.+)$/m.exec(facts.notes)?.[1]?.trim();
		if (title !== version) problems.push(`发布说明标题是「# Vetta ${title ?? "?"}」，应为「# Vetta ${version}」`);
	}

	// 2. 还没发过
	if (facts.localTagExists) problems.push(`本地已有 tag ${facts.tag}`);
	if (facts.remoteTagExists) problems.push(`远端已有 tag ${facts.tag}`);
	if (facts.githubReleaseExists) problems.push(`GitHub 上已有 Release ${facts.tag}`);
	if (facts.githubReleaseExists === null) warnings.push("没能查询 GitHub Release（gh 不可用或未登录），这一项没核对");
	const status = facts.notes ? parseReleaseStatus(facts.notes) : null;
	if (status && status.state !== "unreleased") {
		problems.push(`发布说明标着 ${status.state === "released" ? `已于 ${status.date} 发布` : "无状态（按已发布处理）"}`);
	}

	// 3. 比上一个已发布版本大，且没有跳号
	const bump = classifyBump(facts.latestReleased, version);
	if (bump === "invalid") problems.push(`${facts.tag} 不比最近一个已发布的 v${facts.latestReleased} 大`);
	if (bump === "irregular") {
		const message = `v${facts.latestReleased} → ${facts.tag} 跳了号或没有归零`;
		if (facts.allowIrregular) warnings.push(`${message}（已用 --allow-irregular 确认）`);
		else problems.push(`${message}；确认是有意的，加 --allow-irregular`);
	}

	// 4. 要发的内容就是 dev 的内容
	if (facts.branch !== "main") problems.push(`当前分支是 ${facts.branch || "（游离 HEAD）"}，应在合并好的 main 上运行`);
	if (!facts.devMerged) problems.push("dev 还没有完整合并进当前 HEAD");
	if (facts.treeDiffersFromDev) problems.push(`当前 HEAD 与 dev 的文件内容不一致：\n${facts.treeDiffersFromDev}`);
	if (facts.dirty) problems.push(`工作区有未提交的改动：\n${facts.dirty}`);

	// 5. 发布说明有内容
	const sections = facts.notes ? countSections(facts.notes) : {};
	const total = Object.values(sections).reduce((sum, n) => sum + n, 0);
	if (facts.notes && total === 0) problems.push("发布说明没有任何条目");
	if (facts.notes && PLACEHOLDER.test(facts.notes)) problems.push("发布说明里还有占位文字（TODO / TBD / 待补…）");

	const sectionText = Object.entries(sections)
		.filter(([, n]) => n > 0)
		.map(([name, n]) => `${name} ${n} 条`)
		.join(" / ");
	const bumpText = { patch: "修订号升级", minor: "次版本号升级", major: "主版本号升级", irregular: "跳号", invalid: "版本倒退" }[bump];
	const summary = [
		`将发布 ${facts.tag}（${bumpText}，上一个版本 ${facts.latestReleased ? `v${facts.latestReleased}` : "无"}）`,
		`  tag 指向：${facts.head}`,
		`  包含提交：${facts.commitCount} 个`,
		`  发布说明：${sectionText || "（空）"}`,
		...(facts.pluginChanges.length > 0 ? [`  插件版本：${facts.pluginChanges.join("，")}`] : []),
	];
	return { problems, warnings, summary };
}

function git(root, args, allowFail = false) {
	try {
		return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
	} catch (error) {
		if (allowFail) return null;
		throw error;
	}
}

function pluginChanges(root, previousTag) {
	if (!previousTag) return [];
	const files = git(root, ["ls-files", "packages/plugins/presets/*/plugin.json"]).split(/\r?\n/).filter(Boolean);
	const changes = [];
	for (const file of files) {
		const now = JSON.parse(readFileSync(join(root, file), "utf8"));
		const before = git(root, ["show", `${previousTag}:${file}`], true);
		const was = before ? JSON.parse(before).version : null;
		if (was !== now.version) changes.push(`${now.id ?? file} ${was ?? "新增"} → ${now.version}`);
	}
	return changes;
}

export function collectFacts({ root = repositoryRoot, tag, allowIrregular = false }) {
	git(root, ["fetch", "--tags", "--quiet", "origin"], true);
	const packageVersion = desktopVersion(root);
	const resolvedTag = tag ?? `v${packageVersion}`;
	const version = resolvedTag.replace(/^v/, "");
	const notesFile = join(root, releaseNotesPath(/^\d+\.\d+\.\d+$/.test(version) ? version : packageVersion));
	const tags = git(root, ["tag", "--list", "v*"]).split(/\r?\n/).filter(Boolean);
	const latestReleased = latestReleasedVersion(tags.filter((t) => t !== resolvedTag));
	let githubReleaseExists = null;
	try {
		execFileSync("gh", ["release", "view", resolvedTag, "--json", "tagName"], { cwd: root, stdio: "pipe" });
		githubReleaseExists = true;
	} catch (error) {
		const stderr = String(error?.stderr ?? "");
		githubReleaseExists = /release not found|not found/i.test(stderr) ? false : null;
	}
	const devMerged = git(root, ["merge-base", "--is-ancestor", "dev", "HEAD"], true) !== null;
	const diff = git(root, ["diff", "--stat", "dev", "HEAD"], true);
	return {
		tag: resolvedTag,
		packageVersion,
		lockVersion: lockfileDesktopVersion(readFileSync(join(root, "bun.lock"), "utf8")),
		notes: existsSync(notesFile) ? readFileSync(notesFile, "utf8") : null,
		localTagExists: tags.includes(resolvedTag),
		remoteTagExists: Boolean(git(root, ["ls-remote", "--tags", "origin", `refs/tags/${resolvedTag}`], true)),
		githubReleaseExists,
		latestReleased,
		allowIrregular,
		branch: git(root, ["branch", "--show-current"]),
		devMerged,
		treeDiffersFromDev: diff || "",
		dirty: git(root, ["status", "--porcelain", "--untracked-files=no"]),
		head: git(root, ["log", "-1", "--format=%h %s"]),
		commitCount: Number(
			git(root, ["rev-list", "--count", "--no-merges", latestReleased ? `v${latestReleased}..HEAD` : "HEAD"], true) ?? 0,
		),
		pluginChanges: pluginChanges(root, latestReleased ? `v${latestReleased}` : null),
	};
}

function main(argv) {
	const tagIndex = argv.indexOf("--tag");
	const tag = tagIndex === -1 ? undefined : argv[tagIndex + 1];
	const { problems, warnings, summary } = evaluatePreflight(collectFacts({ tag, allowIrregular: argv.includes("--allow-irregular") }));
	for (const line of summary) console.log(line);
	for (const warning of warnings) console.log(`注意：${warning}`);
	if (problems.length > 0) {
		console.error(`\n预检没通过，不要打 tag：\n- ${problems.join("\n- ")}`);
		process.exit(1);
	}
	console.log("\n预检通过。");
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
