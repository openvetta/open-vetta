import { recordInputFilesAdded, recordInputImagesAdded } from "@shared/lib/app-monitor-events";
import { pathBasename } from "@shared/lib/utils";
import {
	type AttachedImage,
	activeSessionAtom,
	attachedImagesAtom,
	type MentionedFile,
	mentionedFilesAtom,
} from "@shared/store/atoms";
import type { SessionDropZoneViewProps } from "@vetta/theme-ui/chat";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

const VETTA_PATH_MIME = "application/vetta-path";
const VETTA_PATH_META_MIME = "application/vetta-path-meta";

type DragKind = "files" | "internal";

let imageIdCounter = 0;
function nextImageId(): string {
	return `img-${++imageIdCounter}-${Date.now()}`;
}

function readImageAsAttached(file: File): Promise<AttachedImage> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result as string;
			const commaIdx = result.indexOf(",");
			resolve({
				id: nextImageId(),
				data: result.slice(commaIdx + 1),
				mimeType: file.type || "image/png",
				name: file.name || "Pasted image",
			});
		};
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(file);
	});
}

function detectKind(e: React.DragEvent): DragKind | null {
	const types = Array.from(e.dataTransfer.types);
	if (types.includes(VETTA_PATH_MIME)) return "internal";
	if (types.includes("Files")) return "files";
	return null;
}

export interface SessionDropZoneModel extends Omit<SessionDropZoneViewProps, "children"> {}

export function useSessionDropZoneModel(cwdOverride?: string): SessionDropZoneModel {
	const { t } = useTranslation("chat");
	const activeSession = useAtomValue(activeSessionAtom);
	const setAttachedImages = useSetAtom(attachedImagesAtom);
	const [mentionedFiles, setMentionedFiles] = useAtom(mentionedFilesAtom);
	const [dragKind, setDragKind] = useState<DragKind | null>(null);
	const dragCounter = useRef(0);

	const enabled = Boolean(activeSession) || Boolean(cwdOverride);

	const handleDragEnter = useCallback(
		(e: React.DragEvent) => {
			const kind = detectKind(e);
			if (!kind || !enabled) return;
			e.preventDefault();
			e.stopPropagation();
			dragCounter.current += 1;
			setDragKind(kind);
		},
		[enabled],
	);

	const handleDragOver = useCallback(
		(e: React.DragEvent) => {
			const kind = detectKind(e);
			if (!kind || !enabled) return;
			e.preventDefault();
			e.stopPropagation();
			e.dataTransfer.dropEffect = "copy";
		},
		[enabled],
	);

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		dragCounter.current = Math.max(0, dragCounter.current - 1);
		if (dragCounter.current === 0) setDragKind(null);
	}, []);

	const resetDrag = useCallback(() => {
		dragCounter.current = 0;
		setDragKind(null);
	}, []);

	const pushMentioned = useCallback(
		(entries: MentionedFile[]) => {
			if (entries.length === 0) return;
			const seen = new Set(mentionedFiles.map((f) => f.path));
			const additions: MentionedFile[] = [];
			for (const ent of entries) {
				if (!ent.path || seen.has(ent.path)) continue;
				seen.add(ent.path);
				additions.push(ent);
			}
			if (additions.length === 0) return;
			setMentionedFiles((prev) => [...prev, ...additions]);
			recordInputFilesAdded("drop", additions);
		},
		[mentionedFiles, setMentionedFiles],
	);

	const handleDrop = useCallback(
		async (e: React.DragEvent) => {
			const kind = detectKind(e);
			resetDrag();
			if (!kind || !enabled) return;
			e.preventDefault();
			e.stopPropagation();

			if (kind === "internal") {
				const path = e.dataTransfer.getData(VETTA_PATH_MIME);
				if (!path) return;
				let isDirectory = false;
				let name = pathBasename(path);
				const metaRaw = e.dataTransfer.getData(VETTA_PATH_META_MIME);
				if (metaRaw) {
					try {
						const meta = JSON.parse(metaRaw) as { isDirectory?: boolean; name?: string };
						if (typeof meta.isDirectory === "boolean") isDirectory = meta.isDirectory;
						if (typeof meta.name === "string" && meta.name) name = meta.name;
					} catch {
						// ignore malformed meta — fall back to defaults
					}
				}
				pushMentioned([{ path, name, isDirectory }]);
				return;
			}

			const items = Array.from(e.dataTransfer.items);
			const files = Array.from(e.dataTransfer.files);

			const imageFiles: File[] = [];
			const otherEntries: MentionedFile[] = [];

			for (let i = 0; i < files.length; i++) {
				const file = files[i];
				if (!file) continue;
				const item = items[i];
				if (file.type.startsWith("image/")) {
					imageFiles.push(file);
					continue;
				}
				let isDirectory = false;
				if (item && typeof item.webkitGetAsEntry === "function") {
					const entry = item.webkitGetAsEntry();
					if (entry?.isDirectory) isDirectory = true;
				}
				if (!isDirectory && file.type === "" && file.size === 0) isDirectory = true;

				const path = window.vetta.fs.pathForFile(file);
				if (!path) continue;
				otherEntries.push({ path, name: file.name || pathBasename(path), isDirectory, sizeBytes: file.size });
			}

			if (imageFiles.length > 0) {
				try {
					const images = await Promise.all(imageFiles.map(readImageAsAttached));
					setAttachedImages((prev) => [...prev, ...images]);
					recordInputImagesAdded(
						"drop",
						imageFiles.map((file, index) => ({ file, ...images[index] })),
					);
				} catch {
					// swallow — a single bad image shouldn't abort the rest
				}
			}
			pushMentioned(otherEntries);
		},
		[enabled, pushMentioned, resetDrag, setAttachedImages],
	);

	return {
		dragKind,
		enabled,
		labels: {
			releaseToRef: t("dropZone.releaseToRef"),
			internalRef: t("dropZone.internalRef"),
			externalRef: t("dropZone.externalRef"),
		},
		onDragEnter: handleDragEnter,
		onDragOver: handleDragOver,
		onDragLeave: handleDragLeave,
		onDrop: (e) => void handleDrop(e),
	};
}
