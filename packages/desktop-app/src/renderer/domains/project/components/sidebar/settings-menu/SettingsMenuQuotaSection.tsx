import { motion, type Variants } from "motion/react";
import { useTranslation } from "react-i18next";
import { cn } from "@shared/lib/utils";
import { formatResetCountdown } from "@shared/lib/subscription-format";
import type { SettingsMenuModel } from "./types";
import { SettingsMenuDivider } from "./SettingsMenuDivider";

interface SettingsMenuQuotaSectionProps {
	dividerVariants: Variants;
	itemVariants: Variants;
	model: SettingsMenuModel;
}

export function SettingsMenuQuotaSection({
	dividerVariants,
	itemVariants,
	model,
}: SettingsMenuQuotaSectionProps): JSX.Element | null {
	const { t } = useTranslation("settings");
	const showCredits = model.user && model.zenEnabled && (model.creditsBalance !== null || model.creditsUnlimited);
	const showQuota = Boolean(model.fiveHourResetAt);

	if (!showCredits && !showQuota) return null;

	return (
		<>
			{showCredits && (
				<motion.div key="credits" variants={itemVariants}>
					<SettingsMenuDivider />
					<div className="mx-2 my-1.5 flex items-center justify-between rounded-md bg-accent/50 px-2 py-1.5">
						<div className="flex items-center gap-1.5">
							<span className="icon-[solar--wallet-linear] h-3.5 w-3.5 text-muted-foreground" />
							<span className="text-[11px] text-muted-foreground">{t("sidebar.creditsRemaining")}</span>
						</div>
						{model.creditsUnlimited ? (
							<span className="text-[12px] font-semibold text-primary">
								{t("sidebar.creditsUnlimited")}
							</span>
						) : (
							<span
								className={cn(
									"text-[12px] font-semibold tabular-nums",
									(model.creditsBalance ?? 0) <= 0 ? "text-destructive" : "text-foreground",
								)}
							>
								{(model.creditsBalance ?? 0).toFixed(2)}
							</span>
						)}
					</div>
				</motion.div>
			)}
			{showQuota && (
				<motion.div key="quota" variants={itemVariants}>
					<motion.div variants={dividerVariants}>
						<SettingsMenuDivider />
					</motion.div>
					<div className="mx-2 my-1.5 rounded-md bg-accent/50 px-2 py-1.5">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-1.5">
								<span className="icon-[solar--hourglass-linear] h-3.5 w-3.5 text-muted-foreground" />
								<span className="text-[11px] text-muted-foreground">{t("sidebar.fiveHourQuota")}</span>
							</div>
							<span
								className={cn(
									"text-[11px] font-semibold tabular-nums",
									model.fiveHourRemainingPercent <= 0 ? "text-destructive" : "text-foreground",
								)}
							>
								{model.fiveHourRemainingPercent}%
							</span>
						</div>
						<div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-border">
							<div
								className="h-full rounded-full bg-primary/70 transition-all"
								style={{ width: `${model.fiveHourRemainingPercent}%` }}
							/>
						</div>
						<div className="mt-1 text-[10px] text-muted-foreground">
							{formatResetCountdown(model.fiveHourResetAt ?? "", Date.now())}
						</div>
					</div>
				</motion.div>
			)}
		</>
	);
}
