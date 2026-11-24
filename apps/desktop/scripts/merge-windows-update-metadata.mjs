import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isArm64UpdateFile, mergePerArchUpdateMetadata } from "./merge-per-arch-update-metadata.mjs";

// x64 与 arm64 分两次构建（内置运行时与原生依赖都按单架构落盘），build-inno-installer
// 两次都写 latest.yml。发版流水线把它们改名为 latest-win-<arch>.yml 上传，发布前在这里
// 合并回单一 latest.yml：electron-updater 下载时优先取 URL 含本机架构名的安装包。
const perArchMetadataPattern = /^latest-win-([a-z0-9_]+)\.ya?ml$/i;
const defaultReleaseDir = resolve(import.meta.dirname, "..", "release");

// x64 在前：只认顶层 path/sha512 的旧客户端都是 x64，合并后它们读到的仍是 x64 安装包。
function compareFiles(a, b) {
	return (isArm64UpdateFile(a) ? 1 : 0) - (isArm64UpdateFile(b) ? 1 : 0);
}

export async function mergeWindowsUpdateMetadata({ releaseDir = defaultReleaseDir } = {}) {
	return mergePerArchUpdateMetadata({
		releaseDir,
		perArchPattern: perArchMetadataPattern,
		mergedFileName: "latest.yml",
		compareFiles,
		label: "merge-windows-update",
	});
}

export async function main(releaseDir = process.argv[2]) {
	const merged = await mergeWindowsUpdateMetadata(releaseDir ? { releaseDir: resolve(releaseDir) } : undefined);
	if (!merged) console.info("[merge-windows-update] no per-architecture Windows metadata found; nothing to merge");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
}
