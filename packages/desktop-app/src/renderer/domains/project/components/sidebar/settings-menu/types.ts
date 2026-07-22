import type { AgentMode, ThemeMode } from "@shared/store/atoms";

export interface SettingsMenuThemeOption {
	icon: string;
	label: string;
	value: ThemeMode;
}

export interface SettingsMenuAgentModeOption {
	value: AgentMode;
	label: string;
}

export interface SettingsMenuModel {
	activeDownloads: number;
	fiveHourRemainingPercent: number;
	fiveHourResetAt?: string;
	goBadgeColor?: string;
	goBadgeText?: string;
	goEnabled: boolean;
	mode: ThemeMode;
	/** 当前工作模式（agent_mode 轴，见 ADR-0046）。 */
	agentMode: AgentMode;
	/** 当前工作模式的展示文案（badge/toggle 用）。 */
	agentModeLabel: string;
	/** 工作模式切换选项（Work/Coding）。 */
	agentModeOptions: SettingsMenuAgentModeOption[];
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
		setAgentMode(mode: AgentMode): void;
		setOpen(open: boolean): void;
	};
}
