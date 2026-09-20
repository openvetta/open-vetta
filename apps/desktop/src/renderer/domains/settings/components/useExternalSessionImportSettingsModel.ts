import { grokSessionImportEnabledAtom, grokSessionsDirectoryAtom } from "@shared/store/atoms";
import { useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useTranslation } from "react-i18next";
import {
	firstEnabledSessionImportDirectory,
	isAnySessionImportEnabled,
	SESSION_IMPORT_TOOLS,
	type SessionImportDirKey,
	type SessionImportEnabledKey,
	type SessionImportToolId,
} from "../session-import-tools";
import { recordSettingsUsage } from "./recordSettingsUsage";

export interface ExternalSessionImportToolRow {
	id: SessionImportToolId;
	enabled: boolean;
	canSpecifyPath: boolean;
	displayPath?: string;
	labels: {
		name: string;
		pathDescription: string;
	};
}

export interface ExternalSessionImportSettingsModel {
	actions: {
		specifySessionDir: (id: SessionImportToolId) => Promise<void>;
		toggleEnabled: (id: SessionImportToolId, checked: boolean) => void;
		specifyGrokSessionDir: () => Promise<void>;
		toggleGrokEnabled: (checked: boolean) => void;
	};
	tools: ExternalSessionImportToolRow[];
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
	const [enabledByTool, setEnabledByTool] = useState<Record<string, boolean>>({});
	const [detectedByTool, setDetectedByTool] = useState<Partial<Record<string, string>>>({});
	const [manualByTool, setManualByTool] = useState<Partial<Record<string, string>>>({});
	const [loading, setLoading] = useState(true);
	const snapshotRef = useRef({ enabledByTool, detectedByTool, manualByTool });
	snapshotRef.current = { enabledByTool, detectedByTool, manualByTool };

	const syncAtoms = useCallback(
		(
			enabled: Record<string, boolean>,
			detected: Partial<Record<string, string>>,
			manual: Partial<Record<string, string>>,
		) => {
			const sessionImport = Object.fromEntries(
				SESSION_IMPORT_TOOLS.flatMap((tool) => [
					[tool.enabledKey, enabled[tool.id] === true],
					[tool.dirKey, manual[tool.id]],
				]),
			);
			setGrokSessionImportEnabled(isAnySessionImportEnabled(sessionImport));
			setGrokSessionsDirectory(
				firstEnabledSessionImportDirectory({ sessionImport, detected }) || detected.grok || manual.grok || "",
			);
		},
		[setGrokSessionImportEnabled, setGrokSessionsDirectory],
	);

	useEffect(() => {
		void window.vetta.config.get().then((config) => {
			const sessionImport = (config.sessionImport ?? {}) as Record<string, unknown>;
			const detected = {
				grok: config.grokSessionsDirectory,
				...(config.externalSessionDirectories ?? {}),
			};
			const enabled: Record<string, boolean> = {};
			const manual: Partial<Record<string, string>> = {};
			for (const tool of SESSION_IMPORT_TOOLS) {
				enabled[tool.id] = sessionImport[tool.enabledKey] === true;
				const manualPath = sessionImport[tool.dirKey];
				if (typeof manualPath === "string" && manualPath) manual[tool.id] = manualPath;
			}
			setEnabledByTool(enabled);
			setDetectedByTool(detected);
			setManualByTool(manual);
			syncAtoms(enabled, detected, manual);
			setLoading(false);
		});
	}, [syncAtoms]);

	const toggleEnabled = useCallback(
		(id: SessionImportToolId, checked: boolean) => {
			const spec = SESSION_IMPORT_TOOLS.find((tool) => tool.id === id);
			if (!spec) return;
			const nextEnabled = { ...snapshotRef.current.enabledByTool, [id]: checked };
			snapshotRef.current.enabledByTool = nextEnabled;
			setEnabledByTool(nextEnabled);
			syncAtoms(nextEnabled, snapshotRef.current.detectedByTool, snapshotRef.current.manualByTool);
			void window.vetta.config.set({
				sessionImport: { [spec.enabledKey]: checked } as Record<SessionImportEnabledKey, boolean>,
			});
			recordSettingsUsage({
				tab: "agent",
				action: checked ? "enabled" : "disabled",
				target: `${id}-session-import`,
			});
		},
		[syncAtoms],
	);

	const specifySessionDir = useCallback(
		async (id: SessionImportToolId) => {
			const spec = SESSION_IMPORT_TOOLS.find((tool) => tool.id === id);
			if (!spec) return;
			const selected = await window.vetta.dialog.selectFolder();
			if (!selected) return;
			const nextManual = { ...snapshotRef.current.manualByTool, [id]: selected };
			snapshotRef.current.manualByTool = nextManual;
			setManualByTool(nextManual);
			syncAtoms(snapshotRef.current.enabledByTool, snapshotRef.current.detectedByTool, nextManual);
			void window.vetta.config.set({
				sessionImport: { [spec.dirKey]: selected } as Record<SessionImportDirKey, string>,
			});
			recordSettingsUsage({ tab: "agent", action: "selected", target: `${id}-session-dir` });
		},
		[syncAtoms],
	);

	const tools = useMemo((): ExternalSessionImportToolRow[] => {
		return SESSION_IMPORT_TOOLS.map((tool) => {
			const name = t(tool.nameKey);
			const detectedPath = detectedByTool[tool.id];
			const displayPath = detectedPath ?? manualByTool[tool.id];
			const pathDescription = loading
				? t("agentSettings.sessionImport.loading", { tool: name })
				: detectedPath
					? t("agentSettings.sessionImport.detectedPath", { path: detectedPath })
					: displayPath
						? t("agentSettings.sessionImport.manualPath", { path: displayPath })
						: t("agentSettings.sessionImport.notDetected", { tool: name });
			return {
				id: tool.id,
				enabled: enabledByTool[tool.id] === true,
				canSpecifyPath: !loading && !detectedPath,
				displayPath,
				labels: { name, pathDescription },
			};
		});
	}, [detectedByTool, enabledByTool, loading, manualByTool, t]);

	const grok = tools.find((tool) => tool.id === "grok");

	return {
		actions: {
			specifySessionDir,
			toggleEnabled,
			specifyGrokSessionDir: () => specifySessionDir("grok"),
			toggleGrokEnabled: (checked) => toggleEnabled("grok", checked),
		},
		tools,
		canSpecifyGrokPath: grok?.canSpecifyPath === true,
		grokDisplayPath: grok?.displayPath,
		grokEnabled: grok?.enabled === true,
		labels: {
			description: t("agentSettings.sessionImport.description"),
			grok: t("agentSettings.sessionImport.grok"),
			pathDescription: grok?.labels.pathDescription ?? t("agentSettings.sessionImport.loading", { tool: "Grok" }),
			specifyPath: t("agentSettings.sessionImport.specifyPath"),
			title: t("section_agent-session-import"),
		},
		loading,
	};
}
