import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { useTranslation } from "react-i18next";
import { SettingsMenuTriggerView } from "@vetta-org/theme-ui/sidebar/SettingsMenuTriggerView";
import type { SettingsMenuModel } from "./types";

export interface SettingsMenuTriggerProps extends ComponentPropsWithoutRef<"button"> {
	model: SettingsMenuModel;
}

export const SettingsMenuTrigger = forwardRef<HTMLButtonElement, SettingsMenuTriggerProps>(
	function SettingsMenuTrigger({ model, className, ...props }, ref): JSX.Element {
		const { t } = useTranslation("settings");

		return (
			<SettingsMenuTriggerView
				ref={ref}
				className={className}
				active={model.active}
				iconOnly
				settingsFallbackLabel={t("sidebar.settings")}
				clawOnline={model.clawOnline}
				clawTitle={model.clawTitle}
				{...props}
				onClick={(event) => {
					props.onClick?.(event);
					if (event.defaultPrevented) return;
					model.actions.openSettings();
				}}
			/>
		);
	},
);
