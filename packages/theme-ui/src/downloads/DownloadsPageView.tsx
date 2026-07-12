import { cn } from "@vetta/ui";
import type { JSX } from "react";
import type { DownloadItemView, DownloadStatus } from "./types";

export interface DownloadsPageViewLabels {
	title: string;
	subtitle: string;
	back: string;
	empty: string;
	sectionActive: string;
	sectionHistory: string;
	statusQueued: string;
	statusDownloading: string;
	statusPaused: string;
	statusCompleted: string;
	statusFailed: string;
	statusCanceled: string;
	pause: string;
	resume: string;
	cancel: string;
	open: string;
	showInFolder: string;
	remove: string;
}

export interface DownloadsPageViewProps {
	labels: DownloadsPageViewLabels;
	active: readonly DownloadItemView[];
	finished: readonly DownloadItemView[];
	onBack: () => void;
	onPause: (id: string) => void;
	onResume: (id: string) => void;
	onCancel: (id: string) => void;
	onOpen: (id: string) => void;
	onShowInFolder: (id: string) => void;
	onRemove: (id: string) => void;
}

export function DownloadsPageView({
	labels,
	active,
	finished,
	onBack,
	onPause,
	onResume,
	onCancel,
	onOpen,
	onShowInFolder,
	onRemove,
}: DownloadsPageViewProps): JSX.Element {
	const empty = active.length === 0 && finished.length === 0;

	return (
		<div className="flex h-full w-full flex-col overflow-hidden">
			<div className="drag-region h-12 shrink-0" />
			<div className="flex shrink-0 items-center gap-3 px-8 pb-4">
				<button
					type="button"
					onClick={onBack}
					className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
					title={labels.back}
				>
					<span className="icon-[mdi--arrow-left] h-4 w-4" />
				</button>
				<div>
					<h1 className="text-[20px] font-bold tracking-tight text-foreground">{labels.title}</h1>
					<p className="text-[11px] text-muted-foreground/60">{labels.subtitle}</p>
				</div>
			</div>

			<div className="flex-1 overflow-y-auto px-8 pb-8">
				{empty && (
					<div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground/40">
						<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/40">
							<span className="icon-[mdi--download-outline] text-[24px]" />
						</div>
						<span className="text-[12px]">{labels.empty}</span>
					</div>
				)}

				{active.length > 0 && (
					<Section title={labels.sectionActive} count={active.length}>
						{active.map((it) => (
							<DownloadRow
								key={it.id}
								item={it}
								labels={labels}
								onPause={onPause}
								onResume={onResume}
								onCancel={onCancel}
								onOpen={onOpen}
								onShowInFolder={onShowInFolder}
								onRemove={onRemove}
							/>
						))}
					</Section>
				)}
				{finished.length > 0 && (
					<Section title={labels.sectionHistory} count={finished.length}>
						{finished.map((it) => (
							<DownloadRow
								key={it.id}
								item={it}
								labels={labels}
								onPause={onPause}
								onResume={onResume}
								onCancel={onCancel}
								onOpen={onOpen}
								onShowInFolder={onShowInFolder}
								onRemove={onRemove}
							/>
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

function DownloadRow({
	item,
	labels,
	onPause,
	onResume,
	onCancel,
	onOpen,
	onShowInFolder,
	onRemove,
}: {
	item: DownloadItemView;
	labels: DownloadsPageViewLabels;
	onPause: (id: string) => void;
	onResume: (id: string) => void;
	onCancel: (id: string) => void;
	onOpen: (id: string) => void;
	onShowInFolder: (id: string) => void;
	onRemove: (id: string) => void;
}): JSX.Element {
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
					<StatusBadge status={item.status} labels={labels} />
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
				{item.status === "downloading" && (
					<IconBtn icon="icon-[mdi--pause]" title={labels.pause} onClick={() => onPause(item.id)} />
				)}
				{(item.status === "paused" || item.status === "failed") && (
					<IconBtn icon="icon-[mdi--play]" title={labels.resume} onClick={() => onResume(item.id)} />
				)}
				{(item.status === "downloading" || item.status === "paused" || item.status === "queued") && (
					<IconBtn icon="icon-[mdi--close]" title={labels.cancel} onClick={() => onCancel(item.id)} />
				)}
				{item.status === "completed" && (
					<>
						<IconBtn icon="icon-[mdi--folder-open-outline]" title={labels.open} onClick={() => onOpen(item.id)} />
						<IconBtn
							icon="icon-[mdi--folder-eye-outline]"
							title={labels.showInFolder}
							onClick={() => onShowInFolder(item.id)}
						/>
					</>
				)}
				{(item.status === "completed" || item.status === "canceled" || item.status === "failed") && (
					<IconBtn
						icon="icon-[mdi--trash-can-outline]"
						title={labels.remove}
						onClick={() => onRemove(item.id)}
					/>
				)}
			</div>
		</div>
	);
}

function StatusBadge({
	status,
	labels,
}: {
	status: DownloadStatus;
	labels: DownloadsPageViewLabels;
}): JSX.Element {
	const map: Record<DownloadStatus, { label: string; cls: string }> = {
		queued: { label: labels.statusQueued, cls: "bg-muted text-muted-foreground" },
		downloading: { label: labels.statusDownloading, cls: "bg-blue-500/10 text-blue-500" },
		paused: { label: labels.statusPaused, cls: "bg-amber-500/10 text-amber-500" },
		completed: { label: labels.statusCompleted, cls: "bg-emerald-500/10 text-emerald-500" },
		failed: { label: labels.statusFailed, cls: "bg-red-500/10 text-red-500" },
		canceled: { label: labels.statusCanceled, cls: "bg-muted text-muted-foreground" },
	};
	const m = map[status];
	return (
		<span className={cn("rounded-full px-2 py-0.5 text-[9.5px] font-medium", m.cls)}>{m.label}</span>
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
