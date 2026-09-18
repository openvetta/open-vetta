import { grokSessionImportEnabledAtom, grokSessionsDirectoryAtom } from "@shared/store/atoms";
import { useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { recordSettingsUsage } from "./recordSettingsUsage";

export interface ExternalSessionImportSettingsModel {
	actions: {
		specifyGrokSessionDir: () => Promise<void>;
		toggleGrokEnabled: (checked: boolean) => void;
	};
	canSpecifyGrokPath: boolean;
	grokDisplayPath?: string;
	grokEnabled: boolean;
	labels: {
		description: string;
		grok: string;
		pathDescription: string;
		specifyPath: string;
		title: string;
	};
	loading: boolean;
}

export function useExternalSessionImportSettingsModel(): ExternalSessionImportSettingsModel {
	const { t } = useTranslation("settings");
	const setGrokSessionImportEnabled = useSetAtom(grokSessionImportEnabledAtom);
	const setGrokSessionsDirectory = useSetAtom(grokSessionsDirectoryAtom);
	const [grokEnabled, setGrokEnabled] = useState(false);
	const [detectedPath, setDetectedPath] = useState<string | undefined>();
	const [manualPath, setManualPath] = useState<string | undefined>();
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		void window.vetta.config.get().then((config) => {
			const enabled = config.sessionImport?.grokEnabled === true;
			setGrokEnabled(enabled);
			setGrokSessionImportEnabled(enabled);
			setDetectedPath(config.grokSessionsDirectory);
			setManualPath(config.sessionImport?.grokSessionDir);
			setGrokSessionsDirectory(config.grokSessionsDirectory ?? config.sessionImport?.grokSessionDir ?? "");
			setLoading(false);
		});
	}, [setGrokSessionImportEnabled, setGrokSessionsDirectory]);

	const toggleGrokEnabled = useCallback(
		(checked: boolean) => {
			setGrokEnabled(checked);
			setGrokSessionImportEnabled(checked);
			void window.vetta.config.set({ sessionImport: { grokEnabled: checked } });
			recordSettingsUsage({ tab: "agent", action: checked ? "enabled" : "disabled", target: "grok-session-import" });
		},
		[setGrokSessionImportEnabled],
	);

	const specifyGrokSessionDir = useCallback(async () => {
		const selected = await window.vetta.dialog.selectFolder();
		if (!selected) return;
		setManualPath(selected);
		setGrokSessionsDirectory(selected);
		void window.vetta.config.set({ sessionImport: { grokSessionDir: selected } });
		recordSettingsUsage({ tab: "agent", action: "selected", target: "grok-session-dir" });
	}, [setGrokSessionsDirectory]);

	const grokDisplayPath = detectedPath ?? manualPath;
	const canSpecifyGrokPath = !loading && !detectedPath;

	const labels = useMemo(() => {
		const pathDescription = loading
			? t("agentSettings.sessionImport.loading")
			: detectedPath
				? t("agentSettings.sessionImport.detectedPath", { path: detectedPath })
				: grokDisplayPath
					? t("agentSettings.sessionImport.manualPath", { path: grokDisplayPath })
					: t("agentSettings.sessionImport.notDetected");
		return {
			description: t("agentSettings.sessionImport.description"),
			grok: t("agentSettings.sessionImport.grok"),
			pathDescription,
			specifyPath: t("agentSettings.sessionImport.specifyPath"),
			title: t("section_agent-session-import"),
		};
	}, [detectedPath, grokDisplayPath, loading, t]);

	return {
		actions: {
			specifyGrokSessionDir,
			toggleGrokEnabled,
		},
		canSpecifyGrokPath,
		grokDisplayPath,
		grokEnabled,
		labels,
		loading,
	};
}
