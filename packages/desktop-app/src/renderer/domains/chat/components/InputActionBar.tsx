import { useAtom, useAtomValue } from "jotai";
import { AnimatePresence, motion } from "motion/react";
import { useCallback } from "react";
import { activeInputActionIdsAtom, pluginInputActionsAtom } from "@shared/store/atoms";
import { cn } from "@shared/lib/utils";

/**
 * Plugin input-action toggles, shown as a fluid capsule row beneath the AI
 * input bar. Clicking activates an action; clicking again deactivates. Active
 * ids are tracked in activeInputActionIdsAtom and consumed at send time
 * (decoratePrompt → PromptRequest.metadata). Distinct from ActionButtonBar.
 */
export function InputActionBar(): JSX.Element | null {
	const actions = useAtomValue(pluginInputActionsAtom);
	const [activeIds, setActiveIds] = useAtom(activeInputActionIdsAtom);

	const toggle = useCallback(
		(actionId: string, onToggle: ((active: boolean) => void) | undefined) => {
			setActiveIds((prev) => {
				const next = new Set(prev);
				const active = !next.has(actionId);
				if (active) next.add(actionId);
				else next.delete(actionId);
				onToggle?.(active);
				return next;
			});
		},
		[setActiveIds],
	);

	if (actions.length === 0) return null;

	return (
		<div className="mt-1.5 flex flex-wrap gap-1.5 px-1">
			<AnimatePresence initial={false}>
				{actions.map((action, idx) => {
					const active = activeIds.has(action.actionId);
					return (
						<motion.button
							key={action.actionId}
							type="button"
							layout
							initial={{ scale: 0.7, opacity: 0, y: -6 }}
							animate={{ scale: 1, opacity: 1, y: 0 }}
							exit={{ scale: 0.7, opacity: 0, y: -4 }}
							transition={{ type: "spring", stiffness: 520, damping: 30, delay: idx * 0.03 }}
							whileHover={{ y: 1, scale: 1.03 }}
							whileTap={{ scale: 0.95 }}
							onClick={() => toggle(action.actionId, action.onToggle)}
							className={cn(
								"flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors",
								active
									? "border-primary/30 bg-primary/15 text-primary shadow-[0_1px_6px_-2px_var(--primary)]"
									: "border-border/60 bg-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
							)}
						>
							{action.icon && (
								<motion.span
									className="flex h-3.5 w-3.5 items-center justify-center"
									animate={active ? { rotate: [0, -8, 8, 0] } : { rotate: 0 }}
									transition={{ duration: 0.4 }}
								>
									{action.icon}
								</motion.span>
							)}
							<span>{action.label}</span>
						</motion.button>
					);
				})}
			</AnimatePresence>
		</div>
	);
}
