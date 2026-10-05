import { activeSessionAtom, type FsEntry, filePreviewAtom, inlineFilePreviewAtom } from "@shared/store/atoms";
import { atom, useAtomValue, useStore } from "jotai";
import { useEffect, useRef } from "react";

const previewedFileAtom = atom((get) => get(filePreviewAtom) ?? get(inlineFilePreviewAtom));

/** Follow preview navigation, without taking DOM focus or continuously overriding manual tree selection. */
export function usePreviewFileReveal(
	rootDir: string | null,
	revealPath: (path: string, signal?: AbortSignal) => Promise<FsEntry>,
	selectEntry: (entry: FsEntry) => void,
) {
	const store = useStore();
	const preview = useAtomValue(previewedFileAtom);
	const sessionPath = useAtomValue(activeSessionAtom)?.sessionPath ?? null;
	const previous = useRef<{ rootDir: string | null; sessionPath: string | null; preview: typeof preview } | null>(
		null,
	);
	useEffect(() => {
		const old = previous.current;
		previous.current = { rootDir, sessionPath, preview };
		// A session switch may render once with the old global preview before its owner closes it.
		if (old && (old.rootDir !== rootDir || old.sessionPath !== sessionPath) && old.preview === preview) return;
		if (!rootDir || !preview?.path) return;
		const controller = new AbortController();
		const cancelIfStale = () => {
			if (
				store.get(previewedFileAtom) !== preview ||
				(store.get(activeSessionAtom)?.sessionPath ?? null) !== sessionPath
			)
				controller.abort();
		};
		const unsubscribePreview = store.sub(previewedFileAtom, cancelIfStale);
		const unsubscribeSession = store.sub(activeSessionAtom, cancelIfStale);
		cancelIfStale();
		void revealPath(preview.path, controller.signal)
			.then((entry) => {
				if (!controller.signal.aborted) selectEntry(entry);
			})
			.catch(() => {
				// Missing, hidden and outside-root files may still be viewed, but must not disturb the tree.
			});
		return () => {
			controller.abort();
			unsubscribePreview();
			unsubscribeSession();
		};
	}, [rootDir, sessionPath, preview, revealPath, selectEntry, store]);
}
