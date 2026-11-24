import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parse, stringify } from "yaml";

export function isArm64UpdateFile(file) {
	return typeof file?.url === "string" && file.url.includes("arm64");
}

/**
 * 每个架构单独构建时各写一份同名更新清单，后上传的会覆盖先上传的。构建产物因此按
 * `<清单名>-<arch>.yml` 上传，发布前在这里合并回客户端读取的单一清单。
 *
 * 合并后顶层 path/sha512 指向排序后的第一个文件：只认顶层字段的旧客户端拿到的就是它。
 */
export async function mergePerArchUpdateMetadata({ releaseDir, perArchPattern, mergedFileName, compareFiles, label }) {
	const entries = await readdir(releaseDir).catch(() => []);
	const perArchFiles = entries.filter((entry) => perArchPattern.test(entry)).sort();
	if (perArchFiles.length === 0) return null;

	const documents = [];
	for (const fileName of perArchFiles) {
		const document = parse(await readFile(join(releaseDir, fileName), "utf8"));
		if (!document || typeof document !== "object" || !Array.isArray(document.files) || document.files.length === 0) {
			throw new Error(`[${label}] ${fileName} does not contain update files`);
		}
		documents.push({ fileName, document });
	}

	const version = documents[0].document.version;
	for (const { fileName, document } of documents) {
		if (document.version !== version) {
			throw new Error(
				`[${label}] version mismatch: ${fileName} is ${String(document.version)}, expected ${String(version)}`,
			);
		}
	}

	const filesByUrl = new Map();
	for (const { document } of documents) {
		for (const file of document.files) {
			if (!filesByUrl.has(file.url)) filesByUrl.set(file.url, file);
		}
	}
	const files = [...filesByUrl.values()].sort(compareFiles);
	const primary = files[0];
	const merged = {
		...documents[0].document,
		files,
		path: primary.url,
		sha512: primary.sha512,
	};

	await writeFile(join(releaseDir, mergedFileName), stringify(merged));
	await Promise.all(perArchFiles.map((fileName) => rm(join(releaseDir, fileName), { force: true })));
	console.info(
		`[${label}] merged ${perArchFiles.join(", ")} -> ${mergedFileName} (${files.length} files, ${version})`,
	);
	return merged;
}
