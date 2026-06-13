// 构建全部预置插件（packages/plugins/presets/*），生成统一 zip 制品，再解压到
// Desktop 开发 staging。运行时不直接读取 preset 源码目录（ADR-0024）。
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import {
	devSystemPluginsDir,
	presetsDir,
	stageSystemPluginsFromArchives,
} from "./stage-system-plugins.mjs";

if (!existsSync(presetsDir)) {
	console.log(`[build-presets] 无 presets 目录，跳过：${presetsDir}`);
	process.exit(0);
}

const entries = readdirSync(presetsDir).filter((name) => {
	const dir = join(presetsDir, name);
	return statSync(dir).isDirectory() && existsSync(join(dir, "package.json"));
});

if (entries.length === 0) {
	console.log("[build-presets] presets 目录为空，跳过");
	process.exit(0);
}

const pluginWorkspaceDir = dirname(presetsDir);
console.log("[build-presets] 安装插件 workspace 依赖 …");
execFileSync("bun", ["install", "--frozen-lockfile"], {
	cwd: pluginWorkspaceDir,
	stdio: "inherit",
});

for (const name of ["plugin-sdk", "plugin-vite"]) {
	const dir = join(pluginWorkspaceDir, name);
	console.log(`[build-presets] 构建插件工具包 ${name} …`);
	execFileSync("bun", ["run", "build"], { cwd: dir, stdio: "inherit" });
}

for (const name of entries) {
	const dir = join(presetsDir, name);
	console.log(`[build-presets] 构建 ${name} …`);
	execFileSync("bun", ["run", "build"], { cwd: dir, stdio: "inherit" });
}

stageSystemPluginsFromArchives(devSystemPluginsDir, "build-presets");
