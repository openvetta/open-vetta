import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isArm64UpdateFile, mergePerArchUpdateMetadata } from "./merge-per-arch-update-metadata.mjs";

// arm64 与 x64 必须分两次构建（内置的 node/python 运行时按 VETTA_VENDOR_PLATFORM
// 单架构落盘），而 electron-builder 两次都写同一个 latest-mac.yml，后一次会覆盖前
// 一次。构建产物因此按 latest-mac-<arch>.yml 上传，发布前在这里合并回单一元数据，
// 否则 electron-updater 的 MacUpdater.filterFilesForArch 会在其中一种架构上找不到
// ZIP 并抛 ERR_UPDATER_ZIP_FILE_NOT_FOUND。
const perArchMetadataPattern = /^latest-mac-([a-z0-9_]+)\.ya?ml$/i;
const defaultReleaseDir = resolve(import.meta.dirname, "..", "release");

function isZip(file) {
	return typeof file?.url === "string" && file.url.toLowerCase().endsWith(".zip");
}

// 与 electron-builder 单次多架构构建的产物顺序保持一致：ZIP 在前（旧版
// electron-updater 依赖顶层 path/sha512 指向 ZIP），x64 在 arm64 之前。
function compareFiles(a, b) {
	const zipDiff = (isZip(a) ? 0 : 1) - (isZip(b) ? 0 : 1);
	if (zipDiff !== 0) return zipDiff;
	return (isArm64UpdateFile(a) ? 1 : 0) - (isArm64UpdateFile(b) ? 1 : 0);
}

export async function mergeMacUpdateMetadata({ releaseDir = defaultReleaseDir } = {}) {
	return mergePerArchUpdateMetadata({
		releaseDir,
		perArchPattern: perArchMetadataPattern,
		mergedFileName: "latest-mac.yml",
		compareFiles,
		label: "merge-mac-update",
	});
}

export async function main(releaseDir = process.argv[2]) {
	const merged = await mergeMacUpdateMetadata(releaseDir ? { releaseDir: resolve(releaseDir) } : undefined);
	if (!merged) console.info("[merge-mac-update] no per-architecture Mac metadata found; nothing to merge");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
}
