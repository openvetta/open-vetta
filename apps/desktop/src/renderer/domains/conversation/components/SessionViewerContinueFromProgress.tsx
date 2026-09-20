import { cn } from "@shared/lib/utils";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	CONTINUE_FROM_PROGRESS_STEPS,
	continueFromProgressStepIndex,
} from "../hooks/continue-from-progress";

export function SessionViewerContinueFromProgress({ active }: { active: boolean }): JSX.Element | null {
	const { t } = useTranslation("chat");
	const reduceMotion = useReducedMotion();
	const stepIndex = useContinueFromProgressStep(active);
	if (!active) return null;

	return (
		<div
			className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 px-4 backdrop-blur-sm"
			role="status"
			aria-live="polite"
			aria-busy="true"
		>
			<motion.div
				initial={reduceMotion ? false : { opacity: 0, y: 8 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ type: "spring", stiffness: 300, damping: 26 }}
				className="w-full max-w-[280px] rounded-xl border border-border/50 bg-card/80 px-3.5 pt-3 pb-3"
			>
				<div className="flex items-center gap-2">
					<span
						className="icon-[solar--refresh-linear] h-4 w-4 shrink-0 animate-spin text-primary"
						aria-hidden="true"
					/>
					<p className="text-[13px] font-medium text-foreground">{t("sessionViewer.continueFrom.progress.title")}</p>
				</div>
				<p className="mt-1 text-[12px] text-muted-foreground">{t("sessionViewer.continueFrom.progress.hint")}</p>
				<ol className="mt-3 flex flex-col gap-2">
					{CONTINUE_FROM_PROGRESS_STEPS.map((step, index) => {
						const done = index < stepIndex;
						const current = index === stepIndex;
						return (
							<li
								key={step}
								className={cn(
									"flex items-center gap-2 text-[12px]",
									current ? "text-foreground" : "text-muted-foreground",
								)}
								aria-current={current ? "step" : undefined}
							>
								{done ? (
									<span
										className="icon-[solar--check-circle-linear] h-3.5 w-3.5 shrink-0 text-primary"
										aria-hidden="true"
									/>
								) : current ? (
									<span
										className="icon-[solar--refresh-linear] h-3.5 w-3.5 shrink-0 animate-spin text-primary"
										aria-hidden="true"
									/>
								) : (
									<span className="h-3.5 w-3.5 shrink-0 rounded-full border border-border/70" aria-hidden="true" />
								)}
								{t(`sessionViewer.continueFrom.progress.${step}`)}
							</li>
						);
					})}
				</ol>
			</motion.div>
		</div>
	);
}

function useContinueFromProgressStep(active: boolean): number {
	const [elapsedMs, setElapsedMs] = useState(0);
	useEffect(() => {
		if (!active) {
			setElapsedMs(0);
			return;
		}
		const startedAt = Date.now();
		const id = window.setInterval(() => setElapsedMs(Date.now() - startedAt), 200);
		return () => window.clearInterval(id);
	}, [active]);
	return continueFromProgressStepIndex(elapsedMs);
}
