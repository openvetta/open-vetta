import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@shared/components/ui/select";
import { Switch } from "@shared/components/ui/switch";
import type { PetBubbleStyleAsset } from "../../../../preload/api-types/pet";
import { getPetActionsByGroup, PET_ACTION_GROUPS, type PetActionId } from "../../../../shared/pet-actions";
import { PET_BUBBLE_STYLES, type PetBubbleStyleId } from "../../../../shared/pet-bubbles";
import { DEFAULT_PET_CONFIG, type PetConfig } from "../../../../shared/pet-config";
import { SETTINGS_SECTION } from "../registry";
import { PetBubbleStylePreview } from "./PetBubbleStylePreview";
import { SettingRow, SettingSection } from "./shared";

export function PetSettings(): JSX.Element {
	const { t } = useTranslation("pet");
	const [config, setConfig] = useState<PetConfig>(DEFAULT_PET_CONFIG);
	const [currentActionId, setCurrentActionId] = useState<PetActionId>(
		DEFAULT_PET_CONFIG.defaultActionId ?? "stoat_spin_color_hula_hoop",
	);
	const [bubbleStyleAssets, setBubbleStyleAssets] = useState<PetBubbleStyleAsset[]>([]);

	useEffect(() => {
		void window.vetta.pet.getConfig().then((next) => {
			setConfig(next);
			setCurrentActionId(next.defaultActionId ?? DEFAULT_PET_CONFIG.defaultActionId ?? "stoat_spin_color_hula_hoop");
		});
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

	const handleAutoMode = useCallback(
		(checked: boolean) => {
			void persist({ autoMode: checked });
		},
		[persist],
	);

	const handleAction = useCallback((value: string) => {
		const actionId = value as PetActionId;
		setCurrentActionId(actionId);
		void window.vetta.pet.setAction(actionId);
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

			<SettingSection section={SETTINGS_SECTION["pet-behavior"]}>
				<SettingRow
					title="自动切换动作"
					description="开启后会按时间段和应用工作状态倾向自动轮换动作；手动选择动作会临时优先。"
				>
					<Switch
						checked={config.autoMode}
						onCheckedChange={handleAutoMode}
						disabled={!config.enabled}
					/>
				</SettingRow>
				<SettingRow
					title="切换动作"
					description="选择后立即切换为该动作，约 10 秒后继续交由应用状态和自动轮换接管。"
					border={false}
				>
					<Select
						value={currentActionId}
						onValueChange={handleAction}
						disabled={!config.enabled}
					>
						<SelectTrigger className="h-7 min-w-[144px] px-2 py-1 text-[12px]">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{PET_ACTION_GROUPS.map((group) => (
								<SelectGroup key={group.id}>
									<SelectLabel className="text-[10px] text-muted-foreground/70">{group.label}</SelectLabel>
									{getPetActionsByGroup(group.id).map((action) => (
										<SelectItem
											key={action.id}
											value={action.id}
											className="text-[12px]"
										>
											{action.label}
										</SelectItem>
									))}
								</SelectGroup>
							))}
						</SelectContent>
					</Select>
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
				<SettingRow
					title={t("settings.bubble.styleTitle")}
					description={t("settings.bubble.styleDescription")}
				>
					<Select
						value={config.bubbleStyleId}
						onValueChange={handleBubbleStyle}
						disabled={!config.enabled}
					>
						<SelectTrigger className="h-7 min-w-[144px] px-2 py-1 text-[12px]">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{PET_BUBBLE_STYLES.map((style) => (
								<SelectItem
									key={style.id}
									value={style.id}
									className="text-[12px]"
								>
									{t(style.labelKey)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</SettingRow>
				<div className="grid grid-cols-2 gap-3 p-4 @max-xl:grid-cols-1">
					{PET_BUBBLE_STYLES.map((style) => (
						<PetBubbleStylePreview
							key={style.id}
							decorUrl={getBubbleStyleAssetUrl(style.id)}
							description={t(style.descriptionKey)}
							label={t(style.labelKey)}
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
