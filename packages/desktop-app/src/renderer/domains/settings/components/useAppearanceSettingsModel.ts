import { useCustomCursor } from "@shared/hooks/useCustomCursor";
import { useLanguage } from "@shared/hooks/useLanguage";
import { useNarrowScreen } from "@shared/hooks/useNarrowScreen";
import { useTheme } from "@shared/hooks/useTheme";
import type { ThemeMode } from "@shared/store/atoms";
import { useThemeRuntime } from "@shared/theme/runtime";
import { THEMES } from "@shared/theme/themes";
import type { ThemeDef } from "@shared/theme/tokens";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { AppLanguage } from "@/shared/i18n/config";
import defaultThemePreview from "../assets/default.webp";
import xianxiaThemePreview from "../assets/xianxia.webp";
import { SETTINGS_SECTION } from "../registry";

interface AppearancePoint {
	x: number;
	y: number;
}

export interface AppearanceModeOption {
	hint: string;
	icon: string;
	label: string;
	value: ThemeMode;
}

export interface AppearanceLanguageOption {
	alt: string;
	native: string;
	value: AppLanguage;
}

export interface AppearanceUiThemeOption {
	active: boolean;
	disabled: boolean;
	hint: string;
	id: string;
	label: string;
	preview: string;
}

export interface AppearanceSettingsModel {
	actions: {
		changeLanguage: (language: AppLanguage) => void;
		changeMode: (mode: ThemeMode, point: AppearancePoint) => void;
		changeThemeName: (id: string, point: AppearancePoint) => void;
		selectUiTheme: (id: string) => void;
		setCustomCursor: (enabled: boolean) => void;
	};
	activeUiThemeId: string;
	customCursor: boolean;
	labels: {
		cursorCustomHint: string;
		cursorCustomTitle: string;
		languageHint: string;
		sections: {
			cursor: string;
			language: string;
			mode: string;
			theme: string;
			uiTheme: string;
		};
		title: string;
	};
	language: AppLanguage;
	languages: AppearanceLanguageOption[];
	mode: ThemeMode;
	modeOptions: AppearanceModeOption[];
	narrow: boolean;
	themeName: string;
	themes: ThemeDef[];
	uiThemes: AppearanceUiThemeOption[];
}

const MODE_OPTIONS = [
	{
		value: "light",
		labelKey: "themeLight",
		icon: "icon-[mdi--white-balance-sunny]",
		hintKey: "appearanceLightHint",
	},
	{
		value: "dark",
		labelKey: "themeDark",
		icon: "icon-[mdi--moon-waning-crescent]",
		hintKey: "appearanceDarkHint",
	},
	{
		value: "auto",
		labelKey: "themeSystem",
		icon: "icon-[mdi--theme-light-dark]",
		hintKey: "appearanceAutoHint",
	},
] as const satisfies ReadonlyArray<{
	hintKey: "appearanceAutoHint" | "appearanceDarkHint" | "appearanceLightHint";
	icon: string;
	labelKey: "themeDark" | "themeLight" | "themeSystem";
	value: ThemeMode;
}>;

const LANGUAGE_OPTIONS: AppearanceLanguageOption[] = [
	{ value: "zh", native: "中文", alt: "Chinese" },
	{ value: "en", native: "English", alt: "英文" },
];

const UI_THEME_OPTIONS = [
	{
		id: "default",
		labelKey: "uiThemeDefault",
		hintKey: "uiThemeDefaultHint",
		preview: defaultThemePreview,
	},
	{
		id: "xianxia",
		labelKey: "uiThemeXianxia",
		hintKey: "uiThemeXianxiaHint",
		preview: xianxiaThemePreview,
	},
] as const;

export function useAppearanceSettingsModel(): AppearanceSettingsModel {
	const { mode, themeName, setMode, setThemeName } = useTheme();
	const { activeThemeId, availableThemes, selectTheme, status: themeRuntimeStatus } = useThemeRuntime();
	const { language, setLanguage } = useLanguage();
	const { enabled: customCursor, setEnabled: setCustomCursor } = useCustomCursor();
	const { t } = useTranslation("settings");
	const narrow = useNarrowScreen();

	const modeOptions = useMemo<AppearanceModeOption[]>(
		() =>
			MODE_OPTIONS.map((option) => ({
				value: option.value,
				label: t(option.labelKey),
				icon: option.icon,
				hint: t(option.hintKey),
			})),
		[t],
	);

	const uiThemes = useMemo<AppearanceUiThemeOption[]>(
		() =>
			UI_THEME_OPTIONS.map((theme) => {
				const unavailable =
					theme.id !== "default" &&
					themeRuntimeStatus !== "loading" &&
					!availableThemes.some((availableTheme) => availableTheme.id === theme.id);
				return {
					id: theme.id,
					active: activeThemeId === theme.id,
					disabled: themeRuntimeStatus === "loading" || unavailable,
					label: t(theme.labelKey),
					hint: unavailable ? t("uiThemeUnavailable") : t(theme.hintKey),
					preview: theme.preview,
				};
			}),
		[activeThemeId, availableThemes, t, themeRuntimeStatus],
	);

	const labels = useMemo(
		() => ({
			cursorCustomHint: t("cursorCustomHint"),
			cursorCustomTitle: t("cursorCustomTitle"),
			languageHint: t("languageHint"),
			sections: {
				cursor: t(SETTINGS_SECTION["appearance-cursor"].titleKey),
				language: t(SETTINGS_SECTION["appearance-language"].titleKey),
				mode: t(SETTINGS_SECTION["appearance-mode"].titleKey),
				theme: t(SETTINGS_SECTION["appearance-theme"].titleKey),
				uiTheme: t(SETTINGS_SECTION["appearance-ui-theme"].titleKey),
			},
			title: t("appearanceTitle"),
		}),
		[t],
	);

	return {
		actions: {
			changeLanguage: (nextLanguage) => {
				void setLanguage(nextLanguage);
			},
			changeMode: (nextMode, point) => {
				void setMode(nextMode, point);
			},
			changeThemeName: (id, point) => setThemeName(id, point),
			selectUiTheme: (id) => {
				void selectTheme(id);
			},
			setCustomCursor,
		},
		activeUiThemeId: activeThemeId,
		customCursor,
		labels,
		language,
		languages: LANGUAGE_OPTIONS,
		mode,
		modeOptions,
		narrow,
		themeName,
		themes: THEMES,
		uiThemes,
	};
}
