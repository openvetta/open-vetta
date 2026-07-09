import { Switch } from "@shared/components/ui/switch";
import { SETTINGS_SECTION } from "../registry";
import { PetBubbleStylePreview } from "./PetBubbleStylePreview";
import { SettingRow, SettingSection } from "./shared";
import type { PetSettingsModel } from "./usePetSettingsModel";

function PetDecorationGrid({ model }: { model: PetSettingsModel }): JSX.Element {
	return (
		<div className="grid grid-cols-2 gap-3 p-4 @max-xl:grid-cols-1">
			{model.decorations.map((decoration) => {
				const label = decoration.label;
				return (
					<div key={decoration.id} className="overflow-hidden rounded-lg border border-border bg-background">
						<div className="flex h-28 items-center justify-center bg-muted">
							{decoration.found ? (
								<img src={decoration.url} alt={label} className="max-h-full max-w-full object-contain" draggable={false} />
							) : (
								<div className="px-3 text-center text-[12px] text-muted-foreground">{model.labels.materialMissing}</div>
							)}
						</div>
						<div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
							<div className="min-w-0 truncate text-[12px] font-medium text-foreground">{label}</div>
							<div className="shrink-0 text-[11px] text-muted-foreground">
								{decoration.found ? model.labels.decorationAvailable : model.labels.decorationMissing}
							</div>
						</div>
					</div>
				);
			})}
		</div>
	);
}

function PetBubbleStyleGrid({ model }: { model: PetSettingsModel }): JSX.Element {
	return (
		<div className="grid grid-cols-2 gap-3 p-4 @max-xl:grid-cols-1">
			{model.bubbleStyles.map((style) => (
				<PetBubbleStylePreview
					key={style.id}
					decorUrl={style.decorUrl}
					description={style.description}
					disabled={!model.config.enabled}
					label={style.label}
					onSelect={model.actions.changeBubbleStyle}
					selected={model.config.bubbleStyleId === style.id}
					styleId={style.id}
				/>
			))}
		</div>
	);
}

export function PetSettingsView({ model }: { model: PetSettingsModel }): JSX.Element {
	return (
		<div className="mx-auto w-full max-w-[680px] px-8 py-4">
			<h1 className="mb-6 text-[20px] font-bold text-foreground">{model.labels.pageTitle}</h1>

			<SettingSection title={model.labels.sections.status} section={SETTINGS_SECTION["pet-status"]}>
				<SettingRow title={model.labels.showPet} description={model.labels.showPetDescription} border={false}>
					<Switch checked={model.config.enabled} onCheckedChange={model.actions.changeEnabled} />
				</SettingRow>
			</SettingSection>

			<SettingSection title={model.labels.sections.window} section={SETTINGS_SECTION["pet-window"]}>
				<SettingRow title={model.labels.alwaysOnTop} description={model.labels.alwaysOnTopDescription} border={false}>
					<Switch
						checked={model.config.alwaysOnTop}
						onCheckedChange={model.actions.changeAlwaysOnTop}
						disabled={!model.config.enabled}
					/>
				</SettingRow>
			</SettingSection>

			<SettingSection
				title={model.labels.sections.decoration}
				section={SETTINGS_SECTION["pet-decoration"]}
				description={model.labels.decorationSectionDescription}
			>
				<PetDecorationGrid model={model} />
			</SettingSection>

			<SettingSection
				title={model.labels.sections.bubble}
				section={SETTINGS_SECTION["pet-bubble"]}
				description={model.labels.bubbleSectionDescription}
			>
				<PetBubbleStyleGrid model={model} />
			</SettingSection>

			<SettingSection
				title={model.labels.sections.developer}
				section={SETTINGS_SECTION["pet-developer"]}
				description={model.labels.developerDescription}
			>
				<SettingRow title={model.labels.debugFrame} description={model.labels.debugFrameDescription} border={false}>
					<Switch
						checked={model.config.debugFrame}
						onCheckedChange={model.actions.changeDebugFrame}
						disabled={!model.config.enabled}
					/>
				</SettingRow>
			</SettingSection>
		</div>
	);
}
