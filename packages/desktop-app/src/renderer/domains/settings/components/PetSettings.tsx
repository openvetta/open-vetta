import { useCallback, useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/components/ui/select";
import { Switch } from "@shared/components/ui/switch";
import type { PetDecoration } from "../../../../preload/api-types/pet";
import { PET_ACTIONS, type PetActionId } from "../../../../shared/pet-actions";
import { DEFAULT_PET_CONFIG, type PetConfig } from "../../../../shared/pet-config";
import { SETTINGS_SECTION } from "../registry";
import { SettingRow, SettingSection } from "./shared";

export function PetSettings(): JSX.Element {
	const [config, setConfig] = useState<PetConfig>(DEFAULT_PET_CONFIG);
	const [decorations, setDecorations] = useState<PetDecoration[]>([]);

	useEffect(() => {
		void window.vetta.pet.getConfig().then((next) => {
			setConfig(next);
		});
		void window.vetta.pet.getDecorations().then((next) => {
			setDecorations(next);
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

	const handleAction = useCallback(
		(value: string) => {
			void persist({ autoMode: false, defaultActionId: value as PetActionId });
		},
		[persist],
	);

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
				description="当前仅展示可用的装饰素材，后续可接入实际装饰逻辑。"
			>
				<div className="grid grid-cols-2 gap-3 p-4 @max-xl:grid-cols-1">
					{decorations.map((decoration) => (
						<div
							key={decoration.id}
							className="overflow-hidden rounded-lg border border-border bg-background"
						>
							<div className="flex h-28 items-center justify-center bg-muted">
								{decoration.found ? (
									<img
										src={decoration.url}
										alt={decoration.label}
										className="max-h-full max-w-full object-contain"
										draggable={false}
									/>
								) : (
									<div className="px-3 text-center text-[12px] text-muted-foreground">素材缺失</div>
								)}
							</div>
							<div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
								<div className="min-w-0 truncate text-[12px] font-medium text-foreground">
									{decoration.label}
								</div>
								<div className="shrink-0 text-[11px] text-muted-foreground">
									{decoration.found ? "可用" : "缺失"}
								</div>
							</div>
						</div>
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
