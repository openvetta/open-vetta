#!/usr/bin/env node

/**
 * 发布说明的唯一寻址入口：版本号 → `.github/release-notes/v<version>.md`。
 *
 * 发布流水线拿它做两件事：质量阶段校验文件存在（缺了就早早失败，而不是等到
 * 签名、公证、四个平台都跑完才发现没有 Release 正文），发布阶段解析出路径喂给
 * `gh release create --notes-file`。
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const RELEASE_NOTES_DIR = ".github/release-notes";

export function desktopVersion(root = repositoryRoot) {
	const manifest = JSON.parse(readFileSync(join(root, "apps/desktop/package.json"), "utf8"));
	const version = manifest.version;
	if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) {
		throw new Error(`Invalid desktop version in apps/desktop/package.json: ${String(version)}`);
	}
	return version;
}

export function releaseNotesPath(version) {
	if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Invalid release version: ${version}`);
	return `${RELEASE_NOTES_DIR}/v${version}.md`;
}

export function releaseNotesMissingMessage(version) {
	return [
		`Missing release notes for v${version}: ${releaseNotesPath(version)}`,
		"每个版本都要有发布说明——它就是 GitHub Release 的正文。",
		`新建 ${releaseNotesPath(version)}，写法见 ${RELEASE_NOTES_DIR}/README.md。`,
	].join("\n");
}

/** 存在则返回相对仓库根的路径，缺失时抛出可直接给人看的说明。 */
export function requireReleaseNotes(version, root = repositoryRoot) {
	const path = releaseNotesPath(version);
	if (!existsSync(join(root, path))) throw new Error(releaseNotesMissingMessage(version));
	return path;
}

/**
 * 发布状态标记：标题下一行的一条 HTML 注释。文件会原样作为 GitHub Release 正文，
 * 注释在页面上不显示，却能让人和 agent 不再靠猜 tag 判断「这个版本发没发」。
 * 没有标记的旧文件一律当作已发布：漏标只会拦住发版，不会让人往已发布的说明里续写。
 */
const STATUS_PATTERN = /^<!-- release-status: (unreleased|released(?: (\d{4}-\d{2}-\d{2}))?) -->$/m;

export const unreleasedMarker = () => "<!-- release-status: unreleased -->";
export const releasedMarker = (date) => `<!-- release-status: released ${date} -->`;

/** @returns {{ state: "unreleased" | "released" | "unmarked", date: string | null }} */
export function parseReleaseStatus(text) {
	const match = STATUS_PATTERN.exec(text);
	if (!match) return { state: "unmarked", date: null };
	if (match[1] === "unreleased") return { state: "unreleased", date: null };
	return { state: "released", date: match[2] ?? null };
}

export function readReleaseStatus(version, root = repositoryRoot) {
	return parseReleaseStatus(readFileSync(join(root, requireReleaseNotes(version, root)), "utf8"));
}

/** 发版前的校验：文件存在，且明确标着还没发布。 */
export function requireUnreleasedNotes(version, root = repositoryRoot) {
	const path = requireReleaseNotes(version, root);
	const status = parseReleaseStatus(readFileSync(join(root, path), "utf8"));
	if (status.state === "unreleased") return path;
	const why =
		status.state === "released"
			? `已于 ${status.date ?? "某日"} 发布`
			: "没有 release-status 标记，按已发布处理";
	throw new Error(
		[
			`v${version} ${why}，不能再发一次：${path}`,
			"要发新版本，先用 node scripts/release/release-version.mjs --start-next 开下一个版本。",
		].join("\n"),
	);
}

/** 发版完成后把状态标记改成已发布。只接受明确标着 unreleased 的文件。 */
export function markReleased(version, date, root = repositoryRoot) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Invalid release date: ${date}`);
	const path = requireUnreleasedNotes(version, root);
	const full = join(root, path);
	const text = readFileSync(full, "utf8");
	writeFileSync(full, text.replace(STATUS_PATTERN, releasedMarker(date)));
	return path;
}

const today = () => new Date().toISOString().slice(0, 10);

function argValue(argv, flag) {
	const index = argv.indexOf(flag);
	if (index === -1) return undefined;
	const value = argv[index + 1];
	if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
	return value;
}

function main(argv) {
	const version = argValue(argv, "--version") ?? desktopVersion();
	if (argv.includes("--mark-released")) {
		const path = markReleased(version, argValue(argv, "--date") ?? today());
		console.log(`Marked v${version} as released: ${path}`);
		return;
	}
	if (argv.includes("--status")) {
		const status = readReleaseStatus(version);
		console.log(`v${version}: ${status.state}${status.date ? ` ${status.date}` : ""}`);
		return;
	}
	// --check 只做校验（存在且未发布）；默认打印路径，方便 shell 里直接代入 --notes-file。
	if (argv.includes("--check")) {
		const path = requireUnreleasedNotes(version);
		console.log(`Release notes found for v${version}: ${path}`);
		return;
	}
	console.log(requireReleaseNotes(version));
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
