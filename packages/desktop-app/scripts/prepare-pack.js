import { execFileSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

// Copy externalized dependencies (not bundled by Vite due to ESM compatibility issues).
//
// Some packages (e.g. modern node-cron) restrict their `exports` map and no
// longer allow `require.resolve("<pkg>/package.json")`. Resolve the package's
// main entry instead and trim the path back to the package root inside
// node_modules. This works regardless of how the package author configured
// `exports`.
// 与 vite.main.config.ts 的 rollupOptions.external 保持同步。photon-node 在
// 主 bundle 被 external 后，代码里 createRequire("@silvia-odwyer/photon-node")
// 在 packaged AppImage 中找不到包就降级到原图（image-resize 早期日志的
// `Cannot find module '@silvia-odwyer/photon-node'` 即此），图片以原始分辨率
// 喂模型，长会话直接吃满主进程内存。把它复制进 staging/node_modules 让
// createRequire 真能 resolve 到，恢复图片缩放路径。photon-node 是纯 WASM、
// 无平台二进制差异，可安全跨平台打包。
const externalDeps = ["@silvia-odwyer/photon-node"];

function resolvePackageRoot(dep) {
	const entry = require.resolve(dep, { paths: [projectRoot] });
	const marker = `${join("node_modules", dep)}${process.platform === "win32" ? "\\" : "/"}`;
	const idx = entry.lastIndexOf(marker);
	if (idx < 0) {
		throw new Error(`prepare-pack: cannot locate ${dep} package root in ${entry}`);
	}
	return entry.slice(0, idx + marker.length - 1);
}

const externalDepInfos = externalDeps.map((dep) => {
	const dir = resolvePackageRoot(dep);
	const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
	if (typeof pkg.version !== "string" || !pkg.version) {
		throw new Error(`prepare-pack: ${dep} package.json is missing a version`);
	}
	return { dep, dir, version: pkg.version };
});

// Clean previous build stage
rmSync(buildStageDir, { recursive: true, force: true });
mkdirSync(buildStageDir, { recursive: true });

// Write the staged package metadata. Electron-builder decides which
// node_modules entries belong in app.asar from production dependencies, so
// externalized runtime deps must be declared here even though we copy them
// manually below.
const appPkg = {
	name: "vetta",
	version: appVersion,
	description: "Vetta Desktop App",
	author: "Vetta",
	type: "module",
	main: "main/index.js",
	dependencies: Object.fromEntries(externalDepInfos.map(({ dep, version }) => [dep, version])),
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

// macOS DMG: 生成背景图（写入 repo build/，下面 cpSync 会一并带到 staging）。
// 仅 darwin host 跑；非 darwin 上即使存在 mac target，也不会真正出 dmg。
if (process.platform === "darwin") {
	execFileSync("node", [join(import.meta.dirname, "generate-dmg-background.js")], { stdio: "inherit" });
}

// Copy icons
cpSync(join(projectRoot, "build"), join(buildStageDir, "build"), { recursive: true });

// macOS DMG: 编译「修复已损坏.app」直接落到 staging build/，由下面 dmg.contents 引用。
if (process.platform === "darwin") {
	execFileSync(
		"node",
		[join(import.meta.dirname, "build-mac-repair-helper.js"), join(buildStageDir, "build")],
		{ stdio: "inherit" },
	);
}

for (const { dep, dir } of externalDepInfos) {
	cpSync(dir, join(buildStageDir, "node_modules", dep), { recursive: true });
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
	// DMG 视觉与三图标布局。详见 docs/adr/0003-dmg-repair-helper.md。
	// 坐标以 @1x 660×440 为准；背景图 build/background.png 与 build/background@2x.png
	// 由 scripts/generate-dmg-background.js 在 prebuild 阶段生成。
	// 「修复已损坏.app」由 scripts/build-mac-repair-helper.js osacompile 生成，
	// 与未签名主 app 配套：用户首次需 control-click → 「打开」绕过 Gatekeeper，
	// 之后弹原生密码框对 /Applications/Vetta.app 执行 xattr -dr com.apple.quarantine。
	dmg: {
		background: "build/background.png",
		window: { width: 660, height: 440 },
		iconSize: 100,
		iconTextSize: 12,
		contents: [
			{ x: 100, y: 200, type: "file" }, // Vetta.app（electron-builder 自动填入产物路径）
			{ x: 330, y: 200, type: "link", path: "/Applications" },
			{ x: 560, y: 200, type: "file", path: join(buildStageDir, "build", "修复已损坏.app") },
		],
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
	// photon-node 是 createRequire 加载的 external 包，其 photon_rs_bg.wasm
	// 通过 readFileSync(__dirname + "/photon_rs_bg.wasm") 读取。asar 虚拟
	// 文件系统对 readFileSync 透明，但 wasm 这类二进制在部分 Electron 版本
	// 上偶尔出问题（photon.ts 已经有 fallback paths 兜底，但能避免就避免）。
	// 直接 unpack 到 app.asar.unpacked/，让 wasm 落到真实文件系统。
	asarUnpack: ["node_modules/@silvia-odwyer/photon-node/**/*"],
};
writeFileSync(join(buildStageDir, "electron-builder.json"), JSON.stringify(builderConfig, null, "\t") + "\n");

console.log(`build staged at: ${buildStageDir}`);
