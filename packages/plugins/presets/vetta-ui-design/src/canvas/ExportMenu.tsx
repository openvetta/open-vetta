import { useTranslation } from "@vetta-org/plugin-sdk";
import { type JSX, useEffect, useId, useRef, useState } from "react";

/** 下拉里的四个动作：范围（选中 / 全部）× 形态（图片 / PDF）。 */
export type MaterialAction = "selected-images" | "all-images" | "selected-pdf" | "all-pdf";

export interface MaterialProgress {
	done: number;
	total: number;
}

interface ExportMenuProps {
	selectedCount: number;
	totalCount: number;
	/** 非 null 表示正在导出：按钮显示进度，且不再接受新的动作。 */
	progress: MaterialProgress | null;
	onPick(action: MaterialAction): void;
	/** 「制作渲染图」：进渲染图工作台排版。 */
	onMakeMockup(): void;
}

const icons = {
	download: (
		<svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
			<path d="M12 4v11" strokeLinecap="round" />
			<path d="M8 11l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
			<path d="M4 15v3a3 3 0 003 3h10a3 3 0 003-3v-3" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	),
	chevron: (
		<svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
			<path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	),
	chevronRight: (
		<svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
			<path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	),
	mockup: (
		<svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
			<rect x="7" y="3" width="10" height="18" rx="2" />
			<path d="M11 18h2" strokeLinecap="round" />
		</svg>
	),
	image: (
		<svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
			<rect x="3" y="5" width="18" height="14" rx="2" />
			<path d="M3 16l5-5 4 4 3-3 6 6" strokeLinecap="round" strokeLinejoin="round" />
			<circle cx="16" cy="9" r="1.5" />
		</svg>
	),
	pdf: (
		<svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
			<path d="M7 3h7l5 5v13H7z" strokeLinejoin="round" />
			<path d="M14 3v5h5" strokeLinejoin="round" />
			<path d="M9 13h6M9 17h6" strokeLinecap="round" />
		</svg>
	),
};

interface Item {
	action: MaterialAction;
	icon: JSX.Element;
	label: string;
	disabled: boolean;
}

/**
 * 画布右上角的「导出」下拉：「制作渲染图」进工作台排版；「导出 Frame」hover 展开二级菜单，
 * 直接落文件。二级的四个选项按「图片 / PDF」分两组，各组里先选中后全部。没选中时选中项禁用而不是隐藏——
 * 让人知道这个能力存在、要先去选。
 */
export function ExportMenu({ selectedCount, totalCount, progress, onPick, onMakeMockup }: ExportMenuProps) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	/** 「导出 Frame」二级菜单：hover 展开，点击 / 键盘聚焦也能展开。 */
	const [framesOpen, setFramesOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement | null>(null);
	const menuId = useId();
	const busy = progress !== null;

	// 点别处 / Esc 关掉。捕获阶段监听：画布根在 pointerdown 时会 setPointerCapture，
	// 冒泡阶段这条事件已经改派走了。
	useEffect(() => {
		if (!open) return;
		const onPointerDown = (event: PointerEvent): void => {
			if (rootRef.current?.contains(event.target as Node)) return;
			setOpen(false);
		};
		const onKeyDown = (event: KeyboardEvent): void => {
			if (event.key !== "Escape") return;
			event.stopPropagation();
			setOpen(false);
		};
		window.addEventListener("pointerdown", onPointerDown, true);
		window.addEventListener("keydown", onKeyDown, true);
		return () => {
			window.removeEventListener("pointerdown", onPointerDown, true);
			window.removeEventListener("keydown", onKeyDown, true);
		};
	}, [open]);

	useEffect(() => {
		if (!open) setFramesOpen(false);
	}, [open]);

	// 导出一开始就收起菜单：进度显示在按钮上，菜单留着只会挡住它。
	useEffect(() => {
		if (busy) setOpen(false);
	}, [busy]);

	const items: Item[] = [
		{ action: "selected-images", icon: icons.image, label: t("canvas.download.selectedImages"), disabled: selectedCount === 0 },
		{ action: "all-images", icon: icons.image, label: t("canvas.download.allImages"), disabled: totalCount === 0 },
		{ action: "selected-pdf", icon: icons.pdf, label: t("canvas.download.selectedPdf"), disabled: selectedCount === 0 },
		{ action: "all-pdf", icon: icons.pdf, label: t("canvas.download.allPdf"), disabled: totalCount === 0 },
	];

	const itemClass =
		"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-accent";

	const label = busy ? t("canvas.download.running", { done: progress.done, total: progress.total }) : t("canvas.export.label");

	return (
		<div ref={rootRef} className="relative">
			<button
				type="button"
				title={t("canvas.export.label")}
				aria-haspopup="menu"
				aria-expanded={open}
				aria-controls={open ? menuId : undefined}
				aria-busy={busy}
				disabled={busy}
				onClick={() => setOpen((current) => !current)}
				className={`flex h-8 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-medium transition-colors disabled:opacity-60 ${
					open ? "bg-primary/10 text-primary" : "bg-popover text-foreground hover:bg-accent"
				}`}
			>
				{icons.download}
				<span className="whitespace-nowrap tabular-nums">{label}</span>
				{icons.chevron}
			</button>
			{open ? (
				<div
					id={menuId}
					role="menu"
					aria-label={t("canvas.export.label")}
					className="absolute right-0 top-full z-50 mt-1.5 min-w-40 rounded-xl border border-border bg-card p-1 shadow-xl"
				>
					<button
						type="button"
						role="menuitem"
						onClick={() => {
							setOpen(false);
							onMakeMockup();
						}}
						onMouseEnter={() => setFramesOpen(false)}
						className={itemClass}
					>
						{icons.mockup}
						<span className="truncate">{t("canvas.export.mockup")}</span>
					</button>
					{/* 二级菜单挂在整行上：指针从行移进子菜单不经过空隙（子菜单与行紧贴，pr 留的是视觉间距）。 */}
					<div className="relative" onMouseEnter={() => setFramesOpen(true)} onMouseLeave={() => setFramesOpen(false)}>
						<button
							type="button"
							role="menuitem"
							aria-haspopup="menu"
							aria-expanded={framesOpen}
							onClick={() => setFramesOpen((current) => !current)}
							onFocus={() => setFramesOpen(true)}
							className={`${itemClass} justify-between ${framesOpen ? "bg-accent" : ""}`}
						>
							<span className="flex items-center gap-2">
								{icons.image}
								<span className="truncate">{t("canvas.export.frames")}</span>
							</span>
							{icons.chevronRight}
						</button>
						{framesOpen ? (
							<div className="absolute right-full top-0 z-50 pr-1.5">
								<div
									role="menu"
									aria-label={t("canvas.export.frames")}
									className="min-w-52 rounded-xl border border-border bg-card p-1 shadow-xl"
								>
									{items.map((item, index) => (
										<div key={item.action}>
											{index === 2 ? <div className="my-1 h-px bg-border" /> : null}
											<button
												type="button"
												role="menuitem"
												disabled={item.disabled}
												onClick={() => {
													setOpen(false);
													onPick(item.action);
												}}
												className={`${itemClass} disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent`}
											>
												{item.icon}
												<span className="truncate">{item.label}</span>
											</button>
										</div>
									))}
								</div>
							</div>
						) : null}
					</div>
				</div>
			) : null}
		</div>
	);
}
