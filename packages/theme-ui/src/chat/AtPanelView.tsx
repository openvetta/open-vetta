import { AnimatePresence, motion } from "motion/react";
import type { JSX, RefObject } from "react";
import { ThemeSurface } from "../appearance/ThemeSurface";

export interface AtPanelClassNames {
	root?: string;
	content?: string;
	header?: string;
	list?: string;
	item?: string;
}

export interface AtPanelEntryModel {
	path: string;
	name: string;
	isDirectory: boolean;
	relPath?: string;
	/** Optional extension metadata. File entries omit this field. */
	kind?: string;
	avatar?: string;
	meta?: string;
	index: number;
	active: boolean;
	icon: string;
}

export interface AtPanelLabels {
	header: string;
	headingMeta: string;
	loading: string;
	noResults: string;
	emptyDirectory: string;
	goUp: string;
	enterDirectory: string;
	/** 浏览目录时的「引用此目录」。旧主题可以不提供，那时不显示按钮。 */
	citeDirectory?: string;
	citeDirectoryHint?: string;
}

export interface AtPanelViewProps {
	open: boolean;
	loading: boolean;
	normalizedFilter: string;
	canGoUp: boolean;
	goUpActive: boolean;
	entries: AtPanelEntryModel[];
	labels: AtPanelLabels;
	panelRef: RefObject<HTMLDivElement | null>;
	className?: string;
	classNames?: AtPanelClassNames;
	onGoUp: () => void;
	onHoverIndex: (index: number) => void;
	onEntryClick: (entry: AtPanelEntryModel) => void;
	onCiteDirectory?: (entry: AtPanelEntryModel) => void;
}

export function AtPanelView({
	open,
	loading,
	normalizedFilter,
	canGoUp,
	goUpActive,
	entries,
	labels,
	panelRef,
	className,
	classNames,
	onGoUp,
	onHoverIndex,
	onEntryClick,
	onCiteDirectory,
}: AtPanelViewProps): JSX.Element {
	return (
		<AnimatePresence>
			{open && (
				<motion.div
					ref={panelRef}
					initial={{ opacity: 0, y: 8, scaleY: 0.96 }}
					animate={{ opacity: 1, y: 0, scaleY: 1 }}
					exit={{ opacity: 0, y: 8, scaleY: 0.96 }}
					transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
					className={[
						"absolute inset-x-0 bottom-full z-50 mb-1.5 origin-bottom overflow-visible rounded-2xl border border-border bg-input-bar-bg",
						className,
						classNames?.root,
					]
						.filter(Boolean)
						.join(" ")}
					style={{
						maxHeight: 320,
					}}
				>
					<ThemeSurface slot="chat.atPanel" />
					<div className={["relative z-10 overflow-hidden rounded-[inherit]", classNames?.content].filter(Boolean).join(" ")}>
						<div className={["flex items-center gap-2 border-b border-border px-4 py-2.5", classNames?.header].filter(Boolean).join(" ")}>
							<span className="icon-[solar--mention-circle-linear] h-4 w-4 text-muted-foreground/50" />
							<span className="text-[12px] font-medium text-muted-foreground/50" title={labels.header}>
								{labels.header}
							</span>
							<span className="ml-auto font-mono text-[11px] text-muted-foreground/50">{labels.headingMeta}</span>
						</div>

						<div className="overflow-y-auto" style={{ maxHeight: 280 }}>
							{loading ? (
								<div className="flex items-center justify-center py-8 text-[12px] text-muted-foreground/50">
									{labels.loading}
								</div>
							) : entries.length === 0 && !canGoUp ? (
								<div className="flex items-center justify-center py-8 text-[12px] text-muted-foreground/50">
									{normalizedFilter ? labels.noResults : labels.emptyDirectory}
								</div>
							) : (
								<div className={["py-1", classNames?.list].filter(Boolean).join(" ")}>
									{canGoUp && (
										<button
											type="button"
											data-index={0}
											onMouseEnter={() => onHoverIndex(0)}
											onClick={onGoUp}
											className={["relative flex w-full items-center gap-3 px-4 py-1.5 text-left transition-colors", classNames?.item]
												.filter(Boolean)
												.join(" ")}
											style={{
												background: goUpActive
													? "color-mix(in srgb, var(--primary) 9%, transparent)"
													: "transparent",
											}}
										>
											{goUpActive && (
												<motion.span
													layoutId="at-active-marker"
													className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary"
													transition={{ type: "spring", stiffness: 500, damping: 32 }}
												/>
											)}
											<span className="icon-[solar--arrow-left-up-linear] h-4 w-4 text-muted-foreground/50" />
											<span className="text-[12px] text-muted-foreground/50" title={labels.goUp}>
												{labels.goUp}
											</span>
										</button>
									)}

									{entries.map((entry) => (
										<AtPanelEntry
											key={entry.path}
											entry={entry}
											className={classNames?.item}
											enterDirectoryLabel={labels.enterDirectory}
											citeDirectoryLabel={labels.citeDirectory}
											citeDirectoryHint={labels.citeDirectoryHint}
											onHover={() => onHoverIndex(entry.index)}
											onClick={() => onEntryClick(entry)}
											onCite={onCiteDirectory ? () => onCiteDirectory(entry) : undefined}
										/>
									))}
								</div>
							)}
						</div>
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}

function AtPanelEntry({
	entry,
	className,
	enterDirectoryLabel,
	citeDirectoryLabel,
	citeDirectoryHint,
	onHover,
	onClick,
	onCite,
}: {
	entry: AtPanelEntryModel;
	className?: string;
	enterDirectoryLabel: string;
	citeDirectoryLabel?: string;
	citeDirectoryHint?: string;
	onHover: () => void;
	onClick: () => void;
	onCite?: () => void;
}): JSX.Element {
	// 搜索结果带 relPath，整行点击就是引用；只有浏览中的目录才需要单独的引用按钮。
	const browsingDirectory = entry.isDirectory && entry.relPath === undefined;
	const citeLabel = browsingDirectory && onCite && citeDirectoryLabel ? citeDirectoryLabel : undefined;
	return (
		<div
			data-index={entry.index}
			onMouseEnter={onHover}
			className={["relative flex w-full items-center transition-colors", className].filter(Boolean).join(" ")}
			style={{
				background: entry.active ? "color-mix(in srgb, var(--primary) 9%, transparent)" : "transparent",
			}}
		>
			<button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-1.5 text-left">
				{entry.active && (
					<motion.span
						layoutId="at-active-marker"
						className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary"
						transition={{ type: "spring", stiffness: 500, damping: 32 }}
					/>
				)}
				{entry.avatar ? (
					<img src={entry.avatar} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
				) : (
					<span
						className={`${entry.icon} h-4 w-4 shrink-0 ${entry.isDirectory ? "text-muted-foreground" : "text-muted-foreground/50"}`}
					/>
				)}
				<span
					className={`shrink-0 truncate text-[12.5px] ${entry.isDirectory ? "font-medium text-foreground" : "text-foreground"}`}
				>
					{entry.name}
				</span>
				{entry.meta ? (
					<span className="ml-auto truncate text-right text-[11px] text-muted-foreground/50" title={entry.meta}>
						{entry.meta}
					</span>
				) : null}
				{entry.relPath && entry.relPath !== entry.name && (
					<span className="ml-auto truncate text-right font-mono text-[10px] text-muted-foreground/40">
						{entry.relPath}
					</span>
				)}
				{browsingDirectory && (
					<span className="ml-auto text-[10px] text-muted-foreground/50" title={enterDirectoryLabel}>
						{enterDirectoryLabel}
					</span>
				)}
			</button>
			{citeLabel && (
				<button
					type="button"
					onClick={onCite}
					title={citeDirectoryHint ?? citeLabel}
					className="mr-3 shrink-0 rounded-md px-1.5 py-0.5 text-[10px] text-muted-foreground/70 hover:bg-primary/10 hover:text-foreground"
				>
					{citeLabel}
				</button>
			)}
		</div>
	);
}
