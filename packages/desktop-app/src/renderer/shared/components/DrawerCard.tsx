import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useState } from "react";

export interface DrawerTab {
	id: string;
	label: string;
	/** Tailwind bg color class for the dot, e.g. "bg-emerald-400" */
	color: string;
	/** Extra description shown next to the label, e.g. "1/4 xxx..." */
	desc?: string;
	/** Whether the dot should pulse (e.g. has in_progress items) */
	pulsing?: boolean;
	/** Content rendered when this tab is expanded */
	content: ReactNode;
}

interface DrawerCardProps {
	tabs: DrawerTab[];
	/** Controlled active tab id. null = collapsed. */
	activeTabId?: string | null;
	/** Called when active tab changes (click to expand/collapse). */
	onActiveTabChange?: (tabId: string | null) => void;
}

/**
 * Floating drawer that sits above the input card.
 * Absolutely positioned, narrower than parent, centered.
 * Renders nothing when tabs array is empty.
 */
export function DrawerCard({ tabs, activeTabId: controlledId, onActiveTabChange }: DrawerCardProps): JSX.Element | null {
	const [internalId, setInternalId] = useState<string | null>(null);

	const isControlled = controlledId !== undefined;
	const activeId = isControlled ? controlledId : internalId;
	const setActiveId = isControlled
		? (id: string | null) => onActiveTabChange?.(id)
		: setInternalId;

	if (tabs.length === 0) return null;

	const activeTab = tabs.find((t) => t.id === activeId);

	function handleTabClick(tabId: string): void {
		setActiveId(activeId === tabId ? null : tabId);
	}

	return (
		<div className="absolute bottom-full left-1/2 -translate-x-1/2 w-[92%] z-10">
			<motion.div
				initial={{ opacity: 0, y: 10 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
				className="overflow-hidden rounded-t-2xl border-x border-t border-border bg-card/95 backdrop-blur"
			>
				{/* Tab bar */}
				<div className="flex items-center gap-0.5 px-2.5 py-1.5">
					{tabs.map((tab, i) => {
						const isActive = activeId === tab.id;
						return (
							<div key={tab.id} className="flex items-center">
								{i > 0 && <span className="mx-1.5 h-3 w-px bg-border/70" />}
								<motion.button
									type="button"
									onClick={() => handleTabClick(tab.id)}
									whileHover={{ y: -1 }}
									whileTap={{ scale: 0.97 }}
									transition={{ type: "spring", stiffness: 480, damping: 28 }}
									className={`relative flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors ${
										isActive
											? "text-foreground bg-muted/60"
											: "text-muted-foreground hover:bg-muted/40"
									}`}
								>
									<span className="relative flex h-2 w-2 shrink-0 items-center justify-center">
										{tab.pulsing && (
											<motion.span
												className={`absolute inset-0 rounded-full ${tab.color} opacity-50`}
												animate={{ scale: [1, 1.9], opacity: [0.5, 0] }}
												transition={{
													duration: 1.4,
													repeat: Number.POSITIVE_INFINITY,
													ease: "easeOut",
												}}
											/>
										)}
										<span className={`relative h-2 w-2 rounded-full ${tab.color}`} />
									</span>
									<span className="font-medium">{tab.label}</span>
									{tab.desc && (
										<span className="max-w-[180px] truncate text-muted-foreground/60">
											{tab.desc}
										</span>
									)}
								</motion.button>
							</div>
						);
					})}
				</div>

				{/* Expandable content area */}
				<AnimatePresence initial={false}>
					{activeTab && (
						<motion.div
							key={activeTab.id}
							initial={{ height: 0, opacity: 0 }}
							animate={{ height: "auto", opacity: 1 }}
							exit={{ height: 0, opacity: 0 }}
							transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
							className="overflow-hidden border-t border-border/70"
						>
							<div className="p-3">
								{activeTab.content}
							</div>
						</motion.div>
					)}
				</AnimatePresence>
			</motion.div>
		</div>
	);
}
