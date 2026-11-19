import { useImOnline } from "@shared/hooks/useImOnline";
import { useThemeActions } from "@shared/hooks/useTheme";
import { type ThemeMode, themeModeAtom } from "@shared/store/atoms";
import { useNavigate } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import type { SettingsMenuModel, SettingsMenuThemeOption } from "./types";

export function useSettingsMenuModel(open: boolean, setOpen: (open: boolean) => void): SettingsMenuModel {
	const { t } = useTranslation("settings");
	const { t: tProject } = useTranslation("project");
	const mode = useAtomValue(themeModeAtom);
	const { setMode } = useThemeActions();
	const navigate = useNavigate();
	const clawOnline = useImOnline();

	const themeOptions: SettingsMenuThemeOption[] = [
		{ value: "light", label: t("theme.light"), icon: "icon-[solar--sun-linear]" },
		{ value: "dark", label: t("theme.dark"), icon: "icon-[solar--moon-linear]" },
		{ value: "auto", label: t("theme.system"), icon: "icon-[solar--laptop-linear]" },
	];

	return {
		mode,
		clawOnline,
		clawTitle: tProject("sidebar.clawConnected"),
		open,
		themeOptions,
		actions: {
			openSettings: () => {
				setOpen(false);
				void navigate({ to: "/settings/$tab", params: { tab: "general" } });
			},
			setMode: (nextMode: ThemeMode, event: MouseEvent<HTMLButtonElement>) => {
				void setMode(nextMode, {
					x: event.clientX,
					y: event.clientY,
				});
			},
			setOpen,
		},
	};
}

/**
 * 打开设置菜单时顺带补一次更新检查：这是用户最可能注意到「有新版本」的时机，
 * 也是长期不退出应用的用户与周期性重查之外的第二条同步入口。节流与忙碌判断
 * 都在主进程（见 UpdaterService.syncInBackground），这里不做 UI 忙碌态。
 */
export function useSyncUpdateOnOpen(): (open: boolean) => void {
	return (open: boolean): void => {
		if (!open) return;
		void window.vetta.updater.sync().catch(console.error);
	};
}
