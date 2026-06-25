import { useCallback, useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/components/ui/select";
import { Switch } from "@shared/components/ui/switch";
import { PET_ACTIONS, type PetActionId } from "../../../../shared/pet-actions";
import { DEFAULT_PET_CONFIG, PET_SIZE_OPTIONS, type PetConfig } from "../../../../shared/pet-config";
import { SETTINGS_SECTION } from "../registry";
import { SettingRow, SettingSection } from "./shared";

export function PetSettings(): JSX.Element {
	const [config, setConfig] = useState<PetConfig>(DEFAULT_PET_CONFIG);

	useEffect(() => {
		void window.vetta.pet.getConfig().then(setConfig);
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

	const handleAction = useCallback(
		(value: string) => {
			void persist({ autoMode: false, defaultActionId: value as PetActionId });
		},
		[persist],
	);

	const handleSize = useCallback(
		(value: string) => {
			void persist({ size: Number(value) });
		},
		[persist],
	);

	const handleAlwaysOnTop = useCallback(
		(checked: boolean) => {
			void persist({ alwaysOnTop: checked });
		},
		[persist],
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
					description="开启后会按时间段和工作状态倾向自动轮换动作；手动选择动作会暂停自动切换。"
				>
					<Switch
						checked={config.autoMode}
						onCheckedChange={handleAutoMode}
						disabled={!config.enabled}
					/>
				</SettingRow>
				<SettingRow
					title="当前动作"
					description="选择后立即固定为该动作，适合想让桌宠保持安静、工作或休息状态。"
					border={false}
				>
					<Select
						value={config.defaultActionId ?? DEFAULT_PET_CONFIG.defaultActionId}
						onValueChange={handleAction}
						disabled={!config.enabled}
					>
						<SelectTrigger className="h-7 min-w-[144px] px-2 py-1 text-[12px]">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{PET_ACTIONS.map((action) => (
								<SelectItem key={action.id} value={action.id} className="text-[12px]">
									{action.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</SettingRow>
			</SettingSection>

			<SettingSection section={SETTINGS_SECTION["pet-window"]}>
				<SettingRow
					title="窗口大小"
					description="调整桌宠在屏幕上的显示尺寸，不会改动视频素材。"
				>
					<Select
						value={String(config.size)}
						onValueChange={handleSize}
						disabled={!config.enabled}
					>
						<SelectTrigger className="h-7 min-w-[112px] px-2 py-1 text-[12px]">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{PET_SIZE_OPTIONS.map((option) => (
								<SelectItem key={option.value} value={String(option.value)} className="text-[12px]">
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</SettingRow>
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
		</div>
	);
}
