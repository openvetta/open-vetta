import type { Variants } from "motion/react";
import { SettingsMenuQuotaSection as ThemeSettingsMenuQuotaSection } from "@vetta/theme-ui/sidebar";
import { useTranslation } from "react-i18next";
import { getResetCountdown } from "@shared/lib/subscription-format";
import type { SettingsMenuModel } from "./types";

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
	if (!model.fiveHourResetAt) return null;

	const countdown = getResetCountdown(model.fiveHourResetAt, Date.now());

	return (
		<ThemeSettingsMenuQuotaSection
			dividerVariants={dividerVariants}
			itemVariants={itemVariants}
			fiveHourRemainingPercent={model.fiveHourRemainingPercent}
			resetCountdown={countdown ? t(countdown.key, countdown.params) : ""}
			quotaLabel={t("sidebar.fiveHourQuota")}
		/>
	);
}
