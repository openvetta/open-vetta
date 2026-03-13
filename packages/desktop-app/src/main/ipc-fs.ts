import { copyFile, mkdir, readdir, readFile, rename, rm, stat } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { ipcMain } from "electron";
import type { FsEntry } from "../preload/fs-types.js";

const CHANNELS = {
	READ_DIR: "vetta:fs:read-dir",
	READ_FILE: "vetta:fs:read-file",
	RENAME: "vetta:fs:rename",
	DELETE: "vetta:fs:delete",
	MOVE: "vetta:fs:move",
} as const;

const BINARY_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "pdf", "docx"]);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const HIDDEN_FILES = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);

/** Set of project CWDs that are allowed for file operations */
const allowedRoots = new Set<string>();

export function allowProjectRoot(cwd: string): void {
	allowedRoots.add(resolve(cwd));
}

function assertNonEmptyString(value: unknown, fieldName: string): asserts value is string {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error(`Invalid ${fieldName}`);
	}
}

function assertPathWithinProject(targetPath: string): void {
	const resolved = resolve(targetPath);
	for (const root of allowedRoots) {
		if (resolved === root || resolved.startsWith(root + "/")) {
			return;
		}
	}
	throw new Error("Path is outside any known project directory");
}

export function registerFsIpc(): () => void {
	ipcMain.handle(CHANNELS.READ_DIR, async (_event, dirPath: unknown): Promise<FsEntry[]> => {
		assertNonEmptyString(dirPath, "dirPath");
		assertPathWithinProject(dirPath);

		const resolved = resolve(dirPath);
		const entries = await readdir(resolved, { withFileTypes: true });
		const results: FsEntry[] = [];

		for (const entry of entries) {
			if (HIDDEN_FILES.has(entry.name) || entry.name.startsWith(".")) continue;
			const fullPath = join(resolved, entry.name);
			try {
				const stats = await stat(fullPath);
				results.push({
					name: entry.name,
					path: fullPath,
					isDirectory: entry.isDirectory(),
					size: stats.size,
					modifiedAt: stats.mtimeMs,
				});
			} catch {
				// Skip entries we can't stat (permission errors, broken symlinks, etc.)
			}
		}

		// Sort: directories first, then by name (case-insensitive)
		results.sort((a, b) => {
			if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
			return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
		});

		return results;
	});

	ipcMain.handle(
		CHANNELS.READ_FILE,
		async (_event, filePath: unknown): Promise<{ content: string; encoding: "utf8" | "base64" }> => {
			assertNonEmptyString(filePath, "filePath");
			assertPathWithinProject(filePath);

			const resolved = resolve(filePath);
			const stats = await stat(resolved);
			if (stats.size > MAX_FILE_SIZE) {
				throw new Error("File too large to preview (>10 MB)");
			}

			const ext = extname(resolved).slice(1).toLowerCase();
			if (BINARY_EXTENSIONS.has(ext)) {
				const buffer = await readFile(resolved);
				return { content: buffer.toString("base64"), encoding: "base64" };
			}

			const content = await readFile(resolved, "utf8");
			return { content, encoding: "utf8" };
		},
	);

	ipcMain.handle(CHANNELS.RENAME, async (_event, oldPath: unknown, newPath: unknown) => {
		assertNonEmptyString(oldPath, "oldPath");
		assertNonEmptyString(newPath, "newPath");
		assertPathWithinProject(oldPath);
		assertPathWithinProject(newPath);
		await rename(resolve(oldPath), resolve(newPath));
	});

	ipcMain.handle(CHANNELS.DELETE, async (_event, targetPath: unknown) => {
		assertNonEmptyString(targetPath, "targetPath");
		assertPathWithinProject(targetPath);
		await rm(resolve(targetPath), { recursive: true, force: true });
	});

	ipcMain.handle(CHANNELS.MOVE, async (_event, sourcePath: unknown, destDir: unknown) => {
		assertNonEmptyString(sourcePath, "sourcePath");
		assertNonEmptyString(destDir, "destDir");
		assertPathWithinProject(sourcePath);
		assertPathWithinProject(destDir);

		const resolvedSource = resolve(sourcePath);
		const resolvedDest = join(resolve(destDir), basename(resolvedSource));

		try {
			await rename(resolvedSource, resolvedDest);
		} catch (err: unknown) {
			// Cross-device move: copy + delete
			if ((err as NodeJS.ErrnoException).code === "EXDEV") {
				const srcStat = await stat(resolvedSource);
				if (srcStat.isDirectory()) {
					// For directories, use recursive copy
					await mkdir(resolvedDest, { recursive: true });
					const children = await readdir(resolvedSource, { withFileTypes: true });
					for (const child of children) {
						const childSrc = join(resolvedSource, child.name);
						const childDest = join(resolvedDest, child.name);
						await copyFile(childSrc, childDest);
					}
				} else {
					await copyFile(resolvedSource, resolvedDest);
				}
				await rm(resolvedSource, { recursive: true, force: true });
			} else {
				throw err;
			}
		}
	});

	return () => {
		ipcMain.removeHandler(CHANNELS.READ_DIR);
		ipcMain.removeHandler(CHANNELS.READ_FILE);
		ipcMain.removeHandler(CHANNELS.RENAME);
		ipcMain.removeHandler(CHANNELS.DELETE);
		ipcMain.removeHandler(CHANNELS.MOVE);
	};
}
