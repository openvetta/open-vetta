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
				initial={{ opacity: 0, y: 8 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
				className="rounded-t-xl border-x border-t border-border bg-card overflow-hidden"
			>
				{/* Tab bar */}
				<div className="flex items-center gap-0 px-3 py-2">
					{tabs.map((tab, i) => (
						<div key={tab.id} className="flex items-center">
							{i > 0 && <span className="mx-2 h-3 w-px bg-border" />}
							<button
								type="button"
								onClick={() => handleTabClick(tab.id)}
								className={`flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs transition-colors hover:bg-muted/50 ${
									activeId === tab.id ? "text-foreground" : "text-muted-foreground"
								}`}
							>
								{/* Color dot */}
								<span
									className={`h-2 w-2 shrink-0 rounded-full ${tab.color} ${tab.pulsing ? "animate-pulse" : ""}`}
								/>
								{/* Label */}
								<span className="font-medium">{tab.label}</span>
								{/* Desc */}
								{tab.desc && (
									<span className="max-w-[160px] truncate text-muted-foreground/60">
										{tab.desc}
									</span>
								)}
							</button>
						</div>
					))}
				</div>

				{/* Expandable content area */}
				<AnimatePresence initial={false}>
					{activeTab && (
						<motion.div
							key={activeTab.id}
							initial={{ height: 0, opacity: 0 }}
							animate={{ height: "auto", opacity: 1 }}
							exit={{ height: 0, opacity: 0 }}
							transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
							className="overflow-hidden border-t border-border"
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
