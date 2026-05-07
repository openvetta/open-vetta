import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";
import AdmZip from "adm-zip";
import { dialog, ipcMain } from "electron";
import { allowProjectRoot, readDesktopConfig, writeDesktopConfig } from "./fs.js";

// ─── Channels ───

export const PROJECT_EXPORT_CHANNELS = {
	EXPORT: "vetta:project:export",
	IMPORT: "vetta:project:import",
} as const;

// ─── Manifest format ───
//
// Bumping `VERSION` requires deciding whether older zips are still importable.
// Today we accept exactly v1; future versions should be additive when possible.

const MANIFEST_NAME = "_vetta-export.json";
const MANIFEST_FORMAT = "vetta-project-export";
const MANIFEST_VERSION = 1;

type SupportedProjectType = "normal" | "batch";

interface ExportManifest {
	format: typeof MANIFEST_FORMAT;
	version: number;
	type: SupportedProjectType;
	name: string;
	/** Absolute path on the source machine. Informational only — not used on import. */
	originalPath: string;
	/** Top-level directory name inside the zip that holds the project payload. */
	rootDir: string;
	exportedAt: number;
}

// ─── Result types (shape mirrored in preload api.ts) ───

export interface ExportProjectResult {
	/** False when the user cancelled the native save dialog. */
	saved: boolean;
	zipPath?: string;
}

export interface ImportProjectResult {
	path: string;
	name: string;
	type: SupportedProjectType;
	/** For batch projects: items[].sourcePath that no longer exist on disk. */
	missingSources?: string[];
}

export class ProjectExportError extends Error {
	constructor(
		readonly code:
			| "unsupported-type"
			| "invalid-zip"
			| "unsupported-zip"
			| "incompatible-version"
			| "extract-failed"
			| "user-cancelled",
		message: string,
	) {
		super(message);
		this.name = "ProjectExportError";
	}
}

// ─── Helpers ───

function detectSupportedType(projectDir: string): SupportedProjectType | "unsupported" {
	const metaPath = join(projectDir, ".vetta", "meta.json");
	if (!existsSync(metaPath)) return "normal";
	try {
		const parsed = JSON.parse(readFileSync(metaPath, "utf-8")) as Record<string, unknown>;
		if (parsed.type === "batch") return "batch";
		if (parsed.type === "flowing" || parsed.type === "schedule") return "unsupported";
		return "normal";
	} catch {
		return "normal";
	}
}

/**
 * Files we deliberately drop from exports. Currently just per-process file
 * locks (`*.lock`) under `.vetta/sessions/` — they would be stale on the target
 * machine and Sessions re-create them lazily on open.
 */
function shouldSkipForExport(zipRelativePath: string): boolean {
	return zipRelativePath.endsWith(".lock");
}

function addDirectoryToZip(zip: AdmZip, sourceDir: string, zipDir: string): void {
	for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
		// Skip symlinks for safety (could point outside project dir, surprise users).
		if (entry.isSymbolicLink()) continue;
		const sourcePath = join(sourceDir, entry.name);
		const zipRelative = zipDir ? `${zipDir}/${entry.name}` : entry.name;
		if (entry.isDirectory()) {
			addDirectoryToZip(zip, sourcePath, zipRelative);
			continue;
		}
		if (!entry.isFile()) continue;
		if (shouldSkipForExport(zipRelative)) continue;
		zip.addLocalFile(sourcePath, zipDir);
	}
}

/**
 * Resolve a unique target directory under workspace by appending `-2`, `-3`...
 * if a name collision exists either on disk or in the desktop-config registry.
 */
async function resolveUniqueProjectDir(
	workspacePath: string,
	baseName: string,
	knownPaths: Set<string>,
): Promise<{ projectDir: string; name: string }> {
	let candidateName = baseName;
	let counter = 2;
	while (true) {
		const projectDir = join(workspacePath, candidateName);
		const taken = existsSync(projectDir) || knownPaths.has(projectDir);
		if (!taken) return { projectDir, name: candidateName };
		candidateName = `${baseName}-${counter}`;
		counter += 1;
	}
}

function ensureSafeExtractionPath(targetRoot: string, entryName: string): string {
	const dest = resolve(targetRoot, entryName);
	const root = resolve(targetRoot);
	if (dest !== root && !dest.startsWith(root + sep)) {
		throw new ProjectExportError("invalid-zip", `检测到非法路径条目：${entryName}`);
	}
	return dest;
}

function readManifest(zip: AdmZip): ExportManifest {
	const entry = zip.getEntry(MANIFEST_NAME);
	if (!entry) {
		throw new ProjectExportError("unsupported-zip", "不支持的项目");
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(entry.getData().toString("utf-8"));
	} catch {
		throw new ProjectExportError("unsupported-zip", "不支持的项目");
	}
	if (!parsed || typeof parsed !== "object" || (parsed as Record<string, unknown>).format !== MANIFEST_FORMAT) {
		throw new ProjectExportError("unsupported-zip", "不支持的项目");
	}
	const m = parsed as Partial<ExportManifest> & Record<string, unknown>;
	if (typeof m.version !== "number" || m.version > MANIFEST_VERSION) {
		throw new ProjectExportError("incompatible-version", `不支持的导出版本：${String(m.version)}`);
	}
	if (m.type !== "normal" && m.type !== "batch") {
		throw new ProjectExportError("unsupported-type", `不支持的项目类型：${String(m.type)}`);
	}
	if (typeof m.name !== "string" || !m.name) {
		throw new ProjectExportError("unsupported-zip", "不支持的项目");
	}
	if (typeof m.rootDir !== "string" || !m.rootDir) {
		throw new ProjectExportError("unsupported-zip", "不支持的项目");
	}
	return {
		format: MANIFEST_FORMAT,
		version: m.version,
		type: m.type,
		name: m.name,
		originalPath: typeof m.originalPath === "string" ? m.originalPath : "",
		rootDir: m.rootDir,
		exportedAt: typeof m.exportedAt === "number" ? m.exportedAt : 0,
	};
}

/**
 * After a batch project lands on disk, walk its `meta.json:items[].sourcePath`
 * and report which absolute paths don't exist on this machine. The UI uses
 * this to surface a "源路径缺失" warning. We deliberately don't mutate
 * meta.json — keeping the original path lets the user re-link later.
 */
function collectMissingBatchSources(projectDir: string): string[] {
	const metaPath = join(projectDir, ".vetta", "meta.json");
	if (!existsSync(metaPath)) return [];
	let parsed: Record<string, unknown>;
	try {
		parsed = JSON.parse(readFileSync(metaPath, "utf-8")) as Record<string, unknown>;
	} catch {
		return [];
	}
	if (parsed.type !== "batch" || !Array.isArray(parsed.items)) return [];
	const missing: string[] = [];
	for (const item of parsed.items as Array<Record<string, unknown>>) {
		const sourcePath = item.sourcePath;
		if (typeof sourcePath !== "string" || !sourcePath) continue;
		if (!existsSync(sourcePath)) missing.push(sourcePath);
	}
	return missing;
}

// ─── Export ───

async function handleExport(projectDir: string): Promise<ExportProjectResult> {
	if (!existsSync(projectDir)) {
		throw new ProjectExportError("invalid-zip", `项目目录不存在：${projectDir}`);
	}
	const type = detectSupportedType(projectDir);
	if (type === "unsupported") {
		throw new ProjectExportError("unsupported-type", "当前仅支持普通项目和批量项目的导出");
	}

	const projectName = basename(projectDir);
	const saveResult = await dialog.showSaveDialog({
		title: "导出项目",
		defaultPath: `${projectName}.vetta.zip`,
		filters: [{ name: "Vetta Project Export", extensions: ["zip"] }],
	});
	if (saveResult.canceled || !saveResult.filePath) {
		return { saved: false };
	}

	const zip = new AdmZip();
	const manifest: ExportManifest = {
		format: MANIFEST_FORMAT,
		version: MANIFEST_VERSION,
		type,
		name: projectName,
		originalPath: projectDir,
		rootDir: projectName,
		exportedAt: Date.now(),
	};
	zip.addFile(MANIFEST_NAME, Buffer.from(JSON.stringify(manifest, null, 2), "utf-8"));
	addDirectoryToZip(zip, projectDir, projectName);
	zip.writeZip(saveResult.filePath);

	console.log(`[ProjectExport] exported ${type} project ${projectName} → ${saveResult.filePath}`);
	return { saved: true, zipPath: saveResult.filePath };
}

// ─── Import ───

async function handleImport(): Promise<ImportProjectResult | null> {
	const open = await dialog.showOpenDialog({
		title: "导入项目",
		properties: ["openFile"],
		filters: [{ name: "Vetta Project Export", extensions: ["zip"] }],
	});
	if (open.canceled || open.filePaths.length === 0) return null;
	const zipPath = open.filePaths[0];

	let zip: AdmZip;
	try {
		zip = new AdmZip(zipPath);
	} catch {
		throw new ProjectExportError("unsupported-zip", "不支持的项目");
	}

	const manifest = readManifest(zip);

	const config = await readDesktopConfig();
	const knownPaths = new Set<string>();
	for (const p of config.projects) knownPaths.add(p.path);
	for (const p of config.archivedProjects) knownPaths.add(p.path);

	const { projectDir, name } = await resolveUniqueProjectDir(config.workspacePath, manifest.name, knownPaths);
	await mkdir(projectDir, { recursive: true });

	// Validate every entry stays under projectDir BEFORE extracting anything,
	// so a malicious zip can't leave debris.
	const rootPrefix = manifest.rootDir.endsWith("/") ? manifest.rootDir : `${manifest.rootDir}/`;
	const entries = zip.getEntries();
	for (const entry of entries) {
		if (entry.entryName === MANIFEST_NAME) continue;
		if (entry.entryName !== manifest.rootDir && !entry.entryName.startsWith(rootPrefix)) {
			continue; // ignore anything outside the declared rootDir
		}
		const relative = entry.entryName.slice(manifest.rootDir.length).replace(/^\//, "");
		if (!relative) continue;
		ensureSafeExtractionPath(projectDir, relative);
	}

	try {
		for (const entry of entries) {
			if (entry.entryName === MANIFEST_NAME) continue;
			if (entry.entryName !== manifest.rootDir && !entry.entryName.startsWith(rootPrefix)) {
				continue;
			}
			const relative = entry.entryName.slice(manifest.rootDir.length).replace(/^\//, "");
			if (!relative) continue;
			const dest = ensureSafeExtractionPath(projectDir, relative);
			if (entry.isDirectory) {
				await mkdir(dest, { recursive: true });
				continue;
			}
			await mkdir(join(dest, ".."), { recursive: true });
			writeFileSync(dest, entry.getData());
		}
	} catch (error) {
		// Rollback: drop the half-extracted project dir so the user can retry cleanly.
		await rm(projectDir, { recursive: true, force: true }).catch(() => {});
		const message = error instanceof Error ? error.message : String(error);
		throw new ProjectExportError("extract-failed", `解压失败：${message}`);
	}

	// Authorize the new root for fs IPC operations and register in config.
	allowProjectRoot(projectDir);
	const fresh = await readDesktopConfig();
	if (!fresh.projects.some((p) => p.path === projectDir)) {
		await writeDesktopConfig({
			...fresh,
			projects: [...fresh.projects, { path: projectDir, name }],
		});
	}

	const missingSources = manifest.type === "batch" ? collectMissingBatchSources(projectDir) : undefined;

	console.log(
		`[ProjectExport] imported ${manifest.type} project from ${zipPath} → ${projectDir} (missing-sources=${missingSources?.length ?? 0})`,
	);
	return {
		path: projectDir,
		name,
		type: manifest.type,
		missingSources: missingSources && missingSources.length > 0 ? missingSources : undefined,
	};
}

// ─── Registration ───

interface IpcErrorPayload {
	error: { code: ProjectExportError["code"]; message: string };
}

function toErrorPayload(error: unknown): IpcErrorPayload {
	if (error instanceof ProjectExportError) {
		return { error: { code: error.code, message: error.message } };
	}
	const message = error instanceof Error ? error.message : String(error);
	return { error: { code: "extract-failed", message } };
}

export function registerProjectExportIpc(): () => void {
	ipcMain.handle(PROJECT_EXPORT_CHANNELS.EXPORT, async (_event, projectDir: string) => {
		if (typeof projectDir !== "string" || !projectDir) {
			return toErrorPayload(new ProjectExportError("invalid-zip", "项目路径不合法"));
		}
		try {
			// Read-only sanity check — refuse if the project directory disappears.
			statSync(projectDir);
			return await handleExport(projectDir);
		} catch (error) {
			return toErrorPayload(error);
		}
	});

	ipcMain.handle(PROJECT_EXPORT_CHANNELS.IMPORT, async () => {
		try {
			return await handleImport();
		} catch (error) {
			return toErrorPayload(error);
		}
	});

	return () => {
		ipcMain.removeHandler(PROJECT_EXPORT_CHANNELS.EXPORT);
		ipcMain.removeHandler(PROJECT_EXPORT_CHANNELS.IMPORT);
	};
}
