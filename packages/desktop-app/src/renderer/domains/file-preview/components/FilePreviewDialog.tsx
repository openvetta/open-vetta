import { Dialog, DialogContent } from "@shared/components/ui/dialog";
import { cn } from "@shared/lib/utils";
import { filePreviewAtom, type FilePreviewItem } from "@shared/store/atoms";
import { useAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";

export function FilePreviewDialog(): JSX.Element {
	const [item, setItem] = useAtom(filePreviewAtom);
	const open = item !== null;
	const close = useCallback(() => setItem(null), [setItem]);

	return (
		<Dialog open={open} onOpenChange={(o) => !o && close()}>
			<DialogContent
				showCloseButton={false}
				className="flex max-h-[85vh] w-[min(90vw,900px)] flex-col gap-0 overflow-hidden rounded-2xl border-0 bg-background/95 p-0 backdrop-blur-xl sm:max-w-[900px]"
			>
				{item && (item.kind === "image" ? <ImageViewer item={item} onClose={close} /> : <FileDetail item={item} onClose={close} />)}
			</DialogContent>
		</Dialog>
	);
}

// ============================================================================
// Image viewer
// ============================================================================

function ImageViewer({ item, onClose }: { item: FilePreviewItem; onClose: () => void }): JSX.Element {
	const [scale, setScale] = useState(1);
	const [rotation, setRotation] = useState(0);

	useEffect(() => {
		setScale(1);
		setRotation(0);
	}, [item.url]);

	const onWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
		e.preventDefault();
		setScale((s) => Math.min(5, Math.max(0.2, s + (e.deltaY < 0 ? 0.1 : -0.1))));
	}, []);

	return (
		<div className="flex flex-col">
			<Header name={item.name} onClose={onClose} />
			<div
				className="relative flex h-[60vh] items-center justify-center overflow-hidden bg-gradient-to-b from-muted/20 to-muted/40"
				onWheel={onWheel}
			>
				<img
					src={item.url}
					alt={item.name}
					draggable={false}
					style={{
						transform: `rotate(${rotation}deg) scale(${scale})`,
						transition: "transform 0.2s ease",
					}}
					className="max-h-full max-w-full object-contain select-none"
				/>
			</div>
			<div className="flex items-center justify-center gap-1.5 border-t border-border/40 bg-background/60 px-4 py-3 backdrop-blur-sm">
				<ToolButton
					icon="icon-[mdi--magnify-minus-outline]"
					title="缩小"
					onClick={() => setScale((s) => Math.max(0.2, s - 0.1))}
				/>
				<div className="min-w-12 text-center text-[11px] font-medium text-muted-foreground">
					{Math.round(scale * 100)}%
				</div>
				<ToolButton
					icon="icon-[mdi--magnify-plus-outline]"
					title="放大"
					onClick={() => setScale((s) => Math.min(5, s + 0.1))}
				/>
				<Divider />
				<ToolButton
					icon="icon-[mdi--rotate-left]"
					title="向左旋转"
					onClick={() => setRotation((r) => r - 90)}
				/>
				<ToolButton
					icon="icon-[mdi--rotate-right]"
					title="向右旋转"
					onClick={() => setRotation((r) => r + 90)}
				/>
				<Divider />
				<ToolButton
					icon="icon-[mdi--restore]"
					title="重置"
					onClick={() => {
						setScale(1);
						setRotation(0);
					}}
				/>
				<Divider />
				<ToolButton icon="icon-[mdi--download]" title="下载" primary onClick={() => downloadItem(item)} />
			</div>
		</div>
	);
}

// ============================================================================
// File detail
// ============================================================================

function FileDetail({ item, onClose }: { item: FilePreviewItem; onClose: () => void }): JSX.Element {
	const ext = (item.name.split(".").pop() ?? "").toLowerCase();
	const icon = iconForExt(ext);
	const colors = colorsForExt(ext);

	return (
		<div className="flex flex-col">
			<Header name={item.name} onClose={onClose} />
			<div className="flex flex-col items-center justify-center gap-5 px-6 py-16">
				<div
					className={cn(
						"relative flex h-28 w-28 items-center justify-center rounded-3xl shadow-[0_8px_24px_-6px_rgba(15,23,42,0.18)]",
						colors.bg,
					)}
				>
					<span className={cn(icon, "h-12 w-12", colors.text)} />
					{ext && (
						<div className="absolute -bottom-2 rounded-full border border-border/40 bg-background px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
							{ext}
						</div>
					)}
				</div>
				<div className="text-center">
					<p className="max-w-md break-all text-[14px] font-semibold text-foreground">{item.name}</p>
					{typeof item.size === "number" && (
						<p className="mt-1 text-[11px] text-muted-foreground/70">{formatSize(item.size)}</p>
					)}
				</div>
				<button
					type="button"
					onClick={() => downloadItem(item)}
					className="flex items-center gap-2 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 px-5 py-2 text-[12.5px] font-medium text-white shadow-[0_6px_16px_-4px_rgba(79,70,229,0.5)] transition-transform duration-200 hover:scale-105"
				>
					<span className="icon-[mdi--download] h-4 w-4" />
					下载文件
				</button>
			</div>
		</div>
	);
}

// ============================================================================
// Helpers
// ============================================================================

function Header({ name, onClose }: { name: string; onClose: () => void }): JSX.Element {
	return (
		<div className="flex items-center justify-between border-b border-border/40 px-5 py-3">
			<h2 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">{name}</h2>
			<button
				type="button"
				onClick={onClose}
				className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
			>
				<span className="icon-[mdi--close] h-4 w-4" />
			</button>
		</div>
	);
}

function ToolButton({
	icon,
	title,
	onClick,
	primary,
}: {
	icon: string;
	title: string;
	onClick: () => void;
	primary?: boolean;
}): JSX.Element {
	return (
		<button
			type="button"
			onClick={onClick}
			title={title}
			className={cn(
				"flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
				primary
					? "bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-[0_4px_12px_-2px_rgba(79,70,229,0.4)] hover:scale-105"
					: "text-muted-foreground hover:bg-muted hover:text-foreground",
			)}
		>
			<span className={cn(icon, "h-4 w-4")} />
		</button>
	);
}

function Divider(): JSX.Element {
	return <div className="mx-1 h-4 w-px bg-border/60" />;
}

function downloadItem(item: FilePreviewItem): void {
	void window.vetta.downloads.start({ url: item.url, filename: item.name });
}

function iconForExt(ext: string): string {
	if (["pdf"].includes(ext)) return "icon-[mdi--file-pdf-box]";
	if (["doc", "docx"].includes(ext)) return "icon-[mdi--file-word-box]";
	if (["xls", "xlsx", "csv"].includes(ext)) return "icon-[mdi--file-excel-box]";
	if (["ppt", "pptx"].includes(ext)) return "icon-[mdi--file-powerpoint-box]";
	if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "icon-[mdi--folder-zip-outline]";
	if (["mp3", "wav", "flac", "ogg", "aac"].includes(ext)) return "icon-[mdi--file-music-outline]";
	if (["mp4", "mov", "mkv", "avi", "webm"].includes(ext)) return "icon-[mdi--file-video-outline]";
	if (["png", "jpg", "jpeg", "gif", "bmp", "webp", "svg"].includes(ext))
		return "icon-[mdi--file-image-outline]";
	if (["txt", "md", "log"].includes(ext)) return "icon-[mdi--file-document-outline]";
	if (["js", "ts", "tsx", "jsx", "go", "py", "java", "rb", "rs", "json", "yml", "yaml", "html", "css"].includes(ext))
		return "icon-[mdi--file-code-outline]";
	return "icon-[mdi--file-outline]";
}

function colorsForExt(ext: string): { bg: string; text: string } {
	if (["pdf"].includes(ext)) return { bg: "bg-red-50 dark:bg-red-500/10", text: "text-red-500" };
	if (["doc", "docx"].includes(ext)) return { bg: "bg-blue-50 dark:bg-blue-500/10", text: "text-blue-500" };
	if (["xls", "xlsx", "csv"].includes(ext)) return { bg: "bg-emerald-50 dark:bg-emerald-500/10", text: "text-emerald-500" };
	if (["ppt", "pptx"].includes(ext)) return { bg: "bg-orange-50 dark:bg-orange-500/10", text: "text-orange-500" };
	if (["zip", "rar", "7z", "tar", "gz"].includes(ext))
		return { bg: "bg-amber-50 dark:bg-amber-500/10", text: "text-amber-500" };
	if (["mp3", "wav", "flac", "ogg", "aac"].includes(ext))
		return { bg: "bg-pink-50 dark:bg-pink-500/10", text: "text-pink-500" };
	if (["mp4", "mov", "mkv", "avi", "webm"].includes(ext))
		return { bg: "bg-purple-50 dark:bg-purple-500/10", text: "text-purple-500" };
	return { bg: "bg-muted", text: "text-muted-foreground" };
}

function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
