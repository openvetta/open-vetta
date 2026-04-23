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

// Clean previous build stage
rmSync(buildStageDir, { recursive: true, force: true });
mkdirSync(buildStageDir, { recursive: true });

// Write minimal package.json (no dependencies)
const appPkg = {
	name: "@vetta/desktop-app",
	version: "0.0.1",
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

// Copy icons
cpSync(join(projectRoot, "build"), join(buildStageDir, "build"), { recursive: true });

// Copy externalized dependencies (not bundled by Vite due to ESM compatibility issues).
//
// Some packages (e.g. modern node-cron) restrict their `exports` map and no
// longer allow `require.resolve("<pkg>/package.json")`. Resolve the package's
// main entry instead and trim the path back to the package root inside
// node_modules. This works regardless of how the package author configured
// `exports`.
const externalDeps = ["node-cron"];
for (const dep of externalDeps) {
	const entry = require.resolve(dep, { paths: [projectRoot] });
	const marker = `${join("node_modules", dep)}${process.platform === "win32" ? "\\" : "/"}`;
	const idx = entry.lastIndexOf(marker);
	if (idx < 0) {
		throw new Error(`prepare-pack: cannot locate ${dep} package root in ${entry}`);
	}
	const depDir = entry.slice(0, idx + marker.length - 1);
	cpSync(depDir, join(buildStageDir, "node_modules", dep), { recursive: true });
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
	},
	win: {
		target: ["nsis"],
		icon: "build/icon.ico",
	},
	linux: {
		target: ["AppImage"],
		category: "Utility",
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
