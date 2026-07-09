import { useTranslation } from "react-i18next";
import { Button } from "@shared/components/ui/button";
import { SettingSection } from "./shared";
import { ModelsProviderForm } from "./ModelsProviderForm";
import { ModelsProviderRow } from "./ModelsProviderRow";
import { SETTINGS_SECTION } from "../registry";
import type { ModelsSettingsModel } from "./useModelsSettingsModel";

export function ModelsProvidersSection({ model }: { model: ModelsSettingsModel }): JSX.Element {
	const { t } = useTranslation("settings");

	return (
		<SettingSection
			section={SETTINGS_SECTION["models-providers"]}
			title={
				<div className="flex items-center justify-between">
					<span>{t("localProviders")}</span>
					{!model.addingProvider && (
						<Button variant="ghost" size="sm" onClick={model.onStartAddProvider}>
							<span className="icon-[mdi--plus] h-3.5 w-3.5" />
							{t("addProvider")}
						</Button>
					)}
				</div>
			}
		>
			{model.providerNames.length === 0 && !model.addingProvider && (
				<div className="px-5 py-8 text-center text-[12px] text-muted-foreground">{t("noProvidersAdded")}</div>
			)}

			{model.providerNames.map((name) => (
				<ModelsProviderRow key={name} name={name} model={model} />
			))}

			{model.addingProvider && (
				<div className="border-t border-border px-5 py-4">
					<ModelsProviderForm
						form={model.providerForm}
						setForm={model.setProviderForm}
						onSave={() => void model.onAddProvider()}
						onCancel={model.onCancelAddProvider}
						saving={model.saving}
						saveLabel={t("add")}
					/>
				</div>
			)}
		</SettingSection>
	);
}
