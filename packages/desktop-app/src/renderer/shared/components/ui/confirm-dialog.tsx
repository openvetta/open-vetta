import { useAtom } from "jotai";
import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { confirmDialogAtom } from "../../store/atoms";
import { Button } from "./button";

export function ConfirmDialog(): JSX.Element | null {
	const [state, setState] = useAtom(confirmDialogAtom);
	const overlayRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!state) return;
		function handleKey(e: KeyboardEvent) {
			if (e.key === "Escape") setState(null);
		}
		document.addEventListener("keydown", handleKey);
		return () => document.removeEventListener("keydown", handleKey);
	}, [state, setState]);

	return (
		<AnimatePresence>
			{state && (
				<motion.div
					ref={overlayRef}
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.15 }}
					className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
					onClick={(e) => {
						if (e.target === overlayRef.current) setState(null);
					}}
				>
					<motion.div
						initial={{ opacity: 0, scale: 0.95 }}
						animate={{ opacity: 1, scale: 1 }}
						exit={{ opacity: 0, scale: 0.95 }}
						transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
						className="w-[360px] rounded-xl border border-border bg-popover p-5 shadow-xl"
					>
						<h3 className="text-[15px] font-semibold text-foreground">{state.title}</h3>
						<p className="mt-2 text-[13px] text-muted-foreground">{state.message}</p>
						<div className="mt-5 flex justify-end gap-2">
							<Button variant="ghost" size="sm" onClick={() => setState(null)}>
								{state.cancelLabel ?? "取消"}
							</Button>
							<Button
								variant={state.variant === "danger" ? "primary" : "primary"}
								size="sm"
								className={
									state.variant === "danger"
										? "bg-red-600 text-white hover:bg-red-700"
										: undefined
								}
								onClick={() => {
									state.onConfirm();
									setState(null);
								}}
							>
								{state.confirmLabel ?? "确认"}
							</Button>
						</div>
					</motion.div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
