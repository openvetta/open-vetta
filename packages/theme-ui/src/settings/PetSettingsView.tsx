import type { JSX, ReactNode } from "react";
import { useState } from "react";
import { Slider, Switch } from "@vetta-org/ui";
import { SettingRow, SettingSection, type SettingSectionMeta } from "./SettingChrome";

export interface PetDecorationView {
	readonly id: string;
	readonly label: string;
	readonly found: boolean;
	readonly url: string;
}

export interface PetSettingsViewLabels {
	readonly pageTitle: string;
	readonly materialMissing: string;
	readonly decorationAvailable: string;
	readonly decorationMissing: string;
	readonly showPet: string;
	readonly showPetDescription: string;
	readonly alwaysOnTop: string;
	readonly alwaysOnTopDescription: string;
	readonly decorationSectionDescription: string;
	readonly developerDescription: string;
	readonly debugFrame: string;
	readonly debugFrameDescription: string;
	readonly size: string;
	readonly sizeDescription: string;
	readonly autoMode: string;
	readonly autoModeDescription: string;
	readonly actionsSectionDescription: string;
	readonly tipsSectionDescription: string;
	readonly sections: {
		readonly display: string;
		readonly behavior: string;
		readonly actions: string;
		readonly tips: string;
		readonly decoration: string;
		readonly developer: string;
	};
}

export interface PetTipView {
	readonly id: string;
	/** iconify 类名，例如 `icon-[solar--cursor-linear]`。 */
	readonly iconClassName: string;
	readonly title: string;
	readonly description: string;
}

export interface PetSizeControlView {
	readonly value: number;
	readonly min: number;
	readonly max: number;
	readonly step: number;
	/** 松手或键盘调整后触发；拖动过程只在本地预览数值。 */
	readonly onCommit: (value: number) => void;
}

export interface PetSettingsViewProps {
	readonly labels: PetSettingsViewLabels;
	readonly sections: {
		readonly display: SettingSectionMeta;
		readonly behavior: SettingSectionMeta;
		readonly actions: SettingSectionMeta;
		readonly tips: SettingSectionMeta;
		readonly decoration: SettingSectionMeta;
		readonly developer: SettingSectionMeta;
	};
	readonly enabled: boolean;
	readonly autoMode: boolean;
	readonly size: PetSizeControlView;
	/** 动作预览与播放，通常放 `PetActionGalleryView`。 */
	readonly actionGallery: ReactNode;
	readonly tips: readonly PetTipView[];
	readonly alwaysOnTop: boolean;
	readonly debugFrame: boolean;
	readonly decorations: readonly PetDecorationView[];
	/** 是否展示「桌宠装饰」分区；组件与数据链路保留，默认 true。 */
	readonly showDecorationSection?: boolean;
	readonly aiAssistSlot: ReactNode;
	readonly onChangeEnabled: (value: boolean) => void;
	readonly onChangeAlwaysOnTop: (value: boolean) => void;
	readonly onChangeAutoMode: (value: boolean) => void;
	readonly onChangeDebugFrame: (value: boolean) => void;
}

function formatPercent(value: number): string {
	return `${Math.round(value * 100)}%`;
}

function PetSizeSlider({
	size,
	label,
	disabled,
}: {
	size: PetSizeControlView;
	label: string;
	disabled: boolean;
}): JSX.Element {
	const [draft, setDraft] = useState<number>();
	const shown = draft ?? size.value;
	return (
		<div className="flex w-56 items-center gap-3">
			<Slider
				className="flex-1"
				value={[shown]}
				min={size.min}
				max={size.max}
				step={size.step}
				disabled={disabled}
				aria-label={label}
				aria-valuetext={formatPercent(shown)}
				onValueChange={([next]) => setDraft(next)}
				onValueCommit={([next]) => {
					setDraft(undefined);
					if (next !== undefined && next !== size.value) size.onCommit(next);
				}}
			/>
			<span className="w-10 shrink-0 text-right text-[12px] tabular-nums text-muted-foreground">
				{formatPercent(shown)}
			</span>
		</div>
	);
}

export function PetSettingsView({
	labels,
	sections,
	enabled,
	autoMode,
	size,
	actionGallery,
	tips,
	alwaysOnTop,
	debugFrame,
	decorations,
	showDecorationSection = true,
	aiAssistSlot,
	onChangeEnabled,
	onChangeAlwaysOnTop,
	onChangeAutoMode,
	onChangeDebugFrame,
}: PetSettingsViewProps): JSX.Element {
	return (
		<div className="mx-auto w-full max-w-[680px] px-8 pt-2 pb-4">
			<div className="mb-6 flex flex-wrap items-center justify-between gap-3">
				<h1 className="text-[20px] font-bold text-foreground">{labels.pageTitle}</h1>
				{aiAssistSlot}
			</div>

			<SettingSection title={labels.sections.display} section={sections.display}>
				<SettingRow title={labels.showPet} description={labels.showPetDescription}>
					<Switch checked={enabled} onCheckedChange={onChangeEnabled} />
				</SettingRow>
				<SettingRow title={labels.alwaysOnTop} description={labels.alwaysOnTopDescription}>
					<Switch
						checked={alwaysOnTop}
						onCheckedChange={onChangeAlwaysOnTop}
						disabled={!enabled}
					/>
				</SettingRow>
				<SettingRow title={labels.size} description={labels.sizeDescription} border={false}>
					<PetSizeSlider size={size} label={labels.size} disabled={!enabled} />
				</SettingRow>
			</SettingSection>

			<SettingSection title={labels.sections.behavior} section={sections.behavior}>
				<SettingRow title={labels.autoMode} description={labels.autoModeDescription} border={false}>
					<Switch checked={autoMode} onCheckedChange={onChangeAutoMode} disabled={!enabled} />
				</SettingRow>
			</SettingSection>

			<SettingSection
				title={labels.sections.actions}
				section={sections.actions}
				description={labels.actionsSectionDescription}
			>
				{actionGallery}
			</SettingSection>

			<SettingSection
				title={labels.sections.tips}
				section={sections.tips}
				description={labels.tipsSectionDescription}
			>
				<ul className="grid grid-cols-2 gap-px bg-border">
					{tips.map((tip) => (
						<li key={tip.id} className="flex items-start gap-3 bg-card px-4 py-3">
							<span
								aria-hidden
								className={`${tip.iconClassName} mt-0.5 size-4 shrink-0 text-muted-foreground`}
							/>
							<div className="min-w-0">
								<div className="text-[13px] font-medium text-foreground">{tip.title}</div>
								<div className="mt-0.5 text-[12px] text-muted-foreground">{tip.description}</div>
							</div>
						</li>
					))}
				</ul>
			</SettingSection>

			{showDecorationSection && (
				<SettingSection
					title={labels.sections.decoration}
					section={sections.decoration}
					description={labels.decorationSectionDescription}
				>
					<div className="grid grid-cols-2 gap-3 p-4">
						{decorations.map((decoration) => (
							<div
								key={decoration.id}
								className="overflow-hidden rounded-lg border border-border bg-card"
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
										<div className="px-3 text-center text-[12px] text-muted-foreground">
											{labels.materialMissing}
										</div>
									)}
								</div>
								<div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
									<div className="min-w-0 truncate text-[12px] font-medium text-foreground">
										{decoration.label}
									</div>
									<div className="shrink-0 text-[11px] text-muted-foreground">
										{decoration.found
											? labels.decorationAvailable
											: labels.decorationMissing}
									</div>
								</div>
							</div>
						))}
					</div>
				</SettingSection>
			)}

			<SettingSection
				title={labels.sections.developer}
				section={sections.developer}
				description={labels.developerDescription}
			>
				<SettingRow
					title={labels.debugFrame}
					description={labels.debugFrameDescription}
					border={false}
				>
					<Switch
						checked={debugFrame}
						onCheckedChange={onChangeDebugFrame}
						disabled={!enabled}
					/>
				</SettingRow>
			</SettingSection>
		</div>
	);
}
