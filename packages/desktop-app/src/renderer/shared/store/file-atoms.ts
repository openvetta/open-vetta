import { atom } from "jotai";

export interface FsEntry {
	name: string;
	path: string;
	isDirectory: boolean;
	size: number;
	modifiedAt: number;
}

export const fileTreeCacheAtom = atom<Map<string, FsEntry[]>>(new Map());
export const expandedDirsAtom = atom<Set<string>>(new Set<string>());
export const selectedFilePathAtom = atom<string | null>(null);
export const loadingDirsAtom = atom<Set<string>>(new Set<string>());
export const fileContextMenuAtom = atom<{ x: number; y: number; entry: FsEntry } | null>(null);
export const renamingPathAtom = atom<string | null>(null);
