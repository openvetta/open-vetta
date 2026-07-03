import { AnimatePresence, motion } from "motion/react";
import { ThemeSurface } from "@vetta/theme-ui/appearance";
import type { SlashPanelItemModel, SlashPanelViewProps } from "./types";

export function SlashPanelView({
	open,
	placement,
	normalizedFilter,
	scenes,
	standardSkills,
	allItemsCount,
	labels,
	panelRef,
	className,
	classNames,
	onHoverItem,
	onSelectItem,
}: SlashPanelViewProps): JSX.Element {
	return (
		<AnimatePresence>
			{open && (
				<motion.div
					ref={panelRef}
					initial={{ opacity: 0, y: placement === "top" ? 8 : -8, scaleY: 0.96 }}
					animate={{ opacity: 1, y: 0, scaleY: 1 }}
					exit={{ opacity: 0, y: placement === "top" ? 8 : -8, scaleY: 0.96 }}
					transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
					className={[
						"absolute inset-x-0 z-50 overflow-visible rounded-2xl border border-border bg-card",
						placement === "top" ? "bottom-full mb-1.5 origin-bottom" : "top-full mt-1.5 origin-top",
						className,
						classNames?.root,
					]
						.filter(Boolean)
						.join(" ")}
					style={{
						maxHeight: 320,
					}}
				>
					<ThemeSurface slot="chat.slashPanel" />
					<div className={["relative z-10 overflow-hidden rounded-[inherit]", classNames?.content].filter(Boolean).join(" ")}>
						<div className={["flex items-center gap-2 border-b border-border px-4 py-2.5", classNames?.header].filter(Boolean).join(" ")}>
							<span className="icon-[solar--slash-circle-linear] h-4 w-4 text-muted-foreground/50" />
							<span className="text-[12px] font-medium text-muted-foreground/50">{labels.header}</span>
							{normalizedFilter && (
								<span className="ml-auto text-[11px] text-muted-foreground/50">{labels.resultCount}</span>
							)}
						</div>

						<div className="overflow-y-auto" style={{ maxHeight: 280 }}>
							{allItemsCount === 0 ? (
								<div className="flex items-center justify-center py-8 text-[12px] text-muted-foreground/50">
									{normalizedFilter ? labels.emptyNoMatch : labels.emptyNoSkills}
								</div>
							) : (
								<div className={["py-1.5", classNames?.list].filter(Boolean).join(" ")}>
									{scenes.length > 0 && (
										<>
											<div className="px-4 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
												{labels.scenesSection}
											</div>
											{scenes.map((item) => (
												<SlashPanelItem
													key={`scene-${item.skill.name}`}
													item={item}
													className={classNames?.item}
													onHover={() => onHoverItem(item.index)}
													onClick={() => onSelectItem(item.skill)}
												/>
											))}
										</>
									)}

									{standardSkills.length > 0 && (
										<>
											<div className="px-4 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
												{labels.skillsSection}
											</div>
											{standardSkills.map((item) => (
												<SlashPanelItem
													key={`skill-${item.skill.name}`}
													item={item}
													className={classNames?.item}
													onHover={() => onHoverItem(item.index)}
													onClick={() => onSelectItem(item.skill)}
												/>
											))}
										</>
									)}
								</div>
							)}
						</div>
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}

function SlashPanelItem({
	item,
	className,
	onHover,
	onClick,
}: {
	item: SlashPanelItemModel;
	className?: string;
	onHover: () => void;
	onClick: () => void;
}): JSX.Element {
	const isScene = item.skill.type === "scene";
	return (
		<button
			type="button"
			data-index={item.index}
			onMouseEnter={onHover}
			onClick={onClick}
			className={["relative flex w-full items-center gap-3 px-4 py-2 text-left transition-colors", className]
				.filter(Boolean)
				.join(" ")}
			style={{
				background: item.active ? "color-mix(in srgb, var(--primary) 9%, transparent)" : "transparent",
			}}
		>
			{item.active && (
				<motion.span
					layoutId="slash-active-marker"
					className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary"
					transition={{ type: "spring", stiffness: 500, damping: 32 }}
				/>
			)}
			<div
				className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${isScene ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}
			>
				<span
					className={`${isScene ? "icon-[solar--clapperboard-open-linear]" : "icon-[solar--magic-stick-linear]"} h-3.5 w-3.5`}
				/>
			</div>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="truncate text-[12.5px] font-medium text-foreground">
						{item.skill.alias || item.skill.name}
					</span>
					<span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground/50">
						{item.sourceLabel}
					</span>
				</div>
				{item.skill.description && (
					<p className="truncate text-[11px] text-muted-foreground/50">{item.skill.description}</p>
				)}
			</div>
		</button>
	);
}
