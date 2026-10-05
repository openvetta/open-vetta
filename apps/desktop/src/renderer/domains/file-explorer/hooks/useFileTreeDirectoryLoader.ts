import { type FsEntry, fileTreeCacheAtom, loadingDirsAtom } from "@shared/store/atoms";
import { useSetAtom } from "jotai";
import { useCallback, useLayoutEffect, useMemo } from "react";

interface DirectoryRequest {
	promise: Promise<FsEntry[] | undefined>;
	reload: boolean;
}

/** Reads belong to one mounted workspace/session; late IPC responses cannot populate its successor. */
export function useFileTreeDirectoryLoader(rootDir: string | null, sessionPath: string | null) {
	const setCache = useSetAtom(fileTreeCacheAtom);
	const setLoadingDirs = useSetAtom(loadingDirsAtom);
	const scope = useMemo(
		() => ({
			rootDir,
			sessionPath,
			active: false,
			generation: 0,
			pending: new Map<string, DirectoryRequest>(),
		}),
		[rootDir, sessionPath],
	);
	useLayoutEffect(() => {
		scope.active = true;
		scope.generation += 1;
		return () => {
			scope.active = false;
			scope.generation += 1;
			scope.pending.clear();
		};
	}, [scope]);

	const loadDir = useCallback(
		(dirPath: string, refresh = false): Promise<FsEntry[] | undefined> => {
			if (!scope.active) return Promise.resolve(undefined);
			const currentGeneration = scope.generation;
			const existing = scope.pending.get(dirPath);
			if (existing) {
				// A watcher event received during a read requires one fresh pass afterwards.
				if (refresh) existing.reload = true;
				return existing.promise;
			}
			setLoadingDirs((previous) => new Set([...previous, dirPath]));
			const request: DirectoryRequest = { promise: Promise.resolve(undefined), reload: false };
			scope.pending.set(dirPath, request);
			request.promise = (async () => {
				try {
					let entries: FsEntry[];
					do {
						request.reload = false;
						entries = await window.vetta.fs.readDir(dirPath);
						if (!scope.active || currentGeneration !== scope.generation) return undefined;
						setCache((previous) => new Map(previous).set(dirPath, entries));
					} while (request.reload);
					return entries;
				} catch (error) {
					if (scope.active && currentGeneration === scope.generation)
						console.error("Failed to load directory:", dirPath, error);
					return undefined;
				} finally {
					if (scope.active && currentGeneration === scope.generation) {
						scope.pending.delete(dirPath);
						setLoadingDirs((previous) => {
							const next = new Set(previous);
							next.delete(dirPath);
							return next;
						});
					}
				}
			})();
			return request.promise;
		},
		[scope, setCache, setLoadingDirs],
	);

	const getGeneration = useCallback(() => (scope.active ? scope.generation : -1), [scope]);
	return { loadDir, getGeneration };
}
