import { AnimatePresence, motion } from "motion/react";
import { type JSX, type RefObject, useEffect, useState } from "react";
import { cn, OVERLAY_BACKDROP_CLASS, PANEL_SHADOW_CLASS } from "@vetta-org/ui/utils";
import { ReleaseNoteMarkdown } from "./ReleaseNoteMarkdown";
import { ThemeSurface } from "../appearance/ThemeSurface";

/**
 * 更新对话框的底部状态条：检查中 / 下载进度 / 出错。
 * 其余阶段（有新版本、已就绪、已是最新、版本介绍）不需要状态条，直接展示正文。
 */
export type UpdateRestartDialogStatus =
	| { readonly kind: "checking"; readonly text: string }
	| { readonly kind: "progress"; readonly text: string; readonly progress: number }
	| { readonly kind: "error"; readonly text: string };

export interface UpdateRestartDialogAction {
	readonly disabled?: boolean;
	readonly label: string;
	readonly onClick: () => void;
}

export interface UpdateRestartDialogViewProps {
	readonly bannerSrc: string;
	/** 无正文时的占位文案（如「暂无版本介绍」）；有 releaseNote 时不显示。 */
	readonly emptyText?: string;
	readonly onClose: () => void;
	readonly overlayRef: RefObject<HTMLDivElement | null>;
	/** 主按钮；省略时只剩一个次要按钮。 */
	readonly primary?: UpdateRestartDialogAction;
	readonly releaseNote?: string;
	/** 正文标题（如「更新内容」）；无正文时不显示。 */
	readonly releaseNoteTitle?: string;
	readonly secondary: UpdateRestartDialogAction;
	readonly status?: UpdateRestartDialogStatus;
	readonly subtitle?: string;
	readonly title: string;
	readonly visible: boolean;
	/** 正文正在加载（版本介绍从磁盘读取时）。 */
	readonly loading?: boolean;
}

// 胶囊按钮：与设计稿一致，次要按钮用柔和底色，主按钮用主色。
const pillBase =
	"inline-flex h-11 flex-1 items-center justify-center rounded-full px-5 text-[14px] font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/50 active:translate-y-px disabled:pointer-events-none disabled:opacity-50";

export function UpdateRestartDialogView({
	bannerSrc,
	emptyText,
	loading = false,
	onClose,
	overlayRef,
	primary,
	releaseNote,
	releaseNoteTitle,
	secondary,
	status,
	subtitle,
	title,
	visible,
}: UpdateRestartDialogViewProps): JSX.Element {
	// 滚动后才显示顶部渐隐，初始位置横幅完整露出。
	const [scrolled, setScrolled] = useState(false);
	// 关闭后再打开，滚动位置回到顶部，渐隐也要复位。
	useEffect(() => {
		if (!visible) setScrolled(false);
	}, [visible]);
	const showEmpty = !loading && !releaseNote && !!emptyText;

	return (
		<AnimatePresence>
			{visible && (
				<motion.div
					ref={overlayRef}
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.15 }}
					className={cn("pointer-events-auto fixed inset-0 z-[100] flex items-center justify-center", OVERLAY_BACKDROP_CLASS)}
					onClick={(e) => {
						if (e.target === overlayRef.current) onClose();
					}}
				>
					<motion.div
						role="dialog"
						aria-modal="true"
						aria-label={title}
						initial={{ opacity: 0, scale: 0.95 }}
						animate={{ opacity: 1, scale: 1 }}
						exit={{ opacity: 0, scale: 0.95 }}
						transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
						className={cn(
							"relative flex max-h-[min(720px,calc(100vh-48px))] w-[min(520px,calc(100vw-32px))] flex-col overflow-hidden rounded-3xl bg-popover",
							PANEL_SHADOW_CLASS,
						)}
					>
						<ThemeSurface slot="root.updateRestartDialog.panel" />
						<div className="relative z-10 flex min-h-0 flex-1 flex-col">
							<div className="relative min-h-0 flex-1">
								<div
									className="h-full overflow-y-auto"
									onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 4)}
								>
									<img
										src={bannerSrc}
										alt=""
										draggable={false}
										className="h-[148px] w-full object-cover select-none"
									/>
									<div className="px-7 pt-6">
								<h3 className="text-[19px] leading-snug font-semibold tracking-tight text-foreground">{title}</h3>
								{subtitle && <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{subtitle}</p>}
								{status && <StatusLine status={status} />}
								{releaseNote && (
									<div className="mt-5">
										{releaseNoteTitle && (
											<h4 className="mb-2 text-[14px] font-semibold text-foreground">{releaseNoteTitle}</h4>
										)}
										<div className="markdown-body text-[13px] leading-[1.6] break-words text-muted-foreground">
											<ReleaseNoteMarkdown>{releaseNote}</ReleaseNoteMarkdown>
										</div>
									</div>
								)}
								{loading && (
									<div className="mt-5 flex items-center gap-2 text-[13px] text-muted-foreground">
										<span className="icon-[mdi--loading] h-4 w-4 animate-spin" />
									</div>
								)}
								{showEmpty && <p className="mt-5 text-[13px] text-muted-foreground">{emptyText}</p>}
									</div>
								</div>
								<div
									aria-hidden
									className={cn(
										"pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-popover to-transparent transition-opacity duration-150",
										scrolled ? "opacity-100" : "opacity-0",
									)}
								/>
							</div>
							<div className="flex shrink-0 gap-3 px-7 pt-5 pb-7">
								<button
									type="button"
									onClick={secondary.onClick}
									disabled={secondary.disabled}
									className={cn(pillBase, "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground")}
								>
									{secondary.label}
								</button>
								{primary && (
									<button
										type="button"
										onClick={primary.onClick}
										disabled={primary.disabled}
										className={cn(pillBase, "bg-primary text-primary-foreground hover:bg-primary/90")}
									>
										{primary.label}
									</button>
								)}
							</div>
						</div>
					</motion.div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}

function StatusLine({ status }: { readonly status: UpdateRestartDialogStatus }): JSX.Element {
	if (status.kind === "progress") {
		const percent = Math.max(0, Math.min(100, Math.round(status.progress * 100)));
		return (
			<div className="mt-4">
				<div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
					<div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${percent}%` }} />
				</div>
				<p className="mt-2 text-[12px] text-muted-foreground">{status.text}</p>
			</div>
		);
	}
	if (status.kind === "checking") {
		return (
			<p className="mt-4 flex items-center gap-2 text-[13px] text-muted-foreground">
				<span className="icon-[mdi--loading] h-4 w-4 animate-spin" />
				{status.text}
			</p>
		);
	}
	return <p className="mt-4 text-[13px] break-words text-destructive">{status.text}</p>;
}
