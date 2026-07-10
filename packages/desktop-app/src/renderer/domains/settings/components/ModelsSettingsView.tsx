import { useTranslation } from "react-i18next";
import { SegmentedControl } from "@shared/components/ui/segmented-control";
import { PresetProvidersSection } from "./PresetProvidersSection";
import { ModelsJsonEditor } from "./ModelsJsonEditor";
import { ModelsProvidersSection } from "./ModelsProvidersSection";
import type { ModelsEditMode, ModelsSettingsModel } from "./useModelsSettingsModel";

export function ModelsSettingsView({ model }: { model: ModelsSettingsModel }): JSX.Element {
	const { t } = useTranslation("settings");

	if (!model.config) {
		return (
			<div className="mx-auto w-full max-w-[680px] px-8 py-4">
				<h1 className="mb-6 text-[20px] font-bold text-foreground">{t("modelsTitle")}</h1>
				<div className="flex items-center justify-center py-16">
					<span className="text-[13px] text-muted-foreground">{t("loading")}</span>
				</div>
			</div>
		);
	}

	return (
		<div className="mx-auto w-full max-w-[680px] px-8 py-4">
			<div className="mb-6 flex items-center justify-between">
				<h1 className="text-[20px] font-bold text-foreground">{t("modelSettings.title")}</h1>
				<SegmentedControl
					items={[
						{ key: "visual" as ModelsEditMode, label: t("view"), icon: "icon-[mdi--view-list-outline]" },
						{ key: "json" as ModelsEditMode, label: "JSON", icon: "icon-[mdi--code-json]" },
					]}
					value={model.mode}
					onChange={model.onModeSwitch}
				/>
			</div>

			{model.mode === "visual" ? (
				<>
					<PresetProvidersSection config={model.config} saveConfig={model.saveConfig} />
					<ModelsProvidersSection model={model} />
				</>
			) : (
				<ModelsJsonEditor model={model} />
			)}

			<div className="mt-6 text-center text-[11px] text-muted-foreground/60">
				{t("configFilePath")}: ~/.vetta/agent/models.json
			</div>
		</div>
	);
}
