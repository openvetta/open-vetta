import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PetDecoration } from "../../../../preload/api-types/pet";
import { DEFAULT_PET_CONFIG, type PetConfig } from "../../../../shared/pet-config";
import { SETTINGS_SECTION } from "../registry";
import { recordSettingsUsage } from "./recordSettingsUsage";

export interface PetSettingsModel {
	actions: {
		changeAlwaysOnTop: (checked: boolean) => void;
		changeDebugFrame: (checked: boolean) => void;
		changeEnabled: (checked: boolean) => void;
	};
	config: PetConfig;
	decorations: PetDecoration[];
	labels: {
		alwaysOnTop: string;
		alwaysOnTopDescription: string;
		debugFrame: string;
		debugFrameDescription: string;
		decorationAvailable: string;
		decorationMissing: string;
		decorationSectionDescription: string;
		developerDescription: string;
		materialMissing: string;
		pageTitle: string;
		sections: {
			decoration: string;
			developer: string;
			display: string;
		};
		showPet: string;
		showPetDescription: string;
	};
}

export function usePetSettingsModel(): PetSettingsModel {
	const { t } = useTranslation("pet");
	const { t: tSettings } = useTranslation("settings");
	const [config, setConfig] = useState<PetConfig>(DEFAULT_PET_CONFIG);
	const [decorations, setDecorations] = useState<PetDecoration[]>([]);

	useEffect(() => {
		let disposed = false;
		let receivedConfigEvent = false;
		const unsubscribe = window.vetta.pet.onConfigChanged((next) => {
			receivedConfigEvent = true;
			if (!disposed) setConfig(next);
		});
		void window.vetta.pet.getConfig().then((next) => {
			if (!disposed && !receivedConfigEvent) setConfig(next);
		});
		void window.vetta.pet.getDecorations().then(setDecorations);
		return () => {
			disposed = true;
			unsubscribe();
		};
	}, []);

	const persist = useCallback(async (patch: Partial<PetConfig>) => {
		setConfig((current) => ({ ...current, ...patch }));
		const next = await window.vetta.pet.setConfig(patch);
		setConfig(next);
	}, []);

	const handleEnabled = useCallback((checked: boolean) => {
		setConfig((current) => ({ ...current, enabled: checked }));
		const request = checked ? window.vetta.pet.show() : window.vetta.pet.hide();
		void request.then(setConfig);
		recordSettingsUsage({ tab: "pet", action: checked ? "enabled" : "disabled", target: "pet-window" });
	}, []);

	const handleAlwaysOnTop = useCallback(
		(checked: boolean) => {
			void persist({ alwaysOnTop: checked });
			recordSettingsUsage({ tab: "pet", action: checked ? "enabled" : "disabled", target: "always-on-top" });
		},
		[persist],
	);

	const handleDebugFrame = useCallback(
		(checked: boolean) => {
			void persist({ debugFrame: checked });
			recordSettingsUsage({ tab: "pet", action: checked ? "enabled" : "disabled", target: "debug-frame" });
		},
		[persist],
	);

	const localizedDecorations = useMemo(
		() =>
			decorations.map((decoration) => ({
				...decoration,
				label: t(decoration.labelKey),
			})),
		[decorations, t],
	);

	const labels = useMemo(
		() => ({
			alwaysOnTop: t("settings.alwaysOnTop"),
			alwaysOnTopDescription: t("settings.alwaysOnTopDesc"),
			debugFrame: t("settings.debugFrame"),
			debugFrameDescription: t("settings.debugFrameDesc"),
			decorationAvailable: t("settings.decoration.available"),
			decorationMissing: t("settings.decoration.missing"),
			decorationSectionDescription: t("settings.decoration.sectionDescription"),
			developerDescription: t("settings.developerDesc"),
			materialMissing: t("settings.decoration.materialMissing"),
			pageTitle: t("settings.pageTitle"),
			sections: {
				decoration: tSettings(SETTINGS_SECTION["pet-decoration"].titleKey),
				developer: tSettings(SETTINGS_SECTION["pet-developer"].titleKey),
				display: tSettings(SETTINGS_SECTION["pet-display"].titleKey),
			},
			showPet: t("settings.showPet"),
			showPetDescription: t("settings.showPetDesc"),
		}),
		[t, tSettings],
	);

	return {
		actions: {
			changeAlwaysOnTop: handleAlwaysOnTop,
			changeDebugFrame: handleDebugFrame,
			changeEnabled: handleEnabled,
		},
		config,
		decorations: localizedDecorations,
		labels,
	};
}
