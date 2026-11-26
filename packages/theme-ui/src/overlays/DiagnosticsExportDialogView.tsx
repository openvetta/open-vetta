import { AnimatePresence, motion } from "motion/react";
import { type JSX, useRef } from "react";
import { cn, OVERLAY_BACKDROP_CLASS, PANEL_SHADOW_CLASS } from "@vetta-org/ui/utils";

/** idle：还没导出；exporting：保存对话框已确认，正在打包；done：已写到用户选的位置；error：打包或写盘失败。 */
export type DiagnosticsExportDialogPhase = "idle" | "exporting" | "done" | "error";

export interface DiagnosticsExportDialogViewLabels {
	readonly eyebrow: string;
	readonly title: string;
	readonly description: string;
	/** 讲明 Vetta 不收集用户数据、诊断包只在用户主动附上时才被看到。 */
	readonly noCollection: string;
	/** 「诊断包里有什么」小标题与三项内容。 */
	readonly contentsTitle: string;
	readonly contentsLogs: string;
	readonly contentsRecentLogs: string;
	readonly contentsSystem: string;
	/** 提醒诊断包里可能有项目路径、文件名和报错内容，由用户酌情发送。 */
	readonly privacyNote: string;
	/** 「怎么反馈」小标题与三步；最后一步不限渠道，GitHub Issue 与私聊都行。 */
	readonly stepsTitle: string;
	readonly stepExport: string;
	readonly stepDescribe: string;
	readonly stepAttach: string;
	readonly export: string;
	readonly exporting: string;
	/** 导出成功后的提示，前缀接文件名。 */
	readonly saved: string;
	readonly showInFolder: string;
	readonly failed: string;
	/** 次要入口：打开 GitHub 的 Bug 反馈页，只是渠道之一。 */
	readonly openIssue: string;
	readonly close: string;
}

export interface DiagnosticsExportDialogViewProps {
	readonly visible: boolean;
	readonly phase: DiagnosticsExportDialogPhase;
	readonly labels: DiagnosticsExportDialogViewLabels;
	/** phase 为 done 时保存下来的文件名。 */
	readonly savedFileName?: string;
	/** phase 为 error 时的原因。 */
	readonly errorMessage?: string;
	readonly onExport: () => void;
	readonly onShowInFolder: () => void;
	readonly onOpenIssue: () => void;
	readonly onClose: () => void;
}

const pillClass =
	"inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 text-[14px] font-medium whitespace-nowrap text-primary-foreground shadow-lg shadow-black/15 transition-all outline-none select-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/50 active:translate-y-px disabled:pointer-events-none disabled:opacity-70";

// 与 Magpie 接入弹窗同一套图标块：任何主题下都是白底深色图标。
const iconTileClass =
	"flex size-16 items-center justify-center overflow-hidden rounded-[18px] bg-white text-neutral-900 shadow-[0_10px_28px_rgba(15,23,42,0.18),0_2px_6px_rgba(15,23,42,0.12)] ring-1 ring-black/5";

/**
 * 「导出诊断包」引导弹窗：说明 Vetta 不收集数据、包里有什么、怎么把它发给开发者。
 * 外观沿用 Magpie 接入弹窗：大圆角面板、静态横幅、编号步骤、通栏胶囊主按钮。
 * 主按钮随阶段变化：导出 → 正在打包 → 在文件夹中显示。
 */
export function DiagnosticsExportDialogView({
	visible,
	phase,
	labels,
	savedFileName,
	errorMessage,
	onExport,
	onShowInFolder,
	onOpenIssue,
	onClose,
}: DiagnosticsExportDialogViewProps): JSX.Element {
	const overlayRef = useRef<HTMLDivElement>(null);
	const exporting = phase === "exporting";
	const contents = [
		{ icon: "icon-[mdi--file-document-outline]", text: labels.contentsLogs },
		{ icon: "icon-[mdi--history]", text: labels.contentsRecentLogs },
		{ icon: "icon-[mdi--monitor]", text: labels.contentsSystem },
	];
	const steps = [labels.stepExport, labels.stepDescribe, labels.stepAttach];
	const close = () => {
		if (!exporting) onClose();
	};

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
						if (event.target === overlayRef.current) close();
					}}
					onKeyDown={(event) => {
						if (event.key === "Escape") close();
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
							onClick={close}
							disabled={exporting}
							aria-label={labels.close}
							className="absolute top-4 right-4 z-20 inline-flex size-8 items-center justify-center rounded-full bg-white text-neutral-900 shadow-[0_6px_18px_rgba(0,0,0,0.28),0_1px_3px_rgba(0,0,0,0.22)] transition-transform outline-none hover:scale-105 focus-visible:ring-2 focus-visible:ring-white/70 active:scale-95 disabled:opacity-50"
						>
							<span className="icon-[mdi--close] h-4 w-4" />
						</button>

						<div className="no-scrollbar min-h-0 flex-1 overflow-y-auto [mask-image:linear-gradient(to_bottom,black_calc(100%-20px),transparent)]">
							<DiagnosticsBanner />

							<div className="px-7 pt-5 pb-5">
								<p className="text-[11px] font-semibold tracking-[0.08em] text-primary uppercase">{labels.eyebrow}</p>
								<h3 className="mt-1.5 text-[19px] leading-snug font-semibold tracking-tight text-foreground">
									{labels.title}
								</h3>
								<p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{labels.description}</p>

								<div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-primary/25 bg-primary/8 px-4 py-3">
									<span className="mt-0.5 icon-[mdi--shield-check-outline] h-4 w-4 shrink-0 text-primary" />
									<p className="text-[12.5px] leading-relaxed text-foreground/90">{labels.noCollection}</p>
								</div>

								<p className="mt-5 text-[12px] font-medium text-muted-foreground">{labels.contentsTitle}</p>
								<ul className="mt-2 flex flex-col gap-1.5">
									{contents.map((item) => (
										<li key={item.text} className="flex items-start gap-2.5 text-[13px] leading-6 text-foreground">
											<span className={cn("mt-1 h-4 w-4 shrink-0 text-primary", item.icon)} />
											{item.text}
										</li>
									))}
								</ul>

								<div className="mt-3 flex items-start gap-2.5 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
									<span className="mt-0.5 icon-[mdi--information-outline] h-4 w-4 shrink-0 text-amber-500" />
									<p className="text-[12.5px] leading-relaxed text-foreground/90">{labels.privacyNote}</p>
								</div>

								<p className="mt-5 text-[12px] font-medium text-muted-foreground">{labels.stepsTitle}</p>
								<ol className="mt-2 flex flex-col gap-2">
									{steps.map((step, index) => (
										<li
											key={step}
											className="flex items-start gap-3 rounded-2xl border border-border/70 bg-muted/40 px-4 py-3"
										>
											<span className="mt-px inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[12px] font-semibold text-primary tabular-nums">
												{index + 1}
											</span>
											<p className="min-w-0 flex-1 text-[13px] leading-6 text-foreground">{step}</p>
										</li>
									))}
								</ol>

								{phase === "done" && savedFileName && (
									<div
										role="status"
										className="mt-3 flex items-start gap-2.5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3"
									>
										<span className="mt-0.5 icon-[mdi--check-circle] h-4 w-4 shrink-0 text-emerald-500" />
										<p className="min-w-0 text-[12.5px] leading-relaxed break-all text-foreground/90">
											{labels.saved}
											<span className="font-mono">{savedFileName}</span>
										</p>
									</div>
								)}
								{phase === "error" && (
									<div
										role="alert"
										className="mt-3 flex items-start gap-2.5 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3"
									>
										<span className="mt-0.5 icon-[mdi--alert-circle-outline] h-4 w-4 shrink-0 text-destructive" />
										<div className="min-w-0 text-[12.5px] leading-relaxed break-words text-foreground/90">
											<p className="font-medium">{labels.failed}</p>
											{errorMessage && <p className="mt-0.5 text-muted-foreground">{errorMessage}</p>}
										</div>
									</div>
								)}
							</div>
						</div>

						<div className="flex flex-col items-center gap-2 px-7 pt-2 pb-6">
							{phase === "done" ? (
								<button type="button" onClick={onShowInFolder} className={pillClass}>
									<span className="icon-[mdi--folder-open-outline] h-4 w-4" />
									{labels.showInFolder}
								</button>
							) : (
								<button type="button" onClick={onExport} disabled={exporting} className={pillClass}>
									{exporting && <span className="icon-[mdi--loading] h-4 w-4 animate-spin" />}
									{exporting ? labels.exporting : labels.export}
								</button>
							)}
							<button
								type="button"
								onClick={onOpenIssue}
								className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
							>
								<span className="icon-[mdi--github] h-3.5 w-3.5" />
								{labels.openIssue}
								<span className="icon-[mdi--open-in-new] h-3.5 w-3.5" />
							</button>
						</div>
					</motion.div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}

/** 静态横幅：诊断包在左、消息在右，中间箭头表示由用户自己把诊断包发给开发者。 */
function DiagnosticsBanner(): JSX.Element {
	return (
		<div className="relative flex h-[148px] items-center justify-center overflow-hidden bg-[radial-gradient(120%_90%_at_50%_0%,color-mix(in_oklab,var(--primary)_22%,transparent),transparent_70%),linear-gradient(180deg,color-mix(in_oklab,var(--primary)_10%,var(--popover)),var(--popover))]">
			<div
				aria-hidden
				className="absolute inset-0 opacity-[0.35] [background-image:linear-gradient(to_right,color-mix(in_oklab,var(--primary)_18%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklab,var(--primary)_18%,transparent)_1px,transparent_1px)] [background-size:28px_28px] [mask-image:radial-gradient(70%_80%_at_50%_45%,black,transparent)]"
			/>
			<div aria-hidden className="relative flex items-center gap-4">
				<div className={iconTileClass}>
					<span className="icon-[mdi--folder-zip-outline] size-9" />
				</div>
				<div className="flex items-center gap-1.5 text-primary">
					<span className="h-px w-6 border-t-2 border-dashed border-primary/45" />
					<span className="inline-flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/30">
						<span className="icon-[mdi--arrow-right] h-4 w-4" />
					</span>
					<span className="h-px w-6 border-t-2 border-dashed border-primary/45" />
				</div>
				<div className={iconTileClass}>
					<span className="icon-[mdi--message-text-outline] size-9" />
				</div>
			</div>
		</div>
	);
}
