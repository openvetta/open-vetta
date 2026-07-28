import { execFileSync, spawn } from "node:child_process";
import { chmodSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { app } from "electron";

/**
 * 跨平台无感更新安装策略
 *
 * mac: 解压 .zip 取 .app，写 detached swap.sh，等主进程退出后覆盖
 *   /Applications/Vetta.app，清 quarantine 标记，open 新版本
 * win32: NSIS 静默安装 `installer.exe /S`，NSIS 自身负责重启
 * linux: 覆盖 process.env.APPIMAGE 指向的当前 AppImage，relaunch
 */

interface InstallContext {
	/** 已下载到本地的资产路径 */
	assetPath: string;
	/** 用于落 staging / swap.sh 的目录，会被一并清理 */
	stagingDir: string;
}

export async function installAndRestart(ctx: InstallContext): Promise<void> {
	if (process.platform === "darwin") {
		await installMac(ctx);
		return;
	}
	if (process.platform === "win32") {
		await installWin(ctx);
		return;
	}
	if (process.platform === "linux") {
		await installLinux(ctx);
		return;
	}
	throw new Error(`unsupported platform for in-place update: ${process.platform}`);
}

/**
 * 找到当前运行的 .app bundle 路径。
 * packaged: process.execPath 形如 /Applications/Vetta.app/Contents/MacOS/Vetta
 * dev: 不应该走这里（dev 模式不允许安装）
 */
function resolveMacAppBundle(): string {
	const exec = process.execPath;
	const marker = ".app/";
	const idx = exec.indexOf(marker);
	if (idx < 0) {
		throw new Error(`cannot locate .app bundle from execPath: ${exec}`);
	}
	return exec.slice(0, idx + marker.length - 1);
}

async function installMac(ctx: InstallContext): Promise<void> {
	const appBundle = resolveMacAppBundle();
	const extractedDir = join(ctx.stagingDir, "extracted");
	rmSync(extractedDir, { recursive: true, force: true });
	mkdirSync(extractedDir, { recursive: true });

	// 用系统 unzip（macOS 自带），保留资源 fork / 扩展属性
	execFileSync("/usr/bin/unzip", ["-oq", ctx.assetPath, "-d", extractedDir]);

	const entries = readdirSync(extractedDir);
	const newAppName = entries.find((name) => name.toLowerCase().endsWith(".app"));
	if (!newAppName) {
		throw new Error("downloaded zip does not contain a .app bundle");
	}
	const newAppPath = join(extractedDir, newAppName);

	const swapScript = join(ctx.stagingDir, "swap.sh");
	const script = `#!/bin/bash
set -e
# 等待主进程退出，最多 10 秒
for i in $(seq 1 50); do
  if ! pgrep -f "${appBundle}/Contents/MacOS/" >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
done
rm -rf "${appBundle}"
cp -R "${newAppPath}" "${appBundle}"
# Gatekeeper：清理 quarantine 标记，避免下次启动被 macOS 拦
/usr/bin/xattr -dr com.apple.quarantine "${appBundle}" 2>/dev/null || true
open "${appBundle}"
`;
	writeFileSync(swapScript, script);
	chmodSync(swapScript, 0o755);

	spawn("/bin/bash", [swapScript], {
		detached: true,
		stdio: "ignore",
		windowsHide: true,
	}).unref();

	app.quit();
}

async function installWin(ctx: InstallContext): Promise<void> {
	// electron-builder NSIS 安装包：/S 静默，--force-run 让安装结束后自动唤起新版
	// 注意：oneClick 模式下 NSIS 默认会重启应用
	spawn(ctx.assetPath, ["/S", "--force-run"], {
		detached: true,
		stdio: "ignore",
		windowsHide: true,
	}).unref();
	app.quit();
}

async function installLinux(ctx: InstallContext): Promise<void> {
	const currentAppImage = process.env.APPIMAGE;
	if (!currentAppImage) {
		throw new Error("linux 自动更新仅支持 AppImage 启动方式（缺少 APPIMAGE 环境变量），请手动下载新版本");
	}
	const swapScript = join(ctx.stagingDir, "swap.sh");
	const script = `#!/bin/bash
set -e
sleep 1
cp -f "${ctx.assetPath}" "${currentAppImage}"
chmod +x "${currentAppImage}"
"${currentAppImage}" >/dev/null 2>&1 &
disown
`;
	writeFileSync(swapScript, script);
	chmodSync(swapScript, 0o755);
	spawn("/bin/bash", [swapScript], {
		detached: true,
		stdio: "ignore",
	}).unref();
	app.quit();
}

/**
 * 根据 platform 决定该平台无感更新需要的资产扩展名。
 * 选不到匹配扩展名时回退到该 platform/arch 下任一资产（兜底，不一定能装上）。
 */
export function preferredAssetExtension(platform: NodeJS.Platform): string {
	if (platform === "darwin") return ".zip";
	if (platform === "win32") return ".exe";
	return ".AppImage";
}

/** 仅在 packaged 模式 + 已知平台可用 */
export function canPerformInPlaceUpdate(): boolean {
	if (!app.isPackaged) return false;
	if (process.platform === "darwin") return true;
	if (process.platform === "win32") return true;
	if (process.platform === "linux") return Boolean(process.env.APPIMAGE);
	return false;
}

/** dirname 重导出（updater.ts 内部用，避免重复 import 路径） */
export { dirname };
