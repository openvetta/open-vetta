import type { DownloadItem, DownloadStatus } from "@preload/api";
import { cn } from "@shared/lib/utils";
import { downloadsListAtom } from "@shared/store/atoms";
import { useNavigate } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { useMemo } from "react";

export function DownloadsPage(): JSX.Element {
	const list = useAtomValue(downloadsListAtom);
	const navigate = useNavigate();

	const grouped = useMemo(() => {
		const active: DownloadItem[] = [];
		const finished: DownloadItem[] = [];
		for (const it of list) {
			if (it.status === "downloading" || it.status === "queued" || it.status === "paused") {
				active.push(it);
			} else {
				finished.push(it);
			}
		}
		return { active, finished };
	}, [list]);

	return (
		<div className="flex h-full w-full flex-col overflow-hidden">
			<div className="drag-region h-12 shrink-0" />
			<div className="flex shrink-0 items-center gap-3 px-8 pb-4">
				<button
					type="button"
					onClick={() => void navigate({ to: "/" })}
					className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
					title="返回"
				>
					<span className="icon-[mdi--arrow-left] h-4 w-4" />
				</button>
				<div>
					<h1 className="text-[20px] font-bold tracking-tight text-foreground">下载管理</h1>
					<p className="text-[11px] text-muted-foreground/60">
						支持断点续传与下载排队，最多同时下载 2 项
					</p>
				</div>
			</div>

			<div className="flex-1 overflow-y-auto px-8 pb-8">
				{list.length === 0 && (
					<div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground/40">
						<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/40">
							<span className="icon-[mdi--download-outline] text-[24px]" />
						</div>
						<span className="text-[12px]">还没有下载任务</span>
					</div>
				)}

				{grouped.active.length > 0 && (
					<Section title="进行中" count={grouped.active.length}>
						{grouped.active.map((it) => (
							<DownloadRow key={it.id} item={it} />
						))}
					</Section>
				)}
				{grouped.finished.length > 0 && (
					<Section title="历史" count={grouped.finished.length}>
						{grouped.finished.map((it) => (
							<DownloadRow key={it.id} item={it} />
						))}
					</Section>
				)}
			</div>
		</div>
	);
}

function Section({
	title,
	count,
	children,
}: {
	title: string;
	count: number;
	children: React.ReactNode;
}): JSX.Element {
	return (
		<div className="mb-6">
			<div className="mb-2 flex items-center gap-2 px-1">
				<h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
					{title}
				</h2>
				<span className="text-[10px] text-muted-foreground/40">{count}</span>
			</div>
			<div className="flex flex-col gap-1.5">{children}</div>
		</div>
	);
}

function DownloadRow({ item }: { item: DownloadItem }): JSX.Element {
	const ext = (item.filename.split(".").pop() ?? "").toLowerCase();
	const icon = iconForExt(ext);
	const colors = colorsForExt(ext);
	const percent = item.totalBytes > 0 ? Math.min(100, (item.receivedBytes / item.totalBytes) * 100) : 0;

	return (
		<div className="group flex items-center gap-3 rounded-2xl border border-border/40 bg-card p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-shadow hover:shadow-[0_2px_8px_-2px_rgba(15,23,42,0.08)]">
			<div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", colors.bg)}>
				<span className={cn(icon, "h-5 w-5", colors.text)} />
			</div>

			<div className="min-w-0 flex-1">
				<div className="flex items-center justify-between gap-2">
					<p className="truncate text-[12.5px] font-medium text-foreground">{item.filename}</p>
					<StatusBadge status={item.status} />
				</div>

				{(item.status === "downloading" || item.status === "paused" || item.status === "queued") && (
					<div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
						<div
							className={cn(
								"h-full rounded-full bg-gradient-to-r from-indigo-500 to-blue-600 transition-all duration-300",
								item.status === "paused" && "opacity-50",
							)}
							style={{ width: item.totalBytes > 0 ? `${percent}%` : "10%" }}
						/>
					</div>
				)}

				<div className="mt-1 flex items-center gap-3 text-[10.5px] text-muted-foreground/60">
					<span>
						{formatSize(item.receivedBytes)}
						{item.totalBytes > 0 && ` / ${formatSize(item.totalBytes)}`}
					</span>
					{item.status === "downloading" && item.speedBytesPerSec ? (
						<span>{formatSize(item.speedBytesPerSec)}/s</span>
					) : null}
					{item.error && <span className="text-destructive">{item.error}</span>}
				</div>
			</div>

			<div className="flex shrink-0 items-center gap-1">
				<RowActions item={item} />
			</div>
		</div>
	);
}

function StatusBadge({ status }: { status: DownloadStatus }): JSX.Element {
	const map: Record<DownloadStatus, { label: string; cls: string }> = {
		queued: { label: "排队中", cls: "bg-muted text-muted-foreground" },
		downloading: { label: "下载中", cls: "bg-blue-500/10 text-blue-500" },
		paused: { label: "已暂停", cls: "bg-amber-500/10 text-amber-500" },
		completed: { label: "已完成", cls: "bg-emerald-500/10 text-emerald-500" },
		failed: { label: "失败", cls: "bg-red-500/10 text-red-500" },
		canceled: { label: "已取消", cls: "bg-muted text-muted-foreground" },
	};
	const m = map[status];
	return (
		<span className={cn("rounded-full px-2 py-0.5 text-[9.5px] font-medium", m.cls)}>{m.label}</span>
	);
}

function RowActions({ item }: { item: DownloadItem }): JSX.Element {
	const onPause = () => void window.vetta.downloads.pause(item.id);
	const onResume = () => void window.vetta.downloads.resume(item.id);
	const onCancel = () => void window.vetta.downloads.cancel(item.id);
	const onOpen = () => void window.vetta.downloads.openFile(item.id);
	const onShow = () => void window.vetta.downloads.showInFolder(item.id);
	const onRemove = () => void window.vetta.downloads.remove(item.id, false);

	return (
		<>
			{item.status === "downloading" && (
				<IconBtn icon="icon-[mdi--pause]" title="暂停" onClick={onPause} />
			)}
			{(item.status === "paused" || item.status === "failed") && (
				<IconBtn icon="icon-[mdi--play]" title="继续" onClick={onResume} />
			)}
			{(item.status === "downloading" || item.status === "paused" || item.status === "queued") && (
				<IconBtn icon="icon-[mdi--close]" title="取消" onClick={onCancel} />
			)}
			{item.status === "completed" && (
				<>
					<IconBtn icon="icon-[mdi--folder-open-outline]" title="打开" onClick={onOpen} />
					<IconBtn icon="icon-[mdi--folder-eye-outline]" title="文件位置" onClick={onShow} />
				</>
			)}
			{(item.status === "completed" || item.status === "canceled" || item.status === "failed") && (
				<IconBtn icon="icon-[mdi--trash-can-outline]" title="移除记录" onClick={onRemove} />
			)}
		</>
	);
}

function IconBtn({
	icon,
	title,
	onClick,
}: {
	icon: string;
	title: string;
	onClick: () => void;
}): JSX.Element {
	return (
		<button
			type="button"
			onClick={onClick}
			title={title}
			className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
		>
			<span className={cn(icon, "h-4 w-4")} />
		</button>
	);
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
	return "icon-[mdi--file-outline]";
}

function colorsForExt(ext: string): { bg: string; text: string } {
	if (["pdf"].includes(ext)) return { bg: "bg-red-50 dark:bg-red-500/10", text: "text-red-500" };
	if (["doc", "docx"].includes(ext)) return { bg: "bg-blue-50 dark:bg-blue-500/10", text: "text-blue-500" };
	if (["xls", "xlsx", "csv"].includes(ext))
		return { bg: "bg-emerald-50 dark:bg-emerald-500/10", text: "text-emerald-500" };
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
