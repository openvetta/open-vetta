import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const mainEntry = path.join(packageRoot, "dist", "main", "index.js");
const userDataDir = path.join(packageRoot, ".wdio-electron-user-data");
const configDirName = ".vetta-e2e";
const require = createRequire(import.meta.url);

/** 设为 `1` 时使用 electron-builder 打包产物（`release/*-unpacked`），否则用未打包入口。 */
const usePackaged = process.env.VETTA_E2E_PACKAGED === "1";

function resolvePackagedBinaryPath(): string {
	const candidates =
		process.platform === "win32"
			? [path.join(packageRoot, "release", "win-unpacked", "Vetta.exe")]
			: process.platform === "darwin"
				? [
						path.join(packageRoot, "release", "mac-arm64", "Vetta.app", "Contents", "MacOS", "Vetta"),
						path.join(packageRoot, "release", "mac", "Vetta.app", "Contents", "MacOS", "Vetta"),
						path.join(packageRoot, "release", "mac-x64", "Vetta.app", "Contents", "MacOS", "Vetta"),
					]
				: [path.join(packageRoot, "release", "linux-unpacked", "Vetta")];

	const found = candidates.find((candidate) => existsSync(candidate));
	if (!found) {
		throw new Error(
			[
				"未找到 Electron 打包二进制。请先执行对应平台的 pack 脚本，例如：",
				"  bun run pack:win:test",
				"  bun run pack:linux:test",
				`已尝试路径：\n${candidates.map((p) => `  - ${p}`).join("\n")}`,
			].join("\n"),
		);
	}
	return found;
}

/**
 * 解析 node_modules/electron 真实可执行文件路径。
 * 不用 appEntryPoint：@wdio/electron-service 会拼 node_modules/.bin/electron，
 * 在 bun 下是 .CMD 包装脚本，Chromedriver 无法作为 chrome binary 启动。
 */
function resolveElectronBinaryPath(): string {
	// electron 包在 Node 侧 require 时返回 dist 内二进制绝对路径
	const electronBinary = require("electron") as string;
	if (!electronBinary || !existsSync(electronBinary)) {
		throw new Error(
			`未找到 electron 二进制（got: ${String(electronBinary)}）。请在 packages/desktop-app 安装 electron 依赖。`,
		);
	}
	return electronBinary;
}

function resolveElectronServiceOptions(): {
	appBinaryPath: string;
	appArgs: string[];
} {
	const isolationArgs = [`--user-data-dir=${userDataDir}`];

	if (usePackaged) {
		return {
			appBinaryPath: resolvePackagedBinaryPath(),
			appArgs: isolationArgs,
		};
	}

	if (!existsSync(mainEntry)) {
		throw new Error(
			`未找到主进程产物 ${mainEntry}。请先在 packages/desktop-app 执行 bun run build（或至少 build:main + preload + renderer）。`,
		);
	}

	return {
		appBinaryPath: resolveElectronBinaryPath(),
		// 等价于官方 appEntryPoint 模式：electron --app=<main>
		appArgs: [`--app=${mainEntry}`, ...isolationArgs],
	};
}

// Electron 子进程继承本进程 env：隔离配置目录，并关闭开发态 DevTools。
process.env.VETTA_E2E = "1";
process.env.VETTA_CONFIG_DIR = process.env.VETTA_CONFIG_DIR ?? configDirName;
// 配置落在用户主目录下的 VETTA_CONFIG_DIR；user-data-dir 仅隔离 Chromium 配置。
process.env.VETTA_HOME = process.env.VETTA_HOME ?? path.join(homedir(), configDirName);

const electronServiceOptions = resolveElectronServiceOptions();

/** 主 tsconfig 排除本文件；运行时由 @wdio/cli 加载。 */
export const config = {
	runner: "local",
	// 从 packages/desktop-app 解析，避免 monorepo 根目录 cwd 干扰
	rootDir: packageRoot,
	specs: ["./e2e/**/*.e2e.ts"],
	exclude: [],
	maxInstances: 1,
	capabilities: [
		{
			browserName: "electron",
			"wdio:electronServiceOptions": electronServiceOptions,
		},
	],
	logLevel: "warn" as const,
	bail: 0,
	waitforTimeout: 15_000,
	connectionRetryTimeout: 120_000,
	connectionRetryCount: 2,
	services: [
		[
			"electron",
			{
				clearMocks: true,
			},
		],
	],
	framework: "mocha",
	reporters: ["spec"],
	mochaOpts: {
		ui: "bdd",
		timeout: 120_000,
	},
};
