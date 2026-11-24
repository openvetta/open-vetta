import type {
	PetActionGalleryViewLabels,
	PetActionGroupView,
	PetSizeControlView,
	PetTipView,
} from "@vetta-org/theme-ui/settings";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PetActionVideo, PetDecoration } from "../../../../preload/api-types/pet";
import { getPetActionsByGroup, PET_ACTION_GROUPS } from "../../../../shared/pet-actions";
import {
	DEFAULT_PET_CONFIG,
	normalizePetVideoScale,
	PET_VIDEO_SCALE_MAX,
	PET_VIDEO_SCALE_MIN,
	type PetConfig,
} from "../../../../shared/pet-config";
import { SETTINGS_SECTION } from "../registry";
import { recordSettingsUsage } from "./recordSettingsUsage";

/** 滑块用 5% 一档；桌宠滚轮缩放仍是细粒度，显示时原样展示。 */
const PET_SIZE_SLIDER_STEP = 0.05;
/** 键盘连按方向键时每次都会提交，合并成一次写配置。 */
const PET_SIZE_PERSIST_DELAY_MS = 200;

const PET_TIP_ICONS = {
	move: "icon-[solar--cursor-linear]",
	resize: "icon-[solar--mouse-minimalistic-linear]",
	menu: "icon-[solar--menu-dots-linear]",
	notices: "icon-[solar--chat-round-dots-linear]",
} as const;

export interface PetSettingsModel {
	actions: {
		changeAlwaysOnTop: (checked: boolean) => void;
		changeAutoMode: (checked: boolean) => void;
		changeDebugFrame: (checked: boolean) => void;
		changeEnabled: (checked: boolean) => void;
		playAction: (actionId: string) => void;
	};
	actionGroups: PetActionGroupView[];
	actionLabels: PetActionGalleryViewLabels;
	config: PetConfig;
	decorations: PetDecoration[];
	size: PetSizeControlView;
	tips: PetTipView[];
	labels: {
		actionsSectionDescription: string;
		alwaysOnTop: string;
		alwaysOnTopDescription: string;
		autoMode: string;
		autoModeDescription: string;
		debugFrame: string;
		debugFrameDescription: string;
		decorationAvailable: string;
		decorationMissing: string;
		decorationSectionDescription: string;
		developerDescription: string;
		materialMissing: string;
		pageTitle: string;
		sections: {
			actions: string;
			behavior: string;
			decoration: string;
			developer: string;
			display: string;
			tips: string;
		};
		showPet: string;
		showPetDescription: string;
		size: string;
		sizeDescription: string;
		tipsSectionDescription: string;
	};
}

export function usePetSettingsModel(): PetSettingsModel {
	const { t } = useTranslation("pet");
	const { t: tSettings } = useTranslation("settings");
	const [config, setConfig] = useState<PetConfig>(DEFAULT_PET_CONFIG);
	const [decorations, setDecorations] = useState<PetDecoration[]>([]);
	const [actionVideos, setActionVideos] = useState<PetActionVideo[]>([]);
	const sizeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

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
		void window.vetta.pet.getDecorations().then((next) => {
			if (!disposed) setDecorations(next);
		});
		void window.vetta.pet.getActionVideos().then((next) => {
			if (!disposed) setActionVideos(next);
		});
		return () => {
			disposed = true;
			unsubscribe();
			clearTimeout(sizeTimerRef.current);
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

	const handleAutoMode = useCallback(
		(checked: boolean) => {
			void persist({ autoMode: checked });
			recordSettingsUsage({ tab: "pet", action: checked ? "enabled" : "disabled", target: "auto-mode" });
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

	const handleSizeCommit = useCallback(
		(value: number) => {
			const videoScale = normalizePetVideoScale(value);
			setConfig((current) => ({ ...current, videoScale }));
			clearTimeout(sizeTimerRef.current);
			sizeTimerRef.current = setTimeout(() => {
				void persist({ videoScale });
				recordSettingsUsage({ tab: "pet", action: "changed", target: "size", value: String(videoScale) });
			}, PET_SIZE_PERSIST_DELAY_MS);
		},
		[persist],
	);

	const handlePlayAction = useCallback((actionId: string) => {
		void window.vetta.pet.setAction(actionId);
		recordSettingsUsage({ tab: "pet", action: "selected", target: "action", value: actionId });
	}, []);

	const actionGroups = useMemo<PetActionGroupView[]>(() => {
		const videoUrlById = new Map(actionVideos.map((video) => [video.id, video.url]));
		return PET_ACTION_GROUPS.map((group) => ({
			id: group.id,
			label: t(`settings.actions.groups.${group.id}`),
			actions: getPetActionsByGroup(group.id).map((action) => ({
				id: action.id,
				label: t(`settings.actions.items.${action.id}.label`),
				description: t(`settings.actions.items.${action.id}.description`),
				videoUrl: videoUrlById.get(action.id),
			})),
		}));
	}, [actionVideos, t]);

	const actionLabels = useMemo<PetActionGalleryViewLabels>(
		() => ({
			needShowPet: t("settings.actions.needShowPet"),
			play: t("settings.actions.play"),
			played: t("settings.actions.played"),
			previewHint: t("settings.actions.previewHint"),
			videoMissing: t("settings.actions.videoMissing"),
		}),
		[t],
	);

	const tips = useMemo<PetTipView[]>(
		() =>
			(Object.keys(PET_TIP_ICONS) as (keyof typeof PET_TIP_ICONS)[]).map((id) => ({
				id,
				iconClassName: PET_TIP_ICONS[id],
				title: t(`settings.tips.items.${id}.title`),
				description: t(`settings.tips.items.${id}.description`),
			})),
		[t],
	);

	const size = useMemo<PetSizeControlView>(
		() => ({
			value: config.videoScale,
			min: PET_VIDEO_SCALE_MIN,
			max: PET_VIDEO_SCALE_MAX,
			step: PET_SIZE_SLIDER_STEP,
			onCommit: handleSizeCommit,
		}),
		[config.videoScale, handleSizeCommit],
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
			actionsSectionDescription: t("settings.actions.sectionDescription"),
			alwaysOnTop: t("settings.alwaysOnTop"),
			alwaysOnTopDescription: t("settings.alwaysOnTopDesc"),
			autoMode: t("settings.autoMode"),
			autoModeDescription: t("settings.autoModeDesc"),
			debugFrame: t("settings.debugFrame"),
			debugFrameDescription: t("settings.debugFrameDesc"),
			decorationAvailable: t("settings.decoration.available"),
			decorationMissing: t("settings.decoration.missing"),
			decorationSectionDescription: t("settings.decoration.sectionDescription"),
			developerDescription: t("settings.developerDesc"),
			materialMissing: t("settings.decoration.materialMissing"),
			pageTitle: t("settings.pageTitle"),
			sections: {
				actions: tSettings(SETTINGS_SECTION["pet-actions"].titleKey),
				behavior: tSettings(SETTINGS_SECTION["pet-behavior"].titleKey),
				decoration: tSettings(SETTINGS_SECTION["pet-decoration"].titleKey),
				developer: tSettings(SETTINGS_SECTION["pet-developer"].titleKey),
				display: tSettings(SETTINGS_SECTION["pet-display"].titleKey),
				tips: tSettings(SETTINGS_SECTION["pet-tips"].titleKey),
			},
			showPet: t("settings.showPet"),
			showPetDescription: t("settings.showPetDesc"),
			size: t("settings.size"),
			sizeDescription: t("settings.sizeDesc"),
			tipsSectionDescription: t("settings.tips.sectionDescription"),
		}),
		[t, tSettings],
	);

	return {
		actions: {
			changeAlwaysOnTop: handleAlwaysOnTop,
			changeAutoMode: handleAutoMode,
			changeDebugFrame: handleDebugFrame,
			changeEnabled: handleEnabled,
			playAction: handlePlayAction,
		},
		actionGroups,
		actionLabels,
		config,
		decorations: localizedDecorations,
		labels,
		size,
		tips,
	};
}
