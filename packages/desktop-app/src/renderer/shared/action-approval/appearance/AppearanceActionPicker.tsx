import type { CursorStyle } from "@shared/theme/cursor";
import { THEMES } from "@shared/theme/themes";
import {
	AppearanceActionPickerView,
	type AppearanceCursorOption,
	type AppearanceModeOption,
	type AppearanceThemeMode,
	type AppearanceThemePreview,
} from "@vetta/theme-ui/action-approval";

const MODES: AppearanceModeOption[] = [
	{ value: "light", label: "浅色", icon: "icon-[mdi--white-balance-sunny]", hint: "始终浅色" },
	{ value: "dark", label: "深色", icon: "icon-[mdi--moon-waning-crescent]", hint: "始终深色" },
	{ value: "auto", label: "跟随系统", icon: "icon-[mdi--theme-light-dark]", hint: "自动切换" },
];

const CURSORS: AppearanceCursorOption[] = [
	{
		value: "default",
		label: "默认指针",
		hint: "系统原生鼠标指针",
		icon: "icon-[mdi--cursor-default-outline]",
	},
	{
		value: "stoat",
		label: "白鼬",
		hint: "自定义白鼬指针",
		preview: "/cursors/default.png",
	},
];

const THEME_PREVIEWS: AppearanceThemePreview[] = THEMES.map((theme) => ({
	id: theme.id,
	label: theme.label,
	dark: {
		primary: theme.dark.primary,
		accent: theme.dark.accent,
		ring: theme.dark.ring,
		chart1: theme.dark.chart1,
		chart2: theme.dark.chart2,
		background: theme.dark.background,
		card: theme.dark.card,
		border: theme.dark.border,
		destructive: theme.dark.destructive,
		foreground: theme.dark.foreground,
		mutedForeground: theme.dark.mutedForeground,
	},
}));

const LABELS = {
	modeSection: "显示模式",
	themeSection: "主题风格",
	cursorSection: "鼠标指针",
};

export function AppearanceActionPicker({
	mode,
	themeId,
	cursorStyle,
	onModeChange,
	onThemeChange,
	onCursorStyleChange,
}: {
	mode: AppearanceThemeMode;
	themeId: string;
	cursorStyle: CursorStyle;
	onModeChange: (mode: AppearanceThemeMode) => void;
	onThemeChange: (themeId: string) => void;
	onCursorStyleChange: (style: CursorStyle) => void;
}): JSX.Element {
	return (
		<AppearanceActionPickerView
			mode={mode}
			themeId={themeId}
			cursorStyle={cursorStyle}
			themes={THEME_PREVIEWS}
			modes={MODES}
			cursors={CURSORS}
			labels={LABELS}
			onModeChange={onModeChange}
			onThemeChange={onThemeChange}
			onCursorStyleChange={(style) => onCursorStyleChange(style as CursorStyle)}
		/>
	);
}
