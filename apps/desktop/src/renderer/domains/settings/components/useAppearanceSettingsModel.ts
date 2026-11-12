import { useAppIcon } from "@shared/hooks/useAppIcon";
import { useHeroOrnament } from "@shared/hooks/useHeroOrnament";
import { useLanguage } from "@shared/hooks/useLanguage";
import { useNewSessionTexture } from "@shared/hooks/useNewSessionTexture";
import { useTheme } from "@shared/hooks/useTheme";
import { useUiZoom } from "@shared/hooks/useUiZoom";
import type { ThemeMode } from "@shared/store/atoms";
import { NEW_SESSION_TEXTURE_CATALOG, type NewSessionTextureId } from "@shared/theme/new-session-texture";
import { ORNAMENT_CATALOG, type OrnamentId } from "@shared/theme/ornament";
import { useThemeRuntime } from "@shared/theme/runtime";
import { THEMES } from "@shared/theme/themes";
import type { ThemeDef } from "@shared/theme/tokens";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { APP_ICON_IDS, type AppIconId } from "@/shared/app-icon";
import { isAppearanceUiThemeEnabled } from "@/shared/feature-flags";
import type { LanguagePreference } from "@/shared/i18n/config";
import { UI_ZOOM_DEFAULT, UI_ZOOM_STEPS, uiZoomStepIndex } from "@/shared/ui-zoom";
import appIconCodingPreview from "../assets/app-icons/coding.png";
import appIconCookPreview from "../assets/app-icons/cook.png";
import appIconDefaultPreview from "../assets/app-icons/default.png";
import appIconDesignPreview from "../assets/app-icons/design.png";
import appIconGamePreview from "../assets/app-icons/game.png";
import appIconReadPreview from "../assets/app-icons/read.png";
import appIconSleepPreview from "../assets/app-icons/sleep.png";
import appIconSportPreview from "../assets/app-icons/sport.png";
import appIconStudyPreview from "../assets/app-icons/study.png";
import appIconTravelPreview from "../assets/app-icons/travel.png";
import appIconWorkPreview from "../assets/app-icons/work.png";
import defaultThemePreview from "../assets/default.webp";
import xianxiaThemePreview from "../assets/xianxia.webp";
import { SETTINGS_SECTION } from "../registry";
import { recordSettingsUsage } from "./recordSettingsUsage";

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
	value: LanguagePreference;
}

export interface AppearanceUiThemeOption {
	active: boolean;
	disabled: boolean;
	hint: string;
	id: string;
	label: string;
	preview: string;
	unavailable: boolean;
}

export interface AppearanceOrnamentOption {
	active: boolean;
	hint: string;
	id: OrnamentId;
	label: string;
	/** 静态预览图；「无」没有预览，卡片改画空插槽。 */
	preview?: string;
}

export interface AppearanceTextureOption {
	active: boolean;
	hint: string;
	id: NewSessionTextureId;
	label: string;
}

export interface AppearanceAppIconOption {
	active: boolean;
	id: AppIconId;
	label: string;
	preview: string;
}

export interface AppearanceSettingsModel {
	actions: {
		changeLanguage: (language: LanguagePreference) => void;
		changeMode: (mode: ThemeMode, point: AppearancePoint) => void;
		changeThemeName: (id: string, point: AppearancePoint) => void;
		setAppIcon: (id: AppIconId) => void;
		selectUiTheme: (id: string) => void;
		setOrnament: (id: OrnamentId) => void;
		setTexture: (id: NewSessionTextureId) => void;
		setUiZoom: (factor: number) => void;
		resetUiZoom: () => void;
	};
	activeUiThemeId: string;
	appIconOptions: AppearanceAppIconOption[];
	labels: {
		/** 「新会话页装饰」这块合并区域的说明，点明装饰件与纹理只影响新会话页。 */
		newSessionDecorHint: string;
		newSessionDecorTitle: string;
		ornamentHint: string;
		sections: {
			appIcon: string;
			language: string;
			mode: string;
			ornament: string;
			texture: string;
			theme: string;
			uiTheme: string;
			uiZoom: string;
		};
		textureHint: string;
		uiZoomReset: string;
		uiZoomSliderLabel: string;
		title: string;
	};
	/** 用户语言偏好（含 system），用于选择器高亮。 */
	language: LanguagePreference;
	languages: AppearanceLanguageOption[];
	mode: ThemeMode;
	modeOptions: AppearanceModeOption[];
	ornamentId: OrnamentId;
	ornamentOptions: AppearanceOrnamentOption[];
	/** 是否展示「界面主题」区段（`VETTA_SHOW_UI_THEME=true`） */
	showUiTheme: boolean;
	textureId: NewSessionTextureId;
	textureOptions: AppearanceTextureOption[];
	themeName: string;
	themes: ThemeDef[];
	uiThemes: AppearanceUiThemeOption[];
	uiZoom: { default: number; factor: number; stepIndex: number; steps: readonly number[] };
}

type AppearanceSettingsActions = AppearanceSettingsModel["actions"];

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

/** 固定语言名（语种自称，非 UI chrome 文案）；system 项 label 由 i18n 注入。 */
const FIXED_LANGUAGE_OPTIONS: ReadonlyArray<{
	value: Exclude<LanguagePreference, "system">;
	native: string;
	alt: string;
}> = [
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

const APP_ICON_PREVIEWS: Record<AppIconId, string> = {
	default: appIconDefaultPreview,
	coding: appIconCodingPreview,
	design: appIconDesignPreview,
	work: appIconWorkPreview,
	study: appIconStudyPreview,
	read: appIconReadPreview,
	game: appIconGamePreview,
	sport: appIconSportPreview,
	cook: appIconCookPreview,
	travel: appIconTravelPreview,
	sleep: appIconSleepPreview,
};

const COLOR_THEME_LABEL_KEYS = {
	mono: "colorThemes.mono",
	default: "colorThemes.default",
	sand: "colorThemes.sand",
} as const;

export function useAppearanceSettingsModel(): AppearanceSettingsModel {
	const { mode, themeName, setMode, setThemeName } = useTheme();
	const { activeThemeId, availableThemes, selectTheme, status: themeRuntimeStatus } = useThemeRuntime();
	const { languagePreference, setLanguage } = useLanguage();
	const { factor: uiZoomFactor, setFactor: setUiZoomFactor, reset: resetUiZoom } = useUiZoom();
	const { ornamentId, setOrnament } = useHeroOrnament();
	const { textureId, setTexture } = useNewSessionTexture();
	const { iconId: appIconId, setIcon: setAppIcon } = useAppIcon();
	const { t } = useTranslation("settings");

	const languages = useMemo<AppearanceLanguageOption[]>(
		() => [
			{
				value: "system",
				native: t("languageSystem"),
				alt: t("languageSystemAlt"),
			},
			...FIXED_LANGUAGE_OPTIONS,
		],
		[t],
	);

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
					unavailable,
				};
			}),
		[activeThemeId, availableThemes, t, themeRuntimeStatus],
	);

	const appIconOptions = useMemo<AppearanceAppIconOption[]>(
		() =>
			APP_ICON_IDS.map((id) => ({
				id,
				active: appIconId === id,
				label: t(`appIcon_${id}`),
				preview: APP_ICON_PREVIEWS[id],
			})),
		[appIconId, t],
	);

	const ornamentOptions = useMemo<AppearanceOrnamentOption[]>(
		() =>
			ORNAMENT_CATALOG.map((entry) => ({
				id: entry.id,
				active: ornamentId === entry.id,
				label: t(entry.labelKey),
				hint: t(entry.hintKey),
				preview: entry.preview,
			})),
		[ornamentId, t],
	);

	const textureOptions = useMemo<AppearanceTextureOption[]>(
		() =>
			NEW_SESSION_TEXTURE_CATALOG.map((entry) => ({
				id: entry.id,
				active: textureId === entry.id,
				label: t(entry.labelKey),
				hint: t(entry.hintKey),
			})),
		[t, textureId],
	);

	const themes = useMemo(
		() =>
			THEMES.map((theme) => {
				const labelKey = COLOR_THEME_LABEL_KEYS[theme.id as keyof typeof COLOR_THEME_LABEL_KEYS];
				return {
					...theme,
					label: labelKey ? t(labelKey) : theme.label,
				};
			}),
		[t],
	);

	const labels = useMemo(
		() => ({
			newSessionDecorHint: t("newSessionDecorHint"),
			newSessionDecorTitle: t("newSessionDecorTitle"),
			ornamentHint: t("ornamentHint"),
			sections: {
				appIcon: t(SETTINGS_SECTION["appearance-app-icon"].titleKey),
				language: t(SETTINGS_SECTION["appearance-language"].titleKey),
				mode: t(SETTINGS_SECTION["appearance-mode"].titleKey),
				ornament: t(SETTINGS_SECTION["appearance-ornament"].titleKey),
				texture: t(SETTINGS_SECTION["appearance-texture"].titleKey),
				theme: t(SETTINGS_SECTION["appearance-theme"].titleKey),
				uiTheme: t(SETTINGS_SECTION["appearance-ui-theme"].titleKey),
				uiZoom: t(SETTINGS_SECTION["appearance-ui-zoom"].titleKey),
			},
			textureHint: t("textureHint"),
			uiZoomReset: t("uiZoomReset"),
			uiZoomSliderLabel: t("uiZoomSliderLabel"),
			title: t("appearanceTitle"),
		}),
		[t],
	);
	const actions = useMemo<AppearanceSettingsActions>(
		() => ({
			changeLanguage: (nextLanguage) => {
				void setLanguage(nextLanguage);
				recordSettingsUsage({ tab: "appearance", action: "changed", target: "language", value: nextLanguage });
			},
			changeMode: (nextMode, point) => {
				void setMode(nextMode, point);
				recordSettingsUsage({ tab: "appearance", action: "changed", target: "mode", value: nextMode });
			},
			changeThemeName: (id, point) => {
				setThemeName(id, point);
				recordSettingsUsage({ tab: "appearance", action: "changed", target: "color-theme", value: id });
			},
			setAppIcon: (id) => {
				setAppIcon(id);
				recordSettingsUsage({ tab: "appearance", action: "changed", target: "app-icon", value: id });
			},
			selectUiTheme: (id) => {
				void selectTheme(id);
				recordSettingsUsage({ tab: "appearance", action: "selected", target: "ui-theme", value: id });
			},
			setOrnament: (id) => {
				setOrnament(id);
				recordSettingsUsage({ tab: "appearance", action: "changed", target: "ornament", value: id });
			},
			setTexture: (id) => {
				setTexture(id);
				recordSettingsUsage({ tab: "appearance", action: "changed", target: "new-session-texture", value: id });
			},
			setUiZoom: (factor) => {
				setUiZoomFactor(factor);
			},
			resetUiZoom: () => {
				resetUiZoom();
				recordSettingsUsage({ tab: "appearance", action: "changed", target: "ui-zoom", value: "reset" });
			},
		}),
		[
			resetUiZoom,
			selectTheme,
			setAppIcon,
			setLanguage,
			setMode,
			setOrnament,
			setTexture,
			setThemeName,
			setUiZoomFactor,
		],
	);

	return {
		actions,
		activeUiThemeId: activeThemeId,
		appIconOptions,
		labels,
		language: languagePreference,
		languages,
		mode,
		modeOptions,
		ornamentId,
		ornamentOptions,
		showUiTheme: isAppearanceUiThemeEnabled(),
		textureId,
		textureOptions,
		themeName,
		themes,
		uiThemes,
		uiZoom: {
			default: UI_ZOOM_DEFAULT,
			factor: uiZoomFactor,
			stepIndex: uiZoomStepIndex(uiZoomFactor),
			steps: UI_ZOOM_STEPS,
		},
	};
}
