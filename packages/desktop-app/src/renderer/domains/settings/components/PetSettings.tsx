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
			<h1 className="mb-6 text-[20px] font-bold text-foreground">桌宠</h1>

			<SettingSection section={SETTINGS_SECTION["pet-status"]}>
				<SettingRow
					title="显示桌宠"
					description="关闭后隐藏桌宠窗口，并在下次启动时保持隐藏。"
					border={false}
				>
					<Switch checked={config.enabled} onCheckedChange={handleEnabled} />
				</SettingRow>
			</SettingSection>

			<SettingSection section={SETTINGS_SECTION["pet-window"]}>
				<SettingRow
					title="保持在最前"
					description="开启后桌宠会浮在其他窗口上方；关闭后它会像普通窗口一样被遮挡。"
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
				section={SETTINGS_SECTION["pet-developer"]}
				description="用于分辨桌宠窗口边界和视频实际显示区域。"
			>
				<SettingRow
					title="调试边框"
					description="显示窗口边界、视频区域边界，并在桌宠窗口内实时展示窗口大小和视频大小。"
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
