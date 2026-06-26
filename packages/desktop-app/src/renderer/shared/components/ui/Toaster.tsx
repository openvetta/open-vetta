import { useAtomValue } from "jotai";
import { AnimatePresence, motion } from "motion/react";
import { type ToastVariant, dismissToast, toastsAtom } from "../../store/toast-atoms";

const VARIANT_STYLES: Record<ToastVariant, { ring: string; icon: string; iconColor: string }> = {
	info: { ring: "ring-border", icon: "icon-[mdi--information-outline]", iconColor: "text-foreground/70" },
	success: { ring: "ring-emerald-500/30", icon: "icon-[mdi--check-circle-outline]", iconColor: "text-emerald-500" },
	warning: { ring: "ring-amber-500/30", icon: "icon-[mdi--alert-outline]", iconColor: "text-amber-500" },
	error: { ring: "ring-destructive/40", icon: "icon-[mdi--alert-circle-outline]", iconColor: "text-destructive" },
};

/**
 * Global toast host. Mount once at the app root (App.tsx). Renders the stack
 * from {@link toastsAtom}; push toasts imperatively via `showToast`.
 */
export function Toaster(): JSX.Element {
	const toasts = useAtomValue(toastsAtom);

	return (
		<div className="pointer-events-none fixed bottom-4 right-4 z-[200] flex w-[340px] flex-col gap-2">
			<AnimatePresence initial={false}>
				{toasts.map((toast) => {
					const style = VARIANT_STYLES[toast.variant];
					return (
						<motion.div
							key={toast.id}
							layout
							initial={{ opacity: 0, y: 16, scale: 0.96 }}
							animate={{ opacity: 1, y: 0, scale: 1 }}
							exit={{ opacity: 0, x: 24, scale: 0.96 }}
							transition={{ duration: 0.18, ease: [0.22, 0.61, 0.36, 1] }}
							className={`pointer-events-auto flex items-start gap-2.5 rounded-xl border border-border bg-popover px-3.5 py-3 shadow-xl ring-1 ring-inset ${style.ring}`}
						>
							<span className={`${style.icon} mt-0.5 h-4 w-4 shrink-0 ${style.iconColor}`} />
							<div className="min-w-0 flex-1">
								{toast.title && (
									<div className="text-[13px] font-medium text-foreground">{toast.title}</div>
								)}
								<div className="text-[12px] leading-[1.5] text-muted-foreground break-words">
									{toast.message}
								</div>
								{toast.action && (
									<button
										type="button"
										onClick={() => {
											toast.action?.onClick();
											dismissToast(toast.id);
										}}
										className="mt-1.5 text-[12px] font-medium text-primary transition-colors hover:text-primary/80"
									>
										{toast.action.label}
									</button>
								)}
							</div>
							<button
								type="button"
								onClick={() => dismissToast(toast.id)}
								className="shrink-0 text-muted-foreground/60 transition-colors hover:text-foreground"
								title="关闭"
							>
								<span className="icon-[mdi--close] h-3.5 w-3.5" />
							</button>
						</motion.div>
					);
				})}
			</AnimatePresence>
		</div>
	);
}
