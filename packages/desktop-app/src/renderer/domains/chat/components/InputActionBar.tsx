import { useAtom, useAtomValue } from "jotai";
import { AnimatePresence, motion } from "motion/react";
import { useCallback } from "react";
import { activeInputActionIdsAtom, pluginInputActionsAtom } from "@shared/store/atoms";
import { cn } from "@shared/lib/utils";

/**
 * Plugin input-action toggles, shown as a borderless row seated on the recessed
 * "ledge" beneath the AI input card. Clicking activates an action; clicking
 * again deactivates. Active ids are tracked in activeInputActionIdsAtom and
 * consumed at send time (decoratePrompt → PromptRequest.metadata). Distinct
 * from ActionButtonBar.
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
		<motion.div
			// 从卡片背后向下滑出：初始整体上移并被 z-10 的输入卡遮住，再滑落露出下沿，
			// 视觉上像是从 AI input bar 里滑出来。
			initial={{ y: "-100%", opacity: 0 }}
			animate={{ y: 0, opacity: 1 }}
			transition={{ type: "spring", stiffness: 440, damping: 36, mass: 0.9 }}
			className="input-ledge relative z-0 -mt-[18px] mx-3 flex flex-wrap gap-0.5 rounded-b-[14px] px-3 pb-1 pt-[22px]"
		>
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
							whileTap={{ scale: 0.95 }}
							onClick={() => toggle(action.actionId, action.onToggle)}
							className={cn(
								"flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-[12px] font-medium transition-colors",
								active
									? "text-primary"
									: "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
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
		</motion.div>
	);
}

/**
 * Capsule chips for currently-active input actions, attached to the right of the
 * permission/execution-mode selector inside the input toolbar. Clicking a chip
 * deactivates that action (mirrors the toggle in InputActionBar).
 */
export function ActiveInputActionChips(): JSX.Element | null {
	const actions = useAtomValue(pluginInputActionsAtom);
	const [activeIds, setActiveIds] = useAtom(activeInputActionIdsAtom);

	const deactivate = useCallback(
		(actionId: string, onToggle: ((active: boolean) => void) | undefined) => {
			setActiveIds((prev) => {
				const next = new Set(prev);
				next.delete(actionId);
				onToggle?.(false);
				return next;
			});
		},
		[setActiveIds],
	);

	const activeActions = actions.filter((a) => activeIds.has(a.actionId));

	return (
		<AnimatePresence initial={false}>
			{activeActions.map((action) => (
				<motion.button
					key={action.actionId}
					type="button"
					layout
					initial={{ scale: 0.7, opacity: 0, x: -6 }}
					animate={{ scale: 1, opacity: 1, x: 0 }}
					exit={{ scale: 0.7, opacity: 0, x: -4 }}
					transition={{ type: "spring", stiffness: 520, damping: 30 }}
					whileTap={{ scale: 0.95 }}
					onClick={() => deactivate(action.actionId, action.onToggle)}
					title="点击取消"
					className="group flex shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11.5px] font-medium text-primary transition-colors hover:bg-primary/15"
				>
					{action.icon && <span className="flex h-3 w-3 items-center justify-center">{action.icon}</span>}
					<span className="max-w-[120px] truncate">{action.label}</span>
					<span className="icon-[solar--close-circle-linear] h-3 w-3 opacity-50 transition-opacity group-hover:opacity-100" />
				</motion.button>
			))}
		</AnimatePresence>
	);
}
