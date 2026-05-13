import { execFileSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const projectRoot = join(import.meta.dirname, "..");
const buildStageDir = join(tmpdir(), "vetta-desktop-build");
const imGatewayDir = join(projectRoot, "..", "im-gateway");
const imGatewayDistDir = join(imGatewayDir, "dist");
const runtimeCoreWindowsSandboxDir = join(projectRoot, "..", "runtime-core", "sandbox", "bin");
const runtimeCoreSandboxDir = join(projectRoot, "..", "runtime-core", "sandbox", "linux");
const imGatewayCrossTargets = [
	{ arch: "arm64", os: "darwin" },
	{ arch: "amd64", os: "darwin" },
	{ arch: "amd64", os: "linux" },
	{ arch: "arm64", os: "linux" },
	{ arch: "amd64", os: "windows" },
];

// Resolve electron version from the workspace
const require = createRequire(import.meta.url);
const electronPkgPath = require.resolve("electron/package.json");
const electronVersion = JSON.parse(readFileSync(electronPkgPath, "utf8")).version;

// 应用版本号以 packages/desktop-app/package.json 为唯一真源
const appVersion = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8")).version;

// Clean previous build stage
rmSync(buildStageDir, { recursive: true, force: true });
mkdirSync(buildStageDir, { recursive: true });

// Write minimal package.json (no dependencies)
const appPkg = {
	name: "vetta",
	version: appVersion,
	description: "Vetta Desktop App",
	author: "Vetta",
	type: "module",
	main: "main/index.js",
};
writeFileSync(join(buildStageDir, "package.json"), JSON.stringify(appPkg, null, "\t") + "\n");

// Copy build outputs
cpSync(join(projectRoot, "dist/main"), join(buildStageDir, "main"), { recursive: true });
cpSync(join(projectRoot, "dist/preload"), join(buildStageDir, "preload"), { recursive: true });
cpSync(join(projectRoot, "dist/renderer"), join(buildStageDir, "renderer"), { recursive: true });
// OCR headless runner: dedicated hidden BrowserWindow entry + its preload.
// The CLI flow `Vetta --ocr-pdf <pdf> --output <json>` loads this HTML and
// drives the per-page render + OCR pipeline inside Electron's renderer.
cpSync(join(projectRoot, "dist/ocr-preload"), join(buildStageDir, "ocr-preload"), { recursive: true });
cpSync(join(projectRoot, "dist/ocr-runner"), join(buildStageDir, "ocr-runner"), { recursive: true });

// Copy icons
cpSync(join(projectRoot, "build"), join(buildStageDir, "build"), { recursive: true });

// Copy externalized dependencies (not bundled by Vite due to ESM compatibility issues).
//
// Some packages (e.g. modern node-cron) restrict their `exports` map and no
// longer allow `require.resolve("<pkg>/package.json")`. Resolve the package's
// main entry instead and trim the path back to the package root inside
// node_modules. This works regardless of how the package author configured
// `exports`.
const externalDeps = ["dbus-next"];
const copiedExternalDeps = new Set();

// fromPaths：当前依赖的搜索目录列表。递归时把上一级依赖的 node_modules 也带上，
// 以兼容 bun / pnpm 的 isolated node_modules 布局（间接依赖不会被 hoist 到项目
// 根目录，而是嵌套在自己父包的 node_modules 下）。
function copyExternalDependency(dep, fromPaths = [projectRoot]) {
	if (copiedExternalDeps.has(dep)) return;
	copiedExternalDeps.add(dep);

	let entry;
	try {
		entry = require.resolve(dep, { paths: fromPaths });
	} catch (err) {
		// 间接依赖在某些场景下可能未真正安装（如 optionalDependencies 在当前
		// 平台跳过、被供应链审计工具拦截的旧版本、纯类型依赖等）。这种依赖如果
		// 运行时确实用不到就跳过；如果用到了，会在运行时报错，比静默吞掉真正
		// 缺失的模块更容易发现。
		console.warn(`[prepare-pack] skipping ${dep}: ${err.code ?? err.message}`);
		return;
	}
	const marker = `${join("node_modules", dep)}${process.platform === "win32" ? "\\" : "/"}`;
	const idx = entry.lastIndexOf(marker);
	if (idx < 0) {
		throw new Error(`prepare-pack: cannot locate ${dep} package root in ${entry}`);
	}
	const depDir = entry.slice(0, idx + marker.length - 1);
	const destDir = join(buildStageDir, "node_modules", dep);
	mkdirSync(dirname(destDir), { recursive: true });
	cpSync(depDir, destDir, { recursive: true });

	const depPkg = JSON.parse(readFileSync(join(depDir, "package.json"), "utf8"));
	const nestedPaths = [join(depDir, "node_modules"), ...fromPaths];
	for (const childDep of Object.keys(depPkg.dependencies ?? {})) {
		copyExternalDependency(childDep, nestedPaths);
	}
}

for (const dep of externalDeps) {
	copyExternalDependency(dep);
}

// =============================================================================
// im-gateway sidecar binaries (extraResources)
// =============================================================================
//
// Build the Go binaries for every supported target, then copy them into the
// staged Resources/im-gateway/ directory so electron-builder picks them up via
// extraResources. This intentionally avoids shell-specific Makefile logic so
// Windows packaging works the same way as POSIX hosts.

console.log("[prepare-pack] cross-building im-gateway sidecar...");
rmSync(imGatewayDistDir, { recursive: true, force: true });
mkdirSync(imGatewayDistDir, { recursive: true });

for (const target of imGatewayCrossTargets) {
	const extension = target.os === "windows" ? ".exe" : "";
	const outputPath = join(imGatewayDistDir, `im-gateway-${target.os}-${target.arch}${extension}`);
	console.log(`  -> ${outputPath}`);
	try {
		execFileSync(process.platform === "win32" ? "go.exe" : "go", [
			"build",
			"-trimpath",
			"-ldflags",
			"-s -w -X main.version=dev",
			"-o",
			outputPath,
			"./cmd/im-gateway",
		], {
			cwd: imGatewayDir,
			env: {
				...process.env,
				CGO_ENABLED: "0",
				GOARCH: target.arch,
				GOOS: target.os,
			},
			stdio: "inherit",
		});
	} catch (err) {
		console.error("[prepare-pack] im-gateway cross-build failed");
		throw err;
	}
}

const stagedImGatewayDir = join(buildStageDir, "im-gateway");
mkdirSync(stagedImGatewayDir, { recursive: true });
if (existsSync(imGatewayDistDir)) {
	for (const file of readdirSync(imGatewayDistDir)) {
		if (!file.startsWith("im-gateway-")) continue;
		const src = join(imGatewayDistDir, file);
		const dest = join(stagedImGatewayDir, file);
		cpSync(src, dest);
		// Ensure executable bit is preserved (zip extraction sometimes
		// strips it; we set it explicitly so spawn() works after install).
		try {
			chmodSync(dest, 0o755);
		} catch {
			// best effort on Windows / FAT
		}
	}
} else {
	throw new Error(`im-gateway dist dir not found after cross-build: ${imGatewayDistDir}`);
}

// =============================================================================
// Sandbox binaries (extraResources)
// =============================================================================
//
// Sandbox executables live under Resources/sandbox/<platform>/ so the Electron
// main process can resolve them from process.resourcesPath after packaging.
const stagedSandboxDir = join(buildStageDir, "sandbox");
mkdirSync(stagedSandboxDir, { recursive: true });
if (existsSync(runtimeCoreWindowsSandboxDir)) {
	const stagedWindowsSandboxDir = join(stagedSandboxDir, "windows");
	mkdirSync(stagedWindowsSandboxDir, { recursive: true });
	cpSync(runtimeCoreWindowsSandboxDir, stagedWindowsSandboxDir, { recursive: true });

	for (const file of readdirSync(stagedWindowsSandboxDir)) {
		const binaryPath = join(stagedWindowsSandboxDir, file);
		if (!existsSync(binaryPath)) continue;
		try {
			chmodSync(binaryPath, 0o755);
		} catch {
			// best effort on Windows / FAT
		}
	}
}

if (existsSync(runtimeCoreSandboxDir)) {
	const stagedLinuxSandboxDir = join(stagedSandboxDir, "linux");
	mkdirSync(stagedLinuxSandboxDir, { recursive: true });
	cpSync(runtimeCoreSandboxDir, stagedLinuxSandboxDir, { recursive: true });

	for (const arch of readdirSync(stagedLinuxSandboxDir)) {
		const binaryPath = join(stagedLinuxSandboxDir, arch, "bwrap");
		if (!existsSync(binaryPath)) continue;
		try {
			chmodSync(binaryPath, 0o755);
		} catch {
			// best effort on Windows / FAT
		}
	}
}

// Write electron-builder config
const builderConfig = {
	appId: "com.vetta.desktop",
	productName: "Vetta",
	executableName: "Vetta",
	electronVersion,
	npmRebuild: false,
	protocols: {
		name: "Vetta",
		schemes: ["vetta"],
	},
	mac: {
		target: ["dmg", "zip"],
		category: "public.app-category.productivity",
		icon: "build/icon.icns",
		identity: null,
		// Notarization deliberately disabled for the early-access build.
		// To enable later: set notarize: { teamId: "..." } and provide
		// APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD env vars.
		notarize: false,
		// Sidecar runs as a child process from the bundle; allow it to
		// be invoked under the hardened runtime by relaxing the most
		// restrictive entitlements. Provided as inline strings so the
		// staging dir doesn't need a separate entitlements.plist file.
		hardenedRuntime: false,
		// 用户的本地模型（Ollama / LM Studio / vLLM 等）通常监听在局域网
		// 明文 HTTP（http://192.168.x.x:port）。macOS 14+ 的 TCC 与 ATS 默认
		// 会静默拦截这种请求，表现为 Finder 双击启动后随机出现 "Connection
		// error."，而从终端启动 Vetta 时 launchd context 不同会偶发放行。
		// 三个 key 缺一不可：
		//   - NSAppTransportSecurity.NSAllowsLocalNetworking：放开局域网明文 HTTP
		//   - NSLocalNetworkUsageDescription：macOS 14+ 触发本地网络权限弹窗
		//   - NSBonjourServices：协助 TCC 识别 app 需要本地网络访问
		extendInfo: {
			NSAppTransportSecurity: {
				NSAllowsLocalNetworking: true,
			},
			NSLocalNetworkUsageDescription:
				"Vetta 需要访问本地网络以连接你在局域网内运行的 AI 模型服务（如 Ollama、LM Studio、vLLM 等）。",
			NSBonjourServices: ["_http._tcp", "_https._tcp"],
		},
	},
	win: {
		target: ["nsis"],
		icon: "build/icon.ico",
	},
	linux: {
		target: ["AppImage"],
		category: "Utility",
		icon: "build/icon.png",
	},
	// Sidecar binaries are picked up from the staged ./im-gateway dir
	// (populated above by the cross-build step).
	extraResources: [
		{
			from: "im-gateway",
			to: "im-gateway",
			filter: ["im-gateway-*"],
		},
		{
			from: "sandbox",
			to: "sandbox",
			filter: ["**/*"],
		},
		{
			from: "build",
			to: "build",
			filter: ["icon*"],
		},
	],
	nsis: {
		oneClick: false,
		perMachine: false,
		allowToChangeInstallationDirectory: true,
	},
	directories: {
		output: join(projectRoot, "release"),
	},
	asar: true,
};
writeFileSync(join(buildStageDir, "electron-builder.json"), JSON.stringify(builderConfig, null, "\t") + "\n");

console.log(`build staged at: ${buildStageDir}`);
