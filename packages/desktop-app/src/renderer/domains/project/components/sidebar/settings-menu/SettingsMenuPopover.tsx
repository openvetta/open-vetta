import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { SettingsMenuSettingsItem } from "@vetta/theme-ui/sidebar";
import { PopoverContent } from "@shared/components/ui/popover";
import type { SettingsMenuModel } from "./types";
import { SettingsMenuAccountSection } from "./SettingsMenuAccountSection";
import { SettingsMenuDivider } from "./SettingsMenuDivider";
import { SettingsMenuDownloadsItem } from "./SettingsMenuDownloadsItem";
import { SettingsMenuQuotaSection } from "./SettingsMenuQuotaSection";
import { SettingsMenuThemeSection } from "./SettingsMenuThemeSection";

interface SettingsMenuPopoverProps {
	model: SettingsMenuModel;
}

const itemVariants = {
	hidden: { opacity: 0, x: -12 },
	show: { opacity: 1, x: 0 },
};

const dividerVariants = {
	hidden: { opacity: 0, scaleX: 0.9 },
	show: { opacity: 1, scaleX: 1 },
};

export function SettingsMenuPopover({ model }: SettingsMenuPopoverProps): JSX.Element {
	return (
		<PopoverContent
			forceMount
			asChild
			side="top"
			align="start"
			sideOffset={6}
			className="w-[180px] gap-0 overflow-hidden rounded-lg border border-border p-1"
			style={{ animation: "none" }}
		>
			<motion.div
				initial={{ opacity: 0, scale: 0.96, y: 8 }}
				animate={{ opacity: 1, scale: 1, y: 0 }}
				exit={{ opacity: 0, scale: 0.96, y: 8 }}
				transition={{ duration: 0.1, ease: [0.16, 1, 0.3, 1] }}
			>
				<motion.div
					variants={{
						hidden: {},
						show: { transition: { staggerChildren: 0.025, delayChildren: 0.02 } },
					}}
					initial="hidden"
					animate="show"
				>
					<motion.div variants={itemVariants}>
						<SettingsMenuThemeSection model={model} />
					</motion.div>
					<SettingsMenuQuotaSection
						dividerVariants={dividerVariants}
						itemVariants={itemVariants}
						model={model}
					/>
					<motion.div variants={dividerVariants}>
						<SettingsMenuDivider />
					</motion.div>
					<motion.div variants={itemVariants}>
						<SettingsMenuAccountSection model={model} />
					</motion.div>
					<motion.div variants={dividerVariants}>
						<SettingsMenuDivider />
					</motion.div>
					<motion.div variants={itemVariants}>
						<SettingsMenuDownloadsItem model={model} />
					</motion.div>
					<motion.div variants={itemVariants}>
						<SettingsMenuSettingsItemHost model={model} />
					</motion.div>
				</motion.div>
			</motion.div>
		</PopoverContent>
	);
}

function SettingsMenuSettingsItemHost({ model }: { model: SettingsMenuModel }): JSX.Element {
	const { t } = useTranslation("settings");
	return (
		<SettingsMenuSettingsItem label={t("sidebar.settings")} onOpenSettings={model.actions.openSettings} />
	);
}
