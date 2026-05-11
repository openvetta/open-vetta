import { updaterRestartDialogOpenAtom, updaterStateAtom } from "@shared/store/atoms";
import { useAtom, useAtomValue } from "jotai";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";
import { Button } from "./ui/button";

export function UpdateRestartDialog(): JSX.Element {
	const [open, setOpen] = useAtom(updaterRestartDialogOpenAtom);
	const state = useAtomValue(updaterStateAtom);
	const overlayRef = useRef<HTMLDivElement>(null);

	const close = () => setOpen(false);

	useEffect(() => {
		if (!open) return;
		function handleKey(e: KeyboardEvent) {
			if (e.key === "Escape") close();
		}
		document.addEventListener("keydown", handleKey);
		return () => document.removeEventListener("keydown", handleKey);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open]);

	// 仅在 ready 阶段显示（其它状态切回时 hook 已经控制开关）
	const visible = open && state.phase === "ready";

	const handleInstall = () => {
		setOpen(false);
		void window.vetta.updater.install();
	};

	return (
		<AnimatePresence>
			{visible && (
				<motion.div
					ref={overlayRef}
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.15 }}
					className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
					onClick={(e) => {
						if (e.target === overlayRef.current) close();
					}}
				>
					<motion.div
						initial={{ opacity: 0, scale: 0.95 }}
						animate={{ opacity: 1, scale: 1 }}
						exit={{ opacity: 0, scale: 0.95 }}
						transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
						className="w-[420px] rounded-xl border border-border bg-popover p-5 shadow-xl"
					>
						<div className="flex items-center gap-2">
							<span className="icon-[mdi--download-circle-outline] h-5 w-5 text-primary" />
							<h3 className="text-[15px] font-semibold text-foreground">更新已就绪</h3>
						</div>
						<p className="mt-2 text-[12px] text-muted-foreground">
							新版本 {state.latestVersion} 已下载完成（当前 {state.currentVersion}）。
							立即重启 Vetta 以应用更新，或选择"稍后"，下次启动会再次提示。
						</p>
						{state.releaseNote && (
							<div className="mt-3 max-h-[40vh] overflow-auto rounded-lg border border-border bg-secondary/50 p-3">
								<p className="whitespace-pre-wrap break-words text-[12px] text-muted-foreground">
									{state.releaseNote}
								</p>
							</div>
						)}
						<div className="mt-5 flex justify-end gap-2">
							<Button variant="ghost" size="sm" onClick={close}>
								稍后
							</Button>
							<Button
								variant="default"
								size="sm"
								onClick={handleInstall}
								className="bg-primary text-primary-foreground hover:bg-primary/90"
							>
								立即重启
							</Button>
						</div>
					</motion.div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
