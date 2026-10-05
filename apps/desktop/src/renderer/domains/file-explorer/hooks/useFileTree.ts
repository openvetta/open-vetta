import { createFileExplorerVisibility } from "@shared/lib/file-explorer-preferences";
import { isSubPath, pathBasename, pathDirname, pathJoin, pathNormalize } from "@shared/lib/utils";
import {
	activeSessionAtom,
	expandedDirsAtom,
	type FsEntry,
	fileExplorerPreferencesAtom,
	fileTreeCacheAtom,
	loadingDirsAtom,
} from "@shared/store/atoms";
import { useAtom, useAtomValue, useStore } from "jotai";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { emitPluginFileExplorerFilesChanged } from "../../plugins/runtime/plugin-file-explorer-host";
import { createDirectoryReloadScheduler } from "./file-tree-watch-coalesce";
import { useFileTreeDirectoryLoader } from "./useFileTreeDirectoryLoader";

/**
 * @param cwdOverride 显式指定的根目录。不传则回退到当前活动 session 的 cwd，
 *                    用于"项目详情页"等没有 active session 的场景。
 */
export function useFileTree(cwdOverride?: string | null) {
	const [cache, setCache] = useAtom(fileTreeCacheAtom);
	const [expandedDirs, setExpandedDirs] = useAtom(expandedDirsAtom);
	const [loadingDirs, setLoadingDirs] = useAtom(loadingDirsAtom);
	const activeSession = useAtomValue(activeSessionAtom);
	const rootCwd = cwdOverride ?? activeSession?.cwd ?? null;
	const sessionPath = activeSession?.sessionPath ?? null;
	const store = useStore();
	const { loadDir, getGeneration } = useFileTreeDirectoryLoader(rootCwd, sessionPath);
	const preferences = useAtomValue(fileExplorerPreferencesAtom);
	const visibleCache = useMemo(() => {
		if (!rootCwd) return cache;
		const visible = createFileExplorerVisibility(rootCwd, preferences);
		return new Map(
			[...cache]
				.filter(([directory]) => directory === rootCwd || visible(directory))
				.map(([directory, entries]) => [directory, entries.filter((entry) => visible(entry.path))]),
		);
	}, [cache, rootCwd, preferences]);

	const toggleDir = useCallback(
		(dirPath: string) => {
			setExpandedDirs((prev) => {
				const next = new Set(prev);
				if (next.has(dirPath)) {
					next.delete(dirPath);
				} else {
					next.add(dirPath);
					if (!cache.has(dirPath)) {
						void loadDir(dirPath);
					}
				}
				return next;
			});
		},
		[setExpandedDirs, cache, loadDir],
	);

	const expandDir = useCallback(
		async (dirPath: string) => {
			setExpandedDirs((prev) => new Set([...prev, dirPath]));
			if (!cache.has(dirPath)) await loadDir(dirPath);
		},
		[cache, loadDir, setExpandedDirs],
	);

	const collapseAll = useCallback(() => {
		setExpandedDirs(new Set());
	}, [setExpandedDirs]);

	const renameEntry = useCallback(
		async (oldPath: string, newName: string) => {
			const newPath = pathJoin(pathDirname(oldPath), newName);
			await window.vetta.fs.rename(oldPath, newPath);
			emitPluginFileExplorerFilesChanged([{ type: "moved", oldPath, path: newPath }]);
			// Refresh parent directory
			const parentDir = pathDirname(oldPath);
			await loadDir(parentDir, true);
		},
		[loadDir],
	);

	const deleteEntry = useCallback(
		async (entryPath: string) => {
			await window.vetta.fs.delete(entryPath);
			emitPluginFileExplorerFilesChanged([{ type: "deleted", path: entryPath }]);
			const parentDir = pathDirname(entryPath);
			// Remove from cache
			setCache((prev) => {
				const next = new Map(prev);
				const parentEntries = next.get(parentDir);
				if (parentEntries) {
					next.set(
						parentDir,
						parentEntries.filter((e) => e.path !== entryPath),
					);
				}
				// Also remove cached children if it was a directory
				for (const key of next.keys()) {
					if (isSubPath(key, entryPath)) {
						next.delete(key);
					}
				}
				return next;
			});
			// Remove from expanded
			setExpandedDirs((prev) => {
				const next = new Set(prev);
				for (const key of next) {
					if (isSubPath(key, entryPath)) {
						next.delete(key);
					}
				}
				return next;
			});
		},
		[setCache, setExpandedDirs],
	);

	const moveEntry = useCallback(
		async (srcPath: string, destDir: string) => {
			const name = pathBasename(srcPath);
			const srcParent = pathDirname(srcPath);
			if (srcParent === destDir) return;

			// Optimistic update
			setCache((prev) => {
				const next = new Map(prev);
				const srcEntries = next.get(srcParent);
				const movedEntry = srcEntries?.find((e) => e.path === srcPath);
				if (srcEntries) {
					next.set(
						srcParent,
						srcEntries.filter((e) => e.path !== srcPath),
					);
				}
				if (movedEntry) {
					const destEntries = next.get(destDir) ?? [];
					const updated: FsEntry = { ...movedEntry, path: pathJoin(destDir, name) };
					next.set(
						destDir,
						[...destEntries, updated].sort((a, b) => {
							if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
							return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
						}),
					);
				}
				return next;
			});

			try {
				await window.vetta.fs.move(srcPath, destDir);
				emitPluginFileExplorerFilesChanged([{ type: "moved", oldPath: srcPath, path: pathJoin(destDir, name) }]);
			} catch (err) {
				console.error("Move failed, refreshing:", err);
				// Rollback by reloading both directories
				await Promise.all([loadDir(srcParent, true), loadDir(destDir, true)]);
			}
		},
		[setCache, loadDir],
	);

	const refreshDir = useCallback(
		async (dirPath: string) => {
			await loadDir(dirPath, true);
		},
		[loadDir],
	);

	const revealPath = useCallback(
		async (entryPath: string, signal?: AbortSignal): Promise<FsEntry> => {
			const generation = getGeneration();
			const checkCurrent = () => {
				if (generation < 0 || signal?.aborted || generation !== getGeneration())
					throw new Error("File reveal was superseded");
			};
			checkCurrent();
			const windowsRoot = rootCwd != null && (/^[A-Za-z]:[\\/]/.test(rootCwd) || /^[\\/]{2}/.test(rootCwd));
			const normalizePath = (path: string) => {
				const normalized = pathNormalize(path);
				return windowsRoot ? normalized.toLowerCase() : normalized;
			};
			const root = rootCwd ? normalizePath(rootCwd) : "";
			const target = normalizePath(entryPath);
			const prefix = root.endsWith("/") ? root : `${root}/`;
			if (!rootCwd || !target.startsWith(prefix) || target === root) {
				throw new Error(`Path is outside the active workspace: ${entryPath}`);
			}
			if (!createFileExplorerVisibility(rootCwd, preferences)(entryPath)) {
				throw new Error("Path is hidden by the file explorer display settings");
			}
			const segments = target.slice(prefix.length).split("/");
			const directories: string[] = [];
			let directory = rootCwd;
			let entry: FsEntry | undefined;
			for (const [index, segment] of segments.entries()) {
				checkCurrent();
				const expected = normalizePath(pathJoin(directory, segment));
				const cached = store.get(fileTreeCacheAtom).get(directory);
				let entries = cached ?? (await loadDir(directory));
				checkCurrent();
				entry = entries?.find((candidate) => normalizePath(candidate.path) === expected);
				// A new file may not be in a previously loaded directory yet. Refresh only that directory.
				if (!entry) {
					entries = await loadDir(directory, true);
					checkCurrent();
					entry = entries?.find((candidate) => normalizePath(candidate.path) === expected);
				}
				if (!entry) throw new Error(`Path is not visible in the active workspace: ${entryPath}`);
				if (index < segments.length - 1) {
					if (!entry.isDirectory) throw new Error(`Path is not a directory: ${entry.path}`);
					directory = entry.path;
					directories.push(directory);
				}
			}
			checkCurrent();
			if (!entry) throw new Error(`Path is not visible in the active workspace: ${entryPath}`);
			setExpandedDirs((previous) => {
				if (directories.every((directory) => previous.has(directory))) return previous;
				return new Set([...previous, ...directories]);
			});
			return entry;
		},
		[rootCwd, loadDir, getGeneration, store, setExpandedDirs, preferences],
	);

	// Reset both workspace and session ownership before starting the new root read.
	useEffect(() => {
		void sessionPath;

		setCache(new Map());
		setExpandedDirs(new Set());
		setLoadingDirs(new Set());

		if (rootCwd) {
			void loadDir(rootCwd);
		}
	}, [rootCwd, sessionPath, setCache, setExpandedDirs, setLoadingDirs, loadDir]);

	// Watch expanded directories + root for filesystem changes
	const watchedDirsRef = useRef<Set<string>>(new Set());
	useEffect(() => {
		const dirsToWatch = new Set<string>();
		if (rootCwd) dirsToWatch.add(rootCwd);
		for (const dir of expandedDirs) dirsToWatch.add(dir);

		const prev = watchedDirsRef.current;

		// Start watching new dirs
		for (const dir of dirsToWatch) {
			if (!prev.has(dir)) {
				void window.vetta.fs.watchDir(dir);
			}
		}
		// Stop watching removed dirs
		for (const dir of prev) {
			if (!dirsToWatch.has(dir)) {
				void window.vetta.fs.unwatchDir(dir);
			}
		}

		watchedDirsRef.current = dirsToWatch;

		return () => {
			// Cleanup on unmount: unwatch all
			for (const dir of watchedDirsRef.current) {
				void window.vetta.fs.unwatchDir(dir);
			}
			watchedDirsRef.current = new Set();
		};
	}, [rootCwd, expandedDirs]);

	// Subscribe to dir-changed events from main process
	useEffect(() => {
		const scheduler = createDirectoryReloadScheduler((dirPath: string) => {
			emitPluginFileExplorerFilesChanged([{ type: "changed", path: dirPath }]);
			if (watchedDirsRef.current.has(dirPath)) {
				void loadDir(dirPath, true);
			}
		});
		const unsub = window.vetta.fs.onDirChanged((dirPath: string) => {
			scheduler.notify(dirPath);
		});
		return () => {
			unsub();
			scheduler.dispose();
		};
	}, [loadDir]);

	return {
		cache: visibleCache,
		expandedDirs,
		loadingDirs,
		rootDir: rootCwd,
		toggleDir,
		expandDir,
		collapseAll,
		renameEntry,
		deleteEntry,
		moveEntry,
		refreshDir,
		revealPath,
		getGeneration,
	};
}
