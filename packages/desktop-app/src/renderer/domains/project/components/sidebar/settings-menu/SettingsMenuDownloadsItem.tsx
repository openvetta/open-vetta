import { SettingsMenuDownloadsItem as ThemeSettingsMenuDownloadsItem } from "@vetta/theme-ui/sidebar";
import { useTranslation } from "react-i18next";
import type { SettingsMenuModel } from "./types";

interface SettingsMenuDownloadsItemProps {
	model: SettingsMenuModel;
}

export function SettingsMenuDownloadsItem({ model }: SettingsMenuDownloadsItemProps): JSX.Element {
	const { t } = useTranslation("settings");
	return (
		<ThemeSettingsMenuDownloadsItem
			label={t("sidebar.downloadManagement")}
			activeDownloads={model.activeDownloads}
			onOpenDownloads={model.actions.openDownloads}
		/>
	);
}
