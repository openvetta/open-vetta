// 构建全部预置插件（packages/plugins/presets/*），生成统一 zip 制品，再解压到
// Desktop 开发 staging。运行时不直接读取 preset 源码目录（ADR-0024）。
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, readlink, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { loadBuildEnv } from "./load-build-env.mjs";
import {
	devSystemPluginsDir,
	isSystemPluginStaged,
	presetsDir,
	resolveTenant,
	stageSystemPluginsFromArchives,
} from "./stage-system-plugins.mjs";

// 在读取 VETTA_TENANT 等构建期变量前，从 .env.<mode>/.env 注入（命令行内联优先）。
loadBuildEnv();

const desktopAppDir = join(import.meta.dirname, "..");
const pluginWorkspaceDir = dirname(presetsDir);
const cachePath = join(desktopAppDir, ".desktop-dev", "preset-build-cache.json");
const ignoredDirectoryNames = new Set(["dist", "node_modules", "release"]);

if (!existsSync(presetsDir)) {
	console.log(`[build-presets] 无 presets 目录，跳过：${presetsDir}`);
	process.exit(0);
}

async function readCache() {
	try {
		const cache = JSON.parse(await readFile(cachePath, "utf8"));
		return cache.version === 1 ? cache : { version: 1, installHash: "", presets: {} };
	} catch {
		return { version: 1, installHash: "", presets: {} };
	}
}

async function writeCache(cache) {
	await mkdir(dirname(cachePath), { recursive: true });
	const tempPath = `${cachePath}.${process.pid}.tmp`;
	await writeFile(tempPath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
	await rm(cachePath, { force: true });
	await rename(tempPath, cachePath);
}

async function hashDirectory(hash, rootDir, currentDir = rootDir) {
	const entries = await readdir(currentDir, { withFileTypes: true });
	entries.sort((left, right) => left.name.localeCompare(right.name));
	for (const entry of entries) {
		if (entry.isDirectory() && ignoredDirectoryNames.has(entry.name)) continue;

		const fullPath = join(currentDir, entry.name);
		hash.update(relative(rootDir, fullPath).replaceAll("\\", "/"));
		if (entry.isDirectory()) {
			await hashDirectory(hash, rootDir, fullPath);
		} else if (entry.isSymbolicLink()) {
			hash.update(await readlink(fullPath));
		} else if (entry.isFile()) {
			hash.update(await readFile(fullPath));
		}
	}
}

async function hashFiles(paths) {
	const hash = createHash("sha256");
	for (const path of paths) {
		hash.update(relative(pluginWorkspaceDir, path).replaceAll("\\", "/"));
		hash.update(await readFile(path));
	}
	return hash.digest("hex");
}

async function hashPlugin(name, toolingHash) {
	const hash = createHash("sha256");
	hash.update(toolingHash);
	await hashDirectory(hash, join(presetsDir, name));
	return hash.digest("hex");
}

function run(command, args, cwd, label) {
	return new Promise((resolve, reject) => {
		console.log(`[build-presets] ${label} …`);
		const child = spawn(command, args, { cwd, stdio: "inherit" });
		child.once("error", reject);
		child.once("exit", (code, signal) => {
			if (code === 0) {
				resolve();
				return;
			}
			reject(new Error(`${label}失败（code=${code ?? "null"}, signal=${signal ?? "null"}）`));
		});
	});
}

const allEntries = (await readdir(presetsDir, { withFileTypes: true }))
	.filter((entry) => entry.isDirectory() && existsSync(join(presetsDir, entry.name, "package.json")))
	.map((entry) => entry.name)
	.sort();

if (allEntries.length === 0) {
	console.log("[build-presets] presets 目录为空，跳过");
	process.exit(0);
}

// 按租户筛选要构建/staging 的插件（VETTA_TENANT，缺省取 tenants.json 的 default）。
const tenant = resolveTenant();
const entries = tenant.pluginIds ? allEntries.filter((name) => tenant.pluginIds.has(name)) : allEntries;
console.log(
	`[build-presets] 租户=${tenant.name ?? "(未配置)"}，构建 ${entries.length}/${allEntries.length} 个插件：${entries.join(", ") || "(无)"}`,
);

if (entries.length === 0) {
	console.log("[build-presets] 当前租户无匹配插件，跳过");
	process.exit(0);
}

const cache = await readCache();
const installHash = await hashFiles([join(pluginWorkspaceDir, "package.json"), join(pluginWorkspaceDir, "bun.lock")]);
const workspaceNodeModulesDirs = [
	join(pluginWorkspaceDir, "node_modules"),
	...["plugin-sdk", "plugin-vite"].map((name) => join(pluginWorkspaceDir, name, "node_modules")),
	...entries.map((name) => join(presetsDir, name, "node_modules")),
];
if (cache.installHash === installHash && workspaceNodeModulesDirs.every((dir) => existsSync(dir))) {
	console.log("[build-presets] 跳过插件 workspace 依赖安装（无变更）");
} else {
	await run("bun", ["install", "--frozen-lockfile"], pluginWorkspaceDir, "安装插件 workspace 依赖");
	cache.installHash = installHash;
	await writeCache(cache);
}

if (process.env.VETTA_SKIP_PLUGIN_TOOLING_BUILD === "1") {
	console.log("[build-presets] 插件工具包已由 workspace 前置构建完成，跳过");
} else {
	await Promise.all(
		["plugin-sdk", "plugin-vite"].map((name) =>
			run("bun", ["run", "build"], join(pluginWorkspaceDir, name), `构建插件工具包 ${name}`),
		),
	);
}

const toolingHash = createHash("sha256");
for (const name of ["plugin-sdk", "plugin-vite"]) {
	toolingHash.update(name);
	await hashDirectory(toolingHash, join(pluginWorkspaceDir, name, "dist"));
}
const sharedBuildHash = toolingHash.digest("hex");
const nextPresetHashes = {};
const changedEntries = [];

for (const name of entries) {
	const hash = await hashPlugin(name, sharedBuildHash);
	nextPresetHashes[name] = hash;
	const manifest = JSON.parse(await readFile(join(presetsDir, name, "plugin.json"), "utf8"));
	const archivePath = join(presetsDir, name, "release", `${manifest.id}-${manifest.version}.zip`);
	if (cache.presets?.[name] !== hash || !existsSync(archivePath)) {
		changedEntries.push(name);
	} else {
		console.log(`[build-presets] 跳过 ${name}（无变更）`);
	}
}

await Promise.all(
	changedEntries.map((name) =>
		run("bun", ["run", "build"], join(presetsDir, name), `构建 ${name}`),
	),
);

const pluginsToStage = new Set(changedEntries);
for (const name of entries) {
	if (!isSystemPluginStaged(devSystemPluginsDir, name)) {
		pluginsToStage.add(name);
	}
}

stageSystemPluginsFromArchives(devSystemPluginsDir, "build-presets", {
	pluginIds: pluginsToStage,
	keepPluginIds: entries,
	preserveTarget: true,
});

// 仅更新本租户插件的缓存哈希，保留其他租户已缓存的条目，避免切换租户时全量重建。
cache.presets = { ...cache.presets, ...nextPresetHashes };
await writeCache(cache);
