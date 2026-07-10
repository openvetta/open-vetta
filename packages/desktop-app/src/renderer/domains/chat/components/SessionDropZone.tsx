import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "motion/react";
import {
	activeSessionAtom,
	attachedImagesAtom,
	mentionedFilesAtom,
	type AttachedImage,
	type MentionedFile,
} from "@shared/store/atoms";
import { recordInputFilesAdded, recordInputImagesAdded } from "@shared/lib/app-monitor-events";
import { pathBasename } from "@shared/lib/utils";

const VETTA_PATH_MIME = "application/vetta-path";
const VETTA_PATH_META_MIME = "application/vetta-path-meta";
const SOFT = { duration: 0.18, ease: [0.22, 0.61, 0.36, 1] as const };

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

interface SessionDropZoneProps {
	/** Optional cwd used when no activeSession yet (e.g. NewSessionPage). */
	cwdOverride?: string;
	className?: string;
	children: React.ReactNode;
}

/**
 * 全页面级 drop 区。监听 ChatPage / NewSessionPage 整张视图，
 * 把 OS 拖入的图片送到 attachedImages、其他文件/目录送到 mentionedFiles；
 * 应用内 File Explorer 的拖拽（携带 application/vetta-path）同样进 mentionedFiles。
 */
export function SessionDropZone({ cwdOverride, className, children }: SessionDropZoneProps): JSX.Element {
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

			// External OS drag — split image vs non-image.
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
				// Detect directory via webkitGetAsEntry when available.
				let isDirectory = false;
				if (item && typeof item.webkitGetAsEntry === "function") {
					const entry = item.webkitGetAsEntry();
					if (entry?.isDirectory) isDirectory = true;
				}
				// Heuristic fallback: empty type + size=0 on macOS folders.
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

	return (
		<div
			className={className}
			onDragEnter={handleDragEnter}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={(e) => void handleDrop(e)}
		>
			{children}
			<AnimatePresence>
				{dragKind && enabled && (
					<motion.div
						key="drop-overlay"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={SOFT}
						className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center gap-2"
						style={{
							background: "color-mix(in srgb, var(--primary) 8%, transparent)",
							backdropFilter: "blur(2px)",
							border: "1.5px dashed color-mix(in srgb, var(--primary) 60%, transparent)",
						}}
					>
						<span className="icon-[mdi--file-arrow-up-down-outline] h-9 w-9 text-primary" />
						<div className="text-[14px] font-medium text-primary">{t("dropZone.releaseToRef")}</div>
						<div className="text-[12px] text-primary/70">
							{dragKind === "internal" ? t("dropZone.internalRef") : t("dropZone.externalRef")}
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
