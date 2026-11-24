import { eventToShortcut } from "@shared/lib/platform";
import {
	getEffectiveShortcut,
	loadShortcutBindings,
	type ShortcutBindings,
	saveShortcutBindings,
} from "@shared/lib/shortcuts";
import { commandMenuOpenAtom } from "@shared/store/atoms";
import type { LauncherSettingsViewProps } from "@vetta-org/theme-ui/settings";
import { useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { SETTINGS_SECTION } from "../registry";
import { recordSettingsUsage } from "./recordSettingsUsage";

const LAUNCHER_ACTION_ID = "open-command-menu";

export type LauncherSettingsModel = LauncherSettingsViewProps;

/**
 * 设置 → 启动器：⌘T 面板的介绍页兼改键入口。
 *
 * 快捷键与「快捷键」页共用同一份绑定（open-command-menu），两边改哪边都即时同步。
 */
export function useLauncherSettingsModel(): LauncherSettingsModel {
	const { t } = useTranslation("settings");
	const { t: tCommon } = useTranslation("common");
	const setLauncherOpen = useSetAtom(commandMenuOpenAtom);
	const [bindings, setBindings] = useState<ShortcutBindings>({});

	useEffect(() => {
		let active = true;
		void loadShortcutBindings().then((next) => {
			if (active) setBindings(next);
		});
		const unsubscribe = window.vetta.config.onShortcutsChanged((event) => {
			setBindings(event.bindings ?? {});
		});
		return () => {
			active = false;
			unsubscribe();
		};
	}, []);

	const onShortcutChange = useCallback((shortcut: string) => {
		setBindings((prev) => {
			const next = { ...prev, [LAUNCHER_ACTION_ID]: shortcut };
			void saveShortcutBindings(next);
			return next;
		});
		recordSettingsUsage({ tab: "shortcuts", action: "changed", target: "launcher-shortcut" });
	}, []);

	const onShortcutReset = useCallback(() => {
		setBindings((prev) => {
			const next = { ...prev };
			delete next[LAUNCHER_ACTION_ID];
			void saveShortcutBindings(next);
			return next;
		});
		recordSettingsUsage({ tab: "shortcuts", action: "reset", target: "launcher-shortcut" });
	}, []);

	const labels = useMemo(
		() => ({
			title: t("launcher.title"),
			subtitle: t("launcher.subtitle"),
			pressBefore: t("launcher.pressBefore"),
			pressAfter: t("launcher.pressAfter"),
			tryNow: t("launcher.tryNow"),
			previewPlaceholder: tCommon("commandMenu.placeholder"),
			previewNewSession: tCommon("commandMenu.newSession"),
			previewOpen: tCommon("commandMenu.hintSelect"),
			previewClose: tCommon("commandMenu.hintClose"),
			// 预览与真实面板共用文案，改一处两边一致。
			status: {
				waiting: tCommon("commandMenu.sessionStatus.waiting"),
				running: tCommon("commandMenu.sessionStatus.running"),
				unread: tCommon("commandMenu.sessionStatus.unread"),
			},
			featuresTitle: t("section_launcher-features"),
			shortcutSectionTitle: t("section_launcher-shortcut"),
			shortcutTitle: t("launcher.shortcutTitle"),
			shortcutDescription: t("launcher.shortcutDescription"),
			shortcutPlaceholder: t("shortcutPlaceholder"),
			resetLabel: t("reset"),
			sidebarHint: t("launcher.sidebarHint"),
		}),
		[t, tCommon],
	);

	const previewGroups = useMemo(
		() => [
			{
				label: tCommon("commandMenu.groups.activeSessions"),
				rows: [
					{
						icon: "icon-[solar--chat-round-line-linear]",
						title: t("launcher.preview.waitingSession"),
						meta: t("launcher.preview.waitingMeta"),
						status: "waiting" as const,
					},
					{
						icon: "icon-[solar--chat-round-line-linear]",
						title: t("launcher.preview.runningSession"),
						meta: t("launcher.preview.runningMeta"),
						status: "running" as const,
					},
				],
			},
			{
				label: tCommon("commandMenu.groups.recentSessions"),
				rows: [
					{
						icon: "icon-[solar--folder-linear]",
						title: t("launcher.preview.recentProject"),
						meta: t("launcher.preview.recentMeta"),
					},
				],
			},
		],
		[t, tCommon],
	);

	const features = useMemo(
		() => [
			{
				icon: "icon-[solar--bolt-linear]",
				title: t("launcher.features.active.title"),
				description: t("launcher.features.active.description"),
			},
			{
				icon: "icon-[solar--magnifer-linear]",
				title: t("launcher.features.search.title"),
				description: t("launcher.features.search.description"),
			},
			{
				icon: "icon-[solar--pen-new-square-linear]",
				title: t("launcher.features.newSession.title"),
				description: t("launcher.features.newSession.description"),
			},
			{
				icon: "icon-[solar--widget-add-linear]",
				title: t("launcher.features.plugins.title"),
				description: t("launcher.features.plugins.description"),
			},
		],
		[t],
	);

	return {
		labels,
		previewGroups,
		features,
		featuresSection: SETTINGS_SECTION["launcher-features"],
		shortcutSection: SETTINGS_SECTION["launcher-shortcut"],
		shortcut: getEffectiveShortcut(LAUNCHER_ACTION_ID, bindings),
		shortcutIsDefault: !bindings[LAUNCHER_ACTION_ID],
		onShortcutChange,
		onShortcutReset,
		eventToShortcut,
		onOpenLauncher: () => setLauncherOpen(true),
	};
}
