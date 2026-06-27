import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Switch } from "@shared/components/ui/switch";
import type { PetBubbleStyleAsset } from "../../../../preload/api-types/pet";
import { PET_BUBBLE_STYLES, type PetBubbleStyleId } from "../../../../shared/pet-bubbles";
import { DEFAULT_PET_CONFIG, type PetConfig } from "../../../../shared/pet-config";
import { SETTINGS_SECTION } from "../registry";
import { PetBubbleStylePreview } from "./PetBubbleStylePreview";
import { SettingRow, SettingSection } from "./shared";

export function PetSettings(): JSX.Element {
	const { t } = useTranslation("pet");
	// 分区标题 key（section_pet-*）存于 settings ns，单独绑定一个 t 供 SettingSection 解析。
	const { t: tSettings } = useTranslation("settings");
	const [config, setConfig] = useState<PetConfig>(DEFAULT_PET_CONFIG);
	const [bubbleStyleAssets, setBubbleStyleAssets] = useState<PetBubbleStyleAsset[]>([]);

	useEffect(() => {
		void window.vetta.pet.getConfig().then(setConfig);
		void window.vetta.pet.getBubbleStyleAssets().then((next) => {
			setBubbleStyleAssets(next);
		});
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
	}, []);

	const handleAlwaysOnTop = useCallback(
		(checked: boolean) => {
			void persist({ alwaysOnTop: checked });
		},
		[persist],
	);

	const handleDebugFrame = useCallback(
		(checked: boolean) => {
			void persist({ debugFrame: checked });
		},
		[persist],
	);

	const handleBubbleStyle = useCallback(
		(value: string) => {
			void persist({ bubbleStyleId: value as PetBubbleStyleId });
		},
		[persist],
	);

	const getBubbleStyleAssetUrl = useCallback(
		(styleId: PetBubbleStyleId): string | undefined => {
			return bubbleStyleAssets.find((asset) => asset.id === styleId)?.url;
		},
		[bubbleStyleAssets],
	);

	return (
		<div className="mx-auto w-full max-w-[680px] px-8 py-4">
			<h1 className="mb-6 text-[20px] font-bold text-foreground">{t("settings.pageTitle")}</h1>

			<SettingSection t={tSettings as any} section={SETTINGS_SECTION["pet-status"]}>
				<SettingRow
					title={t("settings.showPet")}
					description={t("settings.showPetDesc")}
					border={false}
				>
					<Switch checked={config.enabled} onCheckedChange={handleEnabled} />
				</SettingRow>
			</SettingSection>

			<SettingSection t={tSettings as any} section={SETTINGS_SECTION["pet-window"]}>
				<SettingRow
					title={t("settings.alwaysOnTop")}
					description={t("settings.alwaysOnTopDesc")}
					border={false}
				>
					<Switch
						checked={config.alwaysOnTop}
						onCheckedChange={handleAlwaysOnTop}
						disabled={!config.enabled}
					/>
				</SettingRow>
			</SettingSection>

			<SettingSection
				t={tSettings as any}
				section={SETTINGS_SECTION["pet-decoration"]}
				description={t("settings.bubble.sectionDescription")}
			>
				<div className="grid grid-cols-2 gap-3 p-4 @max-xl:grid-cols-1">
					{PET_BUBBLE_STYLES.map((style) => (
						<PetBubbleStylePreview
							key={style.id}
							decorUrl={getBubbleStyleAssetUrl(style.id)}
							description={t(style.descriptionKey)}
							disabled={!config.enabled}
							label={t(style.labelKey)}
							onSelect={handleBubbleStyle}
							selected={config.bubbleStyleId === style.id}
							styleId={style.id}
						/>
					))}
				</div>
			</SettingSection>

			<SettingSection
				t={tSettings as any}
				section={SETTINGS_SECTION["pet-developer"]}
				description={t("settings.developerDesc")}
			>
				<SettingRow
					title={t("settings.debugFrame")}
					description={t("settings.debugFrameDesc")}
					border={false}
				>
					<Switch
						checked={config.debugFrame}
						onCheckedChange={handleDebugFrame}
						disabled={!config.enabled}
					/>
				</SettingRow>
			</SettingSection>
		</div>
	);
}
