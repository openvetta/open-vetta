import { AnimatePresence, motion } from "motion/react";
import { type JSX, type ReactNode, useRef } from "react";
import { cn, OVERLAY_BACKDROP_CLASS, PANEL_SHADOW_CLASS } from "@vetta-org/ui/utils";

export interface MagpieHandoverDialogViewLabels {
	/** 标题上方的小字，点明这是一次接入方式的变化。 */
	readonly eyebrow: string;
	readonly title: string;
	readonly description: string;
	readonly stepInstall: string;
	readonly stepConnect: string;
	readonly stepUse: string;
	/** 要在 Magpie 插件页搜索的包名，做成可复制的小标签。 */
	readonly pluginName: string;
	readonly copy: string;
	readonly copied: string;
	readonly defaultModelCleared: string;
	readonly primary: string;
	readonly guide: string;
	readonly close: string;
}

export interface MagpieHandoverDialogViewProps {
	readonly visible: boolean;
	readonly labels: MagpieHandoverDialogViewLabels;
	/** 默认模型原本是 Magpie 的，随旧配置一起被清掉了。 */
	readonly defaultModelCleared: boolean;
	readonly copied: boolean;
	/** 顶部两枚图标：Vetta 的应用图标与 Magpie 的服务商图标，由宿主提供。 */
	readonly vettaIcon: ReactNode;
	readonly magpieIcon: ReactNode;
	readonly onCopyPluginName: () => void;
	readonly onOpenGuide: () => void;
	readonly onClose: () => void;
}

const pillClass =
	"inline-flex h-11 w-full items-center justify-center rounded-full bg-primary px-5 text-[14px] font-medium whitespace-nowrap text-primary-foreground shadow-lg shadow-black/15 transition-all outline-none select-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/50 active:translate-y-px";

const iconTileClass =
	"flex size-16 items-center justify-center overflow-hidden rounded-[18px] bg-white shadow-[0_10px_28px_rgba(15,23,42,0.18),0_2px_6px_rgba(15,23,42,0.12)] ring-1 ring-black/5";

/**
 * 升级后告诉老用户：Magpie 改由 Magpie 在其 Agents 页接入 Vetta。
 * 与「版本介绍」同一套外观：大圆角面板、顶部横幅、通栏胶囊主按钮、右上角白色关闭钮。
 * 横幅是静态的两枚图标加一条连线，表示模型从 Magpie 流向 Vetta。
 */
export function MagpieHandoverDialogView({
	visible,
	labels,
	defaultModelCleared,
	copied,
	vettaIcon,
	magpieIcon,
	onCopyPluginName,
	onOpenGuide,
	onClose,
}: MagpieHandoverDialogViewProps): JSX.Element {
	const overlayRef = useRef<HTMLDivElement>(null);
	const steps = [
		{ text: labels.stepInstall, extra: true },
		{ text: labels.stepConnect, extra: false },
		{ text: labels.stepUse, extra: false },
	];

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
					onClick={(event) => {
						if (event.target === overlayRef.current) onClose();
					}}
					onKeyDown={(event) => {
						if (event.key === "Escape") onClose();
					}}
				>
					<motion.div
						role="dialog"
						aria-modal="true"
						aria-label={labels.title}
						initial={{ opacity: 0, scale: 0.95 }}
						animate={{ opacity: 1, scale: 1 }}
						exit={{ opacity: 0, scale: 0.95 }}
						transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
						className={cn(
							"relative flex max-h-[min(780px,calc(100vh-48px))] w-[min(520px,calc(100vw-32px))] flex-col overflow-hidden rounded-3xl bg-popover",
							PANEL_SHADOW_CLASS,
						)}
					>
						<button
							type="button"
							onClick={onClose}
							aria-label={labels.close}
							className="absolute top-4 right-4 z-20 inline-flex size-8 items-center justify-center rounded-full bg-white text-neutral-900 shadow-[0_6px_18px_rgba(0,0,0,0.28),0_1px_3px_rgba(0,0,0,0.22)] transition-transform outline-none hover:scale-105 focus-visible:ring-2 focus-visible:ring-white/70 active:scale-95"
						>
							<span className="icon-[mdi--close] h-4 w-4" />
						</button>

						<div className="no-scrollbar min-h-0 flex-1 overflow-y-auto [mask-image:linear-gradient(to_bottom,black_calc(100%-20px),transparent)]">
							<HandoverBanner vettaIcon={vettaIcon} magpieIcon={magpieIcon} />

							<div className="px-7 pt-5 pb-5">
								<p className="text-[11px] font-semibold tracking-[0.08em] text-primary uppercase">{labels.eyebrow}</p>
								<h3 className="mt-1.5 text-[19px] leading-snug font-semibold tracking-tight text-foreground">
									{labels.title}
								</h3>
								<p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{labels.description}</p>

								<ol className="mt-5 flex flex-col gap-2">
									{steps.map((step, index) => (
										<li
											key={step.text}
											className="flex items-start gap-3 rounded-2xl border border-border/70 bg-muted/40 px-4 py-3"
										>
											<span className="mt-px inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[12px] font-semibold text-primary tabular-nums">
												{index + 1}
											</span>
											<div className="min-w-0 flex-1">
												<p className="text-[13px] leading-6 text-foreground">{step.text}</p>
												{step.extra && (
													<button
														type="button"
														onClick={onCopyPluginName}
														title={copied ? labels.copied : labels.copy}
														className="group mt-1.5 inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 font-mono text-[12px] text-foreground transition-colors outline-none hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring/50"
													>
														{labels.pluginName}
														<span
															className={cn(
																"h-3.5 w-3.5 transition-colors",
																copied
																	? "icon-[mdi--check] text-emerald-500"
																	: "icon-[mdi--content-copy] text-muted-foreground group-hover:text-foreground",
															)}
														/>
														<span className="sr-only">{copied ? labels.copied : labels.copy}</span>
													</button>
												)}
											</div>
										</li>
									))}
								</ol>

								{defaultModelCleared && (
									<div className="mt-3 flex items-start gap-2.5 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
										<span className="mt-0.5 icon-[mdi--information-outline] h-4 w-4 shrink-0 text-amber-500" />
										<p className="text-[12.5px] leading-relaxed text-foreground/90">{labels.defaultModelCleared}</p>
									</div>
								)}
							</div>
						</div>

						<div className="flex flex-col items-center gap-2 px-7 pt-2 pb-6">
							<button type="button" onClick={onClose} className={pillClass}>
								{labels.primary}
							</button>
							<button
								type="button"
								onClick={onOpenGuide}
								className="inline-flex h-8 items-center gap-1 rounded-full px-3 text-[12.5px] text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
							>
								{labels.guide}
								<span className="icon-[mdi--open-in-new] h-3.5 w-3.5" />
							</button>
						</div>
					</motion.div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}

/** 静态横幅：Magpie 在左、Vetta 在右，中间虚线与箭头表示模型由 Magpie 接入 Vetta。 */
function HandoverBanner({ vettaIcon, magpieIcon }: { readonly vettaIcon: ReactNode; readonly magpieIcon: ReactNode }): JSX.Element {
	return (
		<div className="relative flex h-[148px] items-center justify-center overflow-hidden bg-[radial-gradient(120%_90%_at_50%_0%,color-mix(in_oklab,var(--primary)_22%,transparent),transparent_70%),linear-gradient(180deg,color-mix(in_oklab,var(--primary)_10%,var(--popover)),var(--popover))]">
			{/* 淡淡的网格底纹，呼应 Vetta 图标的蓝格背景。 */}
			<div
				aria-hidden
				className="absolute inset-0 opacity-[0.35] [background-image:linear-gradient(to_right,color-mix(in_oklab,var(--primary)_18%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklab,var(--primary)_18%,transparent)_1px,transparent_1px)] [background-size:28px_28px] [mask-image:radial-gradient(70%_80%_at_50%_45%,black,transparent)]"
			/>
			<div className="relative flex items-center gap-4">
				<div className={iconTileClass}>{magpieIcon}</div>
				<div aria-hidden className="flex items-center gap-1.5 text-primary">
					<span className="h-px w-6 border-t-2 border-dashed border-primary/45" />
					<span className="inline-flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/30">
						<span className="icon-[mdi--arrow-right] h-4 w-4" />
					</span>
					<span className="h-px w-6 border-t-2 border-dashed border-primary/45" />
				</div>
				<div className={iconTileClass}>{vettaIcon}</div>
			</div>
		</div>
	);
}
