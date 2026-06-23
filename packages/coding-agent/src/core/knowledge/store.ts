/**
 * 知识库文件系统层：路径解析、扫描、读写。
 *
 * 纯逻辑（differ/tag-filter/upsert/cache）不做 IO；本模块是它们与磁盘之间的桥，
 * 被 kb 工具与桌面轮询器复用。所有函数接受显式 root，便于测试。
 */

import { createHash, randomUUID } from "node:crypto";
import type { Dirent } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, posix, relative, sep } from "node:path";
import { getKnowledgeDir } from "../../config.js";
import { parseWikiPage, serializeWikiPage } from "./frontmatter.js";
import {
	EMPTY_MANIFEST,
	EMPTY_TAGS_INDEX,
	INDEX_MAP_FILE,
	INDEXES_DIR,
	MANIFEST_FILE,
	type Manifest,
	PROCESSING_RECORDS_DIR,
	RAWS_DIR,
	type RawFile,
	TAGS_FILE,
	type TagsIndex,
	WIKI_DIR,
	type WikiFrontmatter,
} from "./types.js";

// ---------- 路径 ----------

/** 知识库根目录，默认 ~/.vetta/knowledges。 */
export function knowledgeRoot(root?: string): string {
	return root ?? getKnowledgeDir();
}

export const rawsDir = (root: string): string => join(root, RAWS_DIR);
export const wikiDir = (root: string): string => join(root, WIKI_DIR);
export const indexesDir = (root: string): string => join(root, INDEXES_DIR);
export const indexMapPath = (root: string): string => join(indexesDir(root), INDEX_MAP_FILE);
export const tagsPath = (root: string): string => join(root, TAGS_FILE);
export const manifestPath = (root: string): string => join(root, MANIFEST_FILE);
export const processingRecordsCwd = (root: string): string => join(root, PROCESSING_RECORDS_DIR);

// ---------- hash / id ----------

export function hashContent(content: Buffer | string): string {
	return createHash("sha256").update(content).digest("hex");
}

export function generatePageId(): string {
	return randomUUID();
}

// ---------- 目录遍历 ----------

async function walkFiles(dir: string): Promise<string[]> {
	const files: string[] = [];
	let entries: Dirent[];
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return files;
	}
	for (const entry of entries) {
		if (entry.name.startsWith(".")) continue;
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await walkFiles(full)));
		} else if (entry.isFile()) {
			files.push(full);
		}
	}
	return files;
}

/** 把系统路径分隔符归一为 posix 风格，用于存储相对路径。 */
const toPosix = (p: string): string => (sep === "/" ? p : p.split(sep).join(posix.sep));

// ---------- raws 扫描 ----------

/** 扫描 raws/<source>/**，对每个文件算内容 hash。 */
export async function scanRaws(root: string): Promise<RawFile[]> {
	const base = rawsDir(root);
	const files = await walkFiles(base);
	const result: RawFile[] = [];
	for (const file of files) {
		const rel = toPosix(relative(base, file));
		const source = rel.split(posix.sep)[0] ?? "";
		const content = await readFile(file);
		result.push({ source, source_path: rel, source_hash: hashContent(content) });
	}
	result.sort((a, b) => a.source_path.localeCompare(b.source_path));
	return result;
}

// ---------- wiki 扫描 ----------

export interface ScannedWikiPage {
	frontmatter: WikiFrontmatter;
	body: string;
	/** 相对 wiki/ 的路径。 */
	path: string;
}

/** 扫描 wiki/**\/*.md，解析 + 校验 frontmatter。返回解析失败的文件清单供诊断。 */
export interface WikiScanResult {
	pages: ScannedWikiPage[];
	errors: Array<{ path: string; message: string }>;
}

export async function scanWikiPages(root: string): Promise<WikiScanResult> {
	const base = wikiDir(root);
	const files = (await walkFiles(base)).filter((f) => f.endsWith(".md"));
	const pages: ScannedWikiPage[] = [];
	const errors: Array<{ path: string; message: string }> = [];
	for (const file of files) {
		const rel = toPosix(relative(base, file));
		try {
			const content = await readFile(file, "utf-8");
			const parsed = parseWikiPage(content);
			pages.push({ frontmatter: parsed.frontmatter, body: parsed.body, path: rel });
		} catch (err) {
			errors.push({ path: rel, message: err instanceof Error ? err.message : String(err) });
		}
	}
	return { pages, errors };
}

// ---------- 读写 wiki 页 ----------

/** 写入一个 wiki 页（相对 wiki/ 的路径），自动建目录。 */
export async function writeWikiPage(
	root: string,
	relPath: string,
	frontmatter: WikiFrontmatter,
	body: string,
): Promise<void> {
	const full = join(wikiDir(root), relPath);
	await mkdir(dirname(full), { recursive: true });
	await writeFile(full, serializeWikiPage(frontmatter, body), "utf-8");
}

/** 物理删除一个 wiki 页。 */
export async function deleteWikiPage(root: string, relPath: string): Promise<void> {
	const full = join(wikiDir(root), relPath);
	await rm(full, { force: true });
}

// ---------- manifest / tags 缓存读写 ----------

async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
	try {
		const content = await readFile(path, "utf-8");
		return JSON.parse(content) as T;
	} catch {
		return fallback;
	}
}

/**
 * 原子写：先写临时文件再 rename 覆盖（同盘 rename 原子），杜绝进程中途崩溃留下
 * 截断的缓存文件（读 JSON 会静默回退空对象 → 数据假性丢失）。
 */
async function atomicWrite(path: string, content: string): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	const tmp = `${path}.${randomUUID()}.tmp`;
	await writeFile(tmp, content, "utf-8");
	await rename(tmp, path);
}

async function writeJsonFile(path: string, value: unknown): Promise<void> {
	await atomicWrite(path, `${JSON.stringify(value, null, 2)}\n`);
}

export const readManifest = (root: string): Promise<Manifest> => readJsonFile(manifestPath(root), EMPTY_MANIFEST);
export const writeManifest = (root: string, manifest: Manifest): Promise<void> =>
	writeJsonFile(manifestPath(root), manifest);
export const readTagsIndex = (root: string): Promise<TagsIndex> => readJsonFile(tagsPath(root), EMPTY_TAGS_INDEX);
export const writeTagsIndex = (root: string, index: TagsIndex): Promise<void> => writeJsonFile(tagsPath(root), index);

/** 写入自动生成的目录 indexes/INDEX.md（镜像 wiki 树的导航入口）。 */
export async function writeIndexMap(root: string, content: string): Promise<void> {
	await atomicWrite(indexMapPath(root), content);
}

/** 确保知识库的基本目录结构存在。 */
export async function ensureKnowledgeDirs(root: string): Promise<void> {
	await Promise.all([
		mkdir(rawsDir(root), { recursive: true }),
		mkdir(wikiDir(root), { recursive: true }),
		mkdir(indexesDir(root), { recursive: true }),
		mkdir(processingRecordsCwd(root), { recursive: true }),
	]);
}

/** 判断 raws 目录是否存在且非空（用于决定是否需要轮询）。 */
export async function rawsExists(root: string): Promise<boolean> {
	try {
		const s = await stat(rawsDir(root));
		return s.isDirectory();
	} catch {
		return false;
	}
}
