import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { useTranslation } from "react-i18next";
import { UserAvatar } from "@shared/components/UserAvatar";
import { SettingsMenuTriggerView } from "@vetta/theme-ui/sidebar";
import type { SettingsMenuModel } from "./types";

export interface SettingsMenuTriggerProps extends ComponentPropsWithoutRef<"button"> {
	model: SettingsMenuModel;
}

export const SettingsMenuTrigger = forwardRef<HTMLButtonElement, SettingsMenuTriggerProps>(
	function SettingsMenuTrigger({ model, className, ...props }, ref): JSX.Element {
		const { t } = useTranslation("settings");
		const userLabel = model.user?.nickname || model.user?.username;

		return (
			<SettingsMenuTriggerView
				ref={ref}
				className={className}
				open={model.open}
				userLabel={userLabel}
				settingsFallbackLabel={t("sidebar.settings")}
				goEnabled={model.goEnabled}
				goBadgeColor={model.goBadgeColor}
				goBadgeText={model.goBadgeText || model.subscriptionTierName}
				goTitle={model.subscriptionTierName || "Vetta Go"}
				avatar={
					model.user ? (
						<UserAvatar
							avatar={model.user.avatar}
							nickname={model.user.nickname}
							username={model.user.username}
							className="h-4 w-4 shrink-0"
							textClassName="text-[9px]"
						/>
					) : undefined
				}
				{...props}
			/>
		);
	},
);
