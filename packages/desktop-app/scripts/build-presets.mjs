// 构建全部预置插件（packages/plugins/presets/*），就地产出各自的 dist。
// 系统插件随 App 发布（ADR-0024）：dev 直接读 presets/<id>/dist；打包时由
// prepare-pack.js 把 dist + plugin.json 暂存进 Resources/system-plugins。
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const presetsDir = join(import.meta.dirname, "..", "..", "plugins", "presets");
const repoDir = join(import.meta.dirname, "..", "..", "..");

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

for (const name of entries) {
	const dir = join(presetsDir, name);
	console.log(`[build-presets] 构建 ${name} …`);
	if (!existsSync(join(dir, "node_modules"))) {
		execFileSync("bun", ["install", "--frozen-lockfile", "--filter", `./packages/plugins/presets/${name}`], {
			cwd: repoDir,
			stdio: "inherit",
		});
	}
	execFileSync("bun", ["run", "build"], { cwd: dir, stdio: "inherit" });
}

console.log(`[build-presets] 完成，共 ${entries.length} 个预置插件`);
