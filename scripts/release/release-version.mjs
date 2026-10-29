#!/usr/bin/env node

/**
 * 桌面端版本号的两种变更，都只在 dev 上做：
 *
 * - `--start-next [patch|minor|major|x.y.z]`：上一个版本发布完成之后开下一个版本。
 *   要求当前版本的发布说明已经标成 released，免得把还没发的版本跳过去。
 * - `--retarget x.y.z`：开发到一半决定这一版换个版本号（比如 0.5.70 改叫 0.6.0）。
 *   发布说明改名、改标题，已有条目原样保留；只允许还没发布的版本。
 *
 * 两者都同步改 apps/desktop/package.json 与 bun.lock 里的桌面端版本，并新建或改名
 * `.github/release-notes/v<version>.md`。版本号必须比最近一个已发布的 tag 大。
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	desktopVersion,
	parseReleaseStatus,
	releaseNotesPath,
	requireReleaseNotes,
	requireUnreleasedNotes,
	unreleasedMarker,
} from "./release-notes.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DESKTOP_PACKAGE_PATH = "apps/desktop/package.json";
const LOCKFILE_PATH = "bun.lock";
const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

function parts(version) {
	const match = VERSION_PATTERN.exec(version);
	if (!match) throw new Error(`Invalid desktop version: ${version}`);
	return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareVersions(a, b) {
	const [x, y] = [parts(a), parts(b)];
	for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
	return 0;
}

/** `spec` 是 patch / minor / major，或直接给出的 x.y.z。 */
export function nextVersion(current, spec = "patch") {
	const [major, minor, patch] = parts(current);
	if (spec === "patch") return `${major}.${minor}.${patch + 1}`;
	if (spec === "minor") return `${major}.${minor + 1}.0`;
	if (spec === "major") return `${major + 1}.0.0`;
	parts(spec);
	return spec;
}

/**
 * 相对上一个已发布版本，这一版升了哪一位。
 * - patch / minor / major：正常的下一个版本。
 * - irregular：比上一个大，但跳了号或没归零（0.5.69 → 0.5.72、0.5.69 → 0.6.1），多半是打错，要人确认。
 * - invalid：不比上一个大。
 */
export function classifyBump(previous, next) {
	if (!previous) return "patch";
	if (compareVersions(next, previous) <= 0) return "invalid";
	if (next === nextVersion(previous, "patch")) return "patch";
	if (next === nextVersion(previous, "minor")) return "minor";
	if (next === nextVersion(previous, "major")) return "major";
	return "irregular";
}

/** 一组 tag 里最大的 `v<semver>`；没有时为 null。 */
export function latestReleasedVersion(tags) {
	const versions = tags
		.map((tag) => /^v(\d+\.\d+\.\d+)$/.exec(tag.trim())?.[1])
		.filter((version) => version !== undefined);
	return versions.sort(compareVersions).at(-1) ?? null;
}

/** 只改 bun.lock 里 apps/desktop 那一块的 version，其余字节不动。 */
export function setLockfileDesktopVersion(text, version) {
	const pattern = /("apps\/desktop": \{\s*"name": "@vetta\/desktop",\s*"version": ")(\d+\.\d+\.\d+)(")/;
	if (!pattern.test(text)) throw new Error("bun.lock has no apps/desktop workspace entry with a version");
	return text.replace(pattern, `$1${version}$3`);
}

export function lockfileDesktopVersion(text) {
	return /"apps\/desktop": \{\s*"name": "@vetta\/desktop",\s*"version": "(\d+\.\d+\.\d+)"/.exec(text)?.[1] ?? null;
}

function writeVersion(root, version) {
	const packagePath = join(root, DESKTOP_PACKAGE_PATH);
	const manifest = JSON.parse(readFileSync(packagePath, "utf8"));
	manifest.version = version;
	writeFileSync(packagePath, `${JSON.stringify(manifest, null, "\t")}\n`);
	const lockPath = join(root, LOCKFILE_PATH);
	if (existsSync(lockPath)) writeFileSync(lockPath, setLockfileDesktopVersion(readFileSync(lockPath, "utf8"), version));
}

function assertNewerThanReleased(version, latestReleased, allowIrregular) {
	const bump = classifyBump(latestReleased, version);
	if (bump === "invalid") throw new Error(`v${version} 不比最近一个已发布的 v${latestReleased} 大`);
	if (bump === "irregular" && !allowIrregular) {
		throw new Error(
			`v${latestReleased} → v${version} 跳了号或没有归零。确认是有意的，加 --allow-irregular 再执行。`,
		);
	}
	return bump;
}

/** 开下一个版本。当前版本必须已经标成 released。 */
export function startNext({ root = repositoryRoot, spec = "patch", latestReleased, allowIrregular = false }) {
	const current = desktopVersion(root);
	const status = parseReleaseStatus(readFileSync(join(root, requireReleaseNotes(current, root)), "utf8"));
	if (status.state === "unreleased") {
		throw new Error(`v${current} 还没发布，不能开下一个版本。要改这一版的版本号用 --retarget。`);
	}
	const version = nextVersion(current, spec);
	const bump = assertNewerThanReleased(version, latestReleased ?? current, allowIrregular);
	const notesPath = releaseNotesPath(version);
	if (existsSync(join(root, notesPath))) throw new Error(`${notesPath} 已存在`);
	writeVersion(root, version);
	writeFileSync(join(root, notesPath), `# Vetta ${version}\n${unreleasedMarker()}\n`);
	return { from: current, version, bump, notesPath };
}

/** 改这一版的版本号。只允许还没发布的版本，已有条目原样带过去。 */
export function retarget({ root = repositoryRoot, version, latestReleased, allowIrregular = false }) {
	const current = desktopVersion(root);
	if (version === current) throw new Error(`当前已经是 v${current}`);
	const fromPath = requireUnreleasedNotes(current, root);
	const bump = assertNewerThanReleased(version, latestReleased, allowIrregular);
	const toPath = releaseNotesPath(version);
	if (existsSync(join(root, toPath))) throw new Error(`${toPath} 已存在`);
	const text = readFileSync(join(root, fromPath), "utf8").replace(/^# Vetta .+$/m, `# Vetta ${version}`);
	writeFileSync(join(root, fromPath), text);
	renameSync(join(root, fromPath), join(root, toPath));
	writeVersion(root, version);
	return { from: current, version, bump, notesPath: toPath };
}

function gitTags(root) {
	const output = execFileSync("git", ["tag", "--list", "v*"], { cwd: root, encoding: "utf8" });
	return output.split(/\r?\n/).filter(Boolean);
}

function main(argv) {
	const allowIrregular = argv.includes("--allow-irregular");
	const latestReleased = latestReleasedVersion(gitTags(repositoryRoot));
	const startIndex = argv.indexOf("--start-next");
	const retargetIndex = argv.indexOf("--retarget");
	let result;
	if (startIndex !== -1) {
		const spec = argv[startIndex + 1] && !argv[startIndex + 1].startsWith("--") ? argv[startIndex + 1] : "patch";
		result = startNext({ spec, latestReleased, allowIrregular });
	} else if (retargetIndex !== -1) {
		const version = argv[retargetIndex + 1];
		if (!version || version.startsWith("--")) throw new Error("--retarget requires a version");
		result = retarget({ version, latestReleased, allowIrregular });
	} else {
		throw new Error(
			"Usage: release-version.mjs --start-next [patch|minor|major|x.y.z] | --retarget x.y.z [--allow-irregular]",
		);
	}
	console.log(`v${result.from} → v${result.version} (${result.bump}); notes: ${result.notesPath}`);
	console.log(`Changed: ${DESKTOP_PACKAGE_PATH}, ${LOCKFILE_PATH}, ${result.notesPath}`);
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
