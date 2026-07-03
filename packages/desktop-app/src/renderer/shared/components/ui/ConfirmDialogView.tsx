import type { ConfirmDialogState } from "@shared/store/atoms";
import { ThemeSurface } from "@vetta/theme-ui/appearance";
import { AnimatePresence, motion } from "motion/react";
import { type RefObject } from "react";
import { Button } from "./button";

export interface ConfirmDialogViewLabels {
	readonly cancel: string;
	readonly confirm: string;
}

export interface ConfirmDialogViewProps {
	readonly labels: ConfirmDialogViewLabels;
	readonly onCancel: () => void;
	readonly onConfirm: () => void;
	readonly overlayRef: RefObject<HTMLDivElement | null>;
	readonly state: ConfirmDialogState | null;
}

export function ConfirmDialogView({
	labels,
	onCancel,
	onConfirm,
	overlayRef,
	state,
}: ConfirmDialogViewProps): JSX.Element {
	return (
		<AnimatePresence>
			{state && (
				<motion.div
					ref={overlayRef}
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.15 }}
					className="fixed inset-0 z-[100] flex items-center justify-center bg-background/70"
					onClick={(e) => {
						if (e.target === overlayRef.current) onCancel();
					}}
				>
					<motion.div
						initial={{ opacity: 0, scale: 0.95 }}
						animate={{ opacity: 1, scale: 1 }}
						exit={{ opacity: 0, scale: 0.95 }}
						transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
						className="relative w-[360px] rounded-xl border border-border bg-popover shadow-lg"
					>
						<ThemeSurface slot="root.confirmDialog.panel" />
						<div className="relative z-10 p-5">
							<h3 className="text-[15px] font-semibold text-foreground">{state.title}</h3>
							<p className="mt-2 max-h-[45vh] overflow-auto whitespace-pre-wrap break-words text-[13px] text-muted-foreground">
								{state.message}
							</p>
							<div className="mt-5 flex justify-end gap-2">
								<Button variant="ghost" size="sm" onClick={onCancel}>
									{state.cancelLabel ?? labels.cancel}
								</Button>
								<Button
									variant={state.variant === "danger" ? "destructive" : "primary"}
									size="sm"
									onClick={onConfirm}
								>
									{state.confirmLabel ?? labels.confirm}
								</Button>
							</div>
						</div>
					</motion.div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
