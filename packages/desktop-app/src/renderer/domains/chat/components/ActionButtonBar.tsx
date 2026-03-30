import { useAtomValue } from "jotai";
import { AnimatePresence, motion } from "motion/react";
import {
	visibleActionButtonsAtom,
	actionButtonHandlersAtom,
} from "@shared/store/atoms";

export function ActionButtonBar(): JSX.Element | null {
	const buttons = useAtomValue(visibleActionButtonsAtom);
	const handlers = useAtomValue(actionButtonHandlersAtom);

	if (buttons.length === 0) return null;

	return (
		<div className="flex flex-wrap gap-1.5 px-4 pt-3 pb-1">
			<AnimatePresence>
				{buttons.map((btn) => (
					<motion.button
						key={btn.id}
						type="button"
						initial={{ scale: 0.85, opacity: 0 }}
						animate={{ scale: 1, opacity: 1 }}
						exit={{ scale: 0.85, opacity: 0 }}
						transition={{
							duration: 0.15,
							ease: [0.25, 0.1, 0.25, 1],
						}}
						onClick={() => handlers.get(btn.id)?.()}
						className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary/50 px-2.5 py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					>
						{btn.icon && (
							<span className={`${btn.icon} h-3.5 w-3.5`} />
						)}
						<span>{btn.label}</span>
					</motion.button>
				))}
			</AnimatePresence>
		</div>
	);
}
