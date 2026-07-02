import { useTranslation } from "react-i18next";
import type { SettingsMenuModel } from "./types";
import { SettingsMenuActionButton } from "./SettingsMenuActionButton";

interface SettingsMenuAccountSectionProps {
	model: SettingsMenuModel;
}

export function SettingsMenuAccountSection({ model }: SettingsMenuAccountSectionProps): JSX.Element {
	const { t } = useTranslation("settings");

	if (model.user) {
		return (
			<SettingsMenuActionButton
				icon="icon-[solar--logout-2-linear]"
				onClick={model.actions.logout}
			>
				{t("sidebar.logout")}
			</SettingsMenuActionButton>
		);
	}

	return (
		<SettingsMenuActionButton
			icon="icon-[solar--login-2-linear]"
			onClick={model.actions.login}
		>
			{t("sidebar.login")}
		</SettingsMenuActionButton>
	);
}
