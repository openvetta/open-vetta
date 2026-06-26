import { useAtomValue } from "jotai";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { lastTurnUsageAtom } from "@shared/store/atoms";

function formatDuration(seconds: number): string {
	if (seconds < 60) return `${seconds.toFixed(1)}s`;
	const m = Math.floor(seconds / 60);
	const s = Math.round(seconds % 60);
	return `${m}m${s}s`;
}

export function UsageBar(): JSX.Element | null {
	const { t } = useTranslation("chat");
	const turnUsage = useAtomValue(lastTurnUsageAtom);

	if (!turnUsage || (!turnUsage.outputSpeed && !turnUsage.durationSeconds)) return null;

	const parts: string[] = [];
	if (turnUsage.outputSpeed > 0) {
		parts.push(t("usageBar.speedLabel", { speed: turnUsage.outputSpeed.toFixed(1) }));
	}
	if (turnUsage.durationSeconds > 0) {
		parts.push(t("usageBar.durationLabel", { duration: formatDuration(turnUsage.durationSeconds) }));
	}

	return (
		<motion.div
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			transition={{ duration: 0.3 }}
			className="flex justify-start pl-7"
		>
			<div className="text-[11px] font-mono text-muted-foreground/50">
				{parts.join("  ·  ")}
			</div>
		</motion.div>
	);
}
