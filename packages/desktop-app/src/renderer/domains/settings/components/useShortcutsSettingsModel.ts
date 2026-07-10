import {
	getEffectiveShortcut,
	loadShortcuts,
	SHORTCUT_ACTIONS,
	type ShortcutMap,
	saveShortcuts,
} from "@shared/lib/shortcuts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { recordSettingsUsage } from "./recordSettingsUsage";

export type QuickPanelBehavior = "foreground" | "background";
export type QuickPanelTrigger = "none" | "mod" | "alt" | "shift";

export interface ShortcutActionItem {
	id: string;
	label: string;
	description: string;
	effectiveShortcut: string;
	isDefault: boolean;
}

export interface QuickPanelOption {
	value: QuickPanelTrigger | QuickPanelBehavior;
	label: string;
}

export interface ShortcutsSettingsModel {
	title: string;
	resetAllLabel: string;
	shortcutHint: string;
	shortcutPlaceholder: string;
	resetLabel: string;
	shortcutActions: ShortcutActionItem[];
	quickPanel: {
		trigger: QuickPanelTrigger;
		behavior: QuickPanelBehavior;
		triggerTitle: string;
		triggerDescription: string;
		behaviorTitle: string;
		behaviorDescription: string;
		triggerOptions: QuickPanelOption[];
		behaviorOptions: QuickPanelOption[];
		behaviorDisabled: boolean;
	};
	onShortcutChange: (actionId: string, shortcut: string) => void;
	onShortcutReset: (actionId: string) => void;
	onResetAll: () => void;
	onQuickPanelTriggerChange: (trigger: QuickPanelTrigger) => void;
	onQuickPanelBehaviorChange: (behavior: QuickPanelBehavior) => void;
}

export function useShortcutsSettingsModel(): ShortcutsSettingsModel {
	const { t } = useTranslation("settings");
	const [customShortcuts, setCustomShortcuts] = useState<ShortcutMap>(loadShortcuts);
	const [trigger, setTrigger] = useState<QuickPanelTrigger>("none");
	const [behavior, setBehavior] = useState<QuickPanelBehavior>("foreground");

	const isMac = navigator.platform.toUpperCase().includes("MAC");
	const modGlyph = isMac ? "⌘" : "Ctrl";
	const altGlyph = isMac ? "⌥" : "Alt";

	useEffect(() => {
		void window.vetta.config.get().then((config) => {
			const qp = config.quickPanel;
			setTrigger(qp?.trigger === "mod" || qp?.trigger === "alt" || qp?.trigger === "shift" ? qp.trigger : "none");
			setBehavior(qp?.postSendBehavior === "background" ? "background" : "foreground");
		});
	}, []);

	const persistQuickPanel = useCallback(
		async (patch: { trigger?: QuickPanelTrigger; postSendBehavior?: QuickPanelBehavior }) => {
			await window.vetta.config.set({ quickPanel: patch });
			await window.vetta.quickPanel.reloadHotkey();
		},
		[],
	);

	const handleShortcutChange = useCallback((actionId: string, shortcut: string) => {
		setCustomShortcuts((prev) => {
			const next = { ...prev, [actionId]: shortcut };
			saveShortcuts(next);
			return next;
		});
		recordSettingsUsage({ tab: "shortcuts", action: "changed", target: "shortcut" });
	}, []);

	const handleShortcutReset = useCallback((actionId: string) => {
		setCustomShortcuts((prev) => {
			const next = { ...prev };
			delete next[actionId];
			saveShortcuts(next);
			return next;
		});
		recordSettingsUsage({ tab: "shortcuts", action: "reset", target: "shortcut" });
	}, []);

	const handleResetAll = useCallback(() => {
		setCustomShortcuts({});
		saveShortcuts({});
		recordSettingsUsage({ tab: "shortcuts", action: "reset", target: "all-shortcuts" });
	}, []);

	const handleTriggerChange = useCallback(
		(value: QuickPanelTrigger) => {
			setTrigger(value);
			void persistQuickPanel({ trigger: value });
			recordSettingsUsage({ tab: "shortcuts", action: "changed", target: "quick-panel-trigger", value });
		},
		[persistQuickPanel],
	);

	const handleBehaviorChange = useCallback(
		(value: QuickPanelBehavior) => {
			setBehavior(value);
			void persistQuickPanel({ postSendBehavior: value });
			recordSettingsUsage({ tab: "shortcuts", action: "changed", target: "quick-panel-behavior", value });
		},
		[persistQuickPanel],
	);

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

	const triggerDescription =
		trigger !== "none" && isMac ? t("quickPanelTriggerHintMac") : t("quickPanelTriggerDescription");

	return {
		title: t("shortcuts"),
		resetAllLabel: t("resetAllShortcuts"),
		shortcutHint: t("shortcutHint"),
		shortcutPlaceholder: t("shortcutPlaceholder"),
		resetLabel: t("reset"),
		shortcutActions,
		quickPanel: {
			trigger,
			behavior,
			triggerTitle: t("quickPanelTrigger"),
			triggerDescription,
			behaviorTitle: t("quickPanelBehavior"),
			behaviorDescription: t("quickPanelBehaviorDescription"),
			triggerOptions: [
				{ value: "none", label: t("quickPanelTriggerNone") },
				{ value: "mod", label: t("quickPanelTriggerDoubleTap", { key: modGlyph }) },
				{ value: "alt", label: t("quickPanelTriggerDoubleTap", { key: altGlyph }) },
				{ value: "shift", label: t("quickPanelTriggerDoubleTap", { key: "⇧" }) },
			],
			behaviorOptions: [
				{ value: "foreground", label: t("quickPanelBehaviorForeground") },
				{ value: "background", label: t("quickPanelBehaviorBackground") },
			],
			behaviorDisabled: trigger === "none",
		},
		onShortcutChange: handleShortcutChange,
		onShortcutReset: handleShortcutReset,
		onResetAll: handleResetAll,
		onQuickPanelTriggerChange: handleTriggerChange,
		onQuickPanelBehaviorChange: handleBehaviorChange,
	};
}
