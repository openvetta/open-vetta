import type { ThemeMode } from "@shared/store/atoms";

export interface SettingsMenuThemeOption {
	icon: string;
	label: string;
	value: ThemeMode;
}

export interface SettingsMenuModel {
	activeDownloads: number;
	fiveHourRemainingPercent: number;
	fiveHourResetAt?: string;
	goBadgeColor?: string;
	goBadgeText?: string;
	goEnabled: boolean;
	mode: ThemeMode;
	open: boolean;
	subscriptionTierName?: string;
	themeOptions: SettingsMenuThemeOption[];
	user: {
		avatar?: string | null;
		nickname?: string | null;
		username?: string | null;
	} | null;
	actions: {
		login(): void;
		logout(): void;
		openDownloads(): void;
		openSettings(): void;
		setMode(mode: ThemeMode, event: React.MouseEvent<HTMLButtonElement>): void;
		setOpen(open: boolean): void;
	};
}
