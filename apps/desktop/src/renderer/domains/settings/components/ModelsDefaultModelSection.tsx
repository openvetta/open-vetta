import { ModelSelect } from "@shared/components/ModelSelect";
import { SettingRow, SettingSection } from "@vetta-org/theme-ui/settings";
import { useTranslation } from "react-i18next";
import { SETTINGS_SECTION } from "../registry";
import type { ModelsSettingsModel } from "./useModelsSettingsModel";

/** 默认模型：新会话、定时任务等没有显式选模型时使用。选择器与输入栏同源，预设与自定义服务商一视同仁。 */
export function ModelsDefaultModelSection({ model }: { model: ModelsSettingsModel }): JSX.Element {
	const { t } = useTranslation("settings");

	return (
		<SettingSection
			title={t("section_models-default")}
			section={SETTINGS_SECTION["models-default"]}
			description={t("defaultModelSection.description")}
		>
			<SettingRow title={t("defaultModelSection.rowTitle")} description={t("defaultModelSection.rowDescription")} border={false}>
				<ModelSelect
					value={model.config?.defaultModel ?? null}
					onChange={(key) => void model.onChangeDefaultModel(key)}
					allowClear
					clearLabel={t("defaultModelSection.unset")}
					ariaLabel={t("defaultModelSection.rowTitle")}
					triggerClassName="min-w-[220px]"
				/>
			</SettingRow>
		</SettingSection>
	);
}
