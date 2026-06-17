import { cn } from "@shared/lib/utils";
import { type FilePreviewItem, filePreviewContextReadonlyAtom } from "@shared/store/atoms";
import { useAtom } from "jotai";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect } from "react";
import { LightboxImage, useImageSrc } from "./LightboxImage";
import { IMAGE_EXTENSIONS, PreviewBody, downloadItem, getExtension, getPreviewLabel } from "./PreviewContent";
import { PreviewErrorBoundary } from "./PreviewErrorBoundary";
import { usePreviewNav } from "./FilePreviewView";

function isImage(item: FilePreviewItem): boolean {
	return IMAGE_EXTENSIONS.has(getExtension(item.name));
}

/**
 * 全局文件预览灯箱（图片附件等非文件树入口使用）。
 * 全屏纯暗遮罩，通用控制（文件名/下载/打开位置/关闭）浮在遮罩层，弹层自身不出 UI。
 * 文件树点击文件走 inline 内嵌预览，请使用 inlineFilePreviewAtom。
 */
export function FilePreviewDialog(): JSX.Element {
	const [ctx, setCtx] = useAtom(filePreviewContextReadonlyAtom);
	const { goPrev, goNext, close } = usePreviewNav(setCtx);

	const item = ctx ? (ctx.items[ctx.index] ?? null) : null;
	// 图片组：调用方传入的多张图片（全为图片才启用缩略图条 / 箭头 / 计数）
	const isImageGroup = !!ctx && ctx.items.length > 1 && ctx.items.every(isImage);

	useEffect(() => {
		if (!item) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				close();
			} else if (isImageGroup && e.key === "ArrowLeft") {
				e.preventDefault();
				goPrev();
			} else if (isImageGroup && e.key === "ArrowRight") {
				e.preventDefault();
				goNext();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [item, isImageGroup, goPrev, goNext, close]);

	const selectIndex = useCallback(
		(index: number) => setCtx((prev) => (prev ? { ...prev, index } : prev)),
		[setCtx],
	);

	const stop = useCallback((e: React.MouseEvent) => e.stopPropagation(), []);

	return (
		<AnimatePresence>
			{ctx && item && (
				<motion.div
					// no-drag：盖住下层页面顶部的 -webkit-app-region: drag，否则那块区域的点击会被系统拖窗口接管，浮层按钮点不了
					className="no-drag fixed inset-0 z-50 bg-black/90"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.18, ease: "easeOut" }}
					onClick={close}
				>
					{/* 内容区：图片走灯箱（空白点击冒泡关闭），其他类型走中央亮色卡片 */}
					{isImage(item) ? (
						<div className={cn("absolute inset-x-0 top-0", isImageGroup ? "bottom-36" : "bottom-12")}>
							<LightboxImage key={item.path ?? item.url ?? item.name} item={item} onClose={close} />
						</div>
					) : (
						// 外层 pointer-events-none：全屏居中容器不拦截点击（否则会盖住浮层按钮）；
						// 卡片本体 pointer-events-auto 可交互，空白点击穿透到背景 motion.div 关闭
						<div className="pointer-events-none absolute inset-0 flex items-center justify-center p-10 pt-16">
							<div
								className="pointer-events-auto flex h-full max-h-[85vh] w-full max-w-[80vw] flex-col overflow-hidden rounded-xl bg-background shadow-2xl"
								onClick={stop}
							>
								{/* 卡片顶部 label（label 由预览层提供） */}
								<div className="flex shrink-0 items-center border-b border-border/50 px-4 py-2.5">
									<span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">
										{getPreviewLabel(item)}
									</span>
								</div>
								<PreviewErrorBoundary resetKey={item}>
									<PreviewBody item={item} />
								</PreviewErrorBoundary>
							</div>
						</div>
					)}

					{/* ─── 顶部浮层控制条 ─── */}
					{/* pt-12 让控制留在 titlebar（mac 红绿灯 / 拖拽区）下方，靠右排布避让左上红绿灯。
					    容器 pointer-events-none 让透明渐变区不拦截点击，仅按钮可点，避免遮挡下层预览。 */}
					<div className="pointer-events-none absolute inset-x-0 top-0 z-50 flex items-center justify-end gap-2 bg-gradient-to-b from-black/55 to-transparent px-3 pb-8 pt-12">
						{isImageGroup && (
							<span className="mr-1 shrink-0 text-[12px] tabular-nums text-white/60">
								{ctx.index + 1} / {ctx.items.length}
							</span>
						)}
						{item.path && (
							<OverlayButton
								icon="icon-[mdi--folder-open-outline]"
								title="在文件夹中显示"
								onClick={() => void window.vetta.shell.showItemInFolder(item.path as string)}
							/>
						)}
						{item.url && (
							<OverlayButton icon="icon-[mdi--download]" title="下载" onClick={() => downloadItem(item)} />
						)}
						<OverlayButton icon="icon-[mdi--close]" title="关闭 (Esc)" onClick={close} />
					</div>

					{/* ─── 图片组左右箭头 ─── */}
					{isImageGroup && (
						<>
							<OverlayArrow
								side="left"
								disabled={ctx.index <= 0}
								onClick={(e) => {
									stop(e);
									goPrev();
								}}
							/>
							<OverlayArrow
								side="right"
								disabled={ctx.index >= ctx.items.length - 1}
								onClick={(e) => {
									stop(e);
									goNext();
								}}
							/>
						</>
					)}

					{/* ─── 底部区：图片组缩略图条 + label（沉浸式无遮罩，label 在最底部，label 由预览层提供） ─── */}
					{isImage(item) && (
						<div
							className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-2 px-4 pb-4"
							onClick={stop}
						>
							{isImageGroup && (
								// p-1.5：给选中项的 ring 留出空间，否则被 overflow 裁掉
								<div className="flex max-w-full gap-2 overflow-x-auto p-1.5">
									{ctx.items.map((it, i) => (
										<Thumbnail
											key={it.path ?? it.url ?? `${it.name}-${i}`}
											item={it}
											active={i === ctx.index}
											onClick={() => selectIndex(i)}
										/>
									))}
								</div>
							)}
							<span className="max-w-[80vw] truncate text-[12px] text-white/60">{getPreviewLabel(item)}</span>
						</div>
					)}
				</motion.div>
			)}
		</AnimatePresence>
	);
}

function OverlayButton({
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
			title={title}
			onClick={(e) => {
				e.stopPropagation();
				onClick();
			}}
			className="pointer-events-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/15 hover:text-white"
		>
			<span className={cn(icon, "h-5 w-5")} />
		</button>
	);
}

function OverlayArrow({
	side,
	disabled,
	onClick,
}: {
	side: "left" | "right";
	disabled: boolean;
	onClick: (e: React.MouseEvent) => void;
}): JSX.Element {
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={onClick}
			className={cn(
				"absolute top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full transition-colors",
				side === "left" ? "left-4" : "right-4",
				disabled
					? "text-white/20"
					: "bg-white/10 text-white/80 hover:bg-white/20 hover:text-white",
			)}
		>
			<span className={cn(side === "left" ? "icon-[mdi--chevron-left]" : "icon-[mdi--chevron-right]", "h-6 w-6")} />
		</button>
	);
}

function Thumbnail({
	item,
	active,
	onClick,
}: {
	item: FilePreviewItem;
	active: boolean;
	onClick: () => void;
}): JSX.Element {
	const { src, error } = useImageSrc(item);
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"h-16 w-16 shrink-0 overflow-hidden rounded-md transition-all",
				active ? "ring-2 ring-white" : "opacity-60 hover:opacity-100",
			)}
		>
			{error || !src ? (
				<div className="flex h-full w-full items-center justify-center bg-white/10">
					<span className="icon-[mdi--image-outline] h-5 w-5 text-white/40" />
				</div>
			) : (
				<img src={src} alt={item.name} draggable={false} className="h-full w-full object-cover" />
			)}
		</button>
	);
}
