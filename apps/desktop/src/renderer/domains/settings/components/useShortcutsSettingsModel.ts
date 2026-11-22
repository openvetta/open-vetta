import {
	getEffectiveShortcut,
	loadShortcutBindings,
	SHORTCUT_ACTIONS,
	type ShortcutBindings,
	saveShortcutBindings,
} from "@shared/lib/shortcuts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { recordSettingsUsage } from "./recordSettingsUsage";

export interface ShortcutActionItem {
	id: string;
	label: string;
	description: string;
	effectiveShortcut: string;
	isDefault: boolean;
}

export interface ShortcutsSettingsModel {
	title: string;
	resetAllLabel: string;
	shortcutHint: string;
	shortcutPlaceholder: string;
	resetLabel: string;
	globalSectionTitle: string;
	shortcutActions: ShortcutActionItem[];
	onShortcutChange: (actionId: string, shortcut: string) => void;
	onShortcutReset: (actionId: string) => void;
	onResetAll: () => void;
}

export function useShortcutsSettingsModel(): ShortcutsSettingsModel {
	const { t } = useTranslation("settings");
	const [customShortcuts, setCustomShortcuts] = useState<ShortcutBindings>({});

	useEffect(() => {
		void loadShortcutBindings().then(setCustomShortcuts);
		const unsubShortcuts = window.vetta.config.onShortcutsChanged((event) => {
			setCustomShortcuts(event.bindings ?? {});
		});
		return unsubShortcuts;
	}, []);

	const handleShortcutChange = useCallback((actionId: string, shortcut: string) => {
		setCustomShortcuts((prev) => {
			const next = { ...prev, [actionId]: shortcut };
			void saveShortcutBindings(next);
			return next;
		});
		recordSettingsUsage({ tab: "shortcuts", action: "changed", target: "shortcut" });
	}, []);

	const handleShortcutReset = useCallback((actionId: string) => {
		setCustomShortcuts((prev) => {
			const next = { ...prev };
			delete next[actionId as keyof typeof next];
			void saveShortcutBindings(next);
			return next;
		});
		recordSettingsUsage({ tab: "shortcuts", action: "reset", target: "shortcut" });
	}, []);

	const handleResetAll = useCallback(() => {
		setCustomShortcuts({});
		void saveShortcutBindings({});
		recordSettingsUsage({ tab: "shortcuts", action: "reset", target: "all-shortcuts" });
	}, []);

	const shortcutActions = useMemo(
		() =>
			SHORTCUT_ACTIONS.map((action) => ({
				id: action.id,
				label: t(action.labelKey),
				description: t(action.descriptionKey),
				effectiveShortcut: getEffectiveShortcut(action.id, customShortcuts),
				isDefault: !customShortcuts[action.id],
			})),
		[customShortcuts, t],
	);

	return {
		title: t("shortcuts"),
		resetAllLabel: t("resetAllShortcuts"),
		shortcutHint: t("shortcutHint"),
		shortcutPlaceholder: t("shortcutPlaceholder"),
		resetLabel: t("reset"),
		globalSectionTitle: t("section_shortcuts-global"),
		shortcutActions,
		onShortcutChange: handleShortcutChange,
		onShortcutReset: handleShortcutReset,
		onResetAll: handleResetAll,
	};
}
