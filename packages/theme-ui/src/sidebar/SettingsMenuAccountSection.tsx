import type { JSX } from "react";
import { SettingsMenuActionButton } from "./SettingsMenuActionButton";

export interface SettingsMenuAccountSectionProps {
	loggedIn: boolean;
	loginLabel: string;
	logoutLabel: string;
	onLogin: () => void;
	onLogout: () => void;
}

export function SettingsMenuAccountSection({
	loggedIn,
	loginLabel,
	logoutLabel,
	onLogin,
	onLogout,
}: SettingsMenuAccountSectionProps): JSX.Element {
	if (loggedIn) {
		return (
			<SettingsMenuActionButton icon="icon-[solar--logout-2-linear]" onClick={onLogout}>
				{logoutLabel}
			</SettingsMenuActionButton>
		);
	}

	return (
		<SettingsMenuActionButton icon="icon-[solar--login-2-linear]" onClick={onLogin}>
			{loginLabel}
		</SettingsMenuActionButton>
	);
}
