import { useTranslation } from "react-i18next";
import type { SettingsMenuModel } from "./types";
import { SettingsMenuActionButton } from "./SettingsMenuActionButton";

interface SettingsMenuDownloadsItemProps {
	model: SettingsMenuModel;
}

export function SettingsMenuDownloadsItem({ model }: SettingsMenuDownloadsItemProps): JSX.Element {
	const { t } = useTranslation("settings");

	return (
		<SettingsMenuActionButton
			icon="icon-[solar--download-linear]"
			onClick={model.actions.openDownloads}
		>
			{t("sidebar.downloadManagement")}
			{model.activeDownloads > 0 && (
				<span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
					{model.activeDownloads}
				</span>
			)}
		</SettingsMenuActionButton>
	);
}
