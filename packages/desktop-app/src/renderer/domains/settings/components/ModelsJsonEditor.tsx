import { useTranslation } from "react-i18next";
import { Button } from "@shared/components/ui/button";
import { SettingHeading } from "./shared";
import { SETTINGS_SECTION } from "../registry";
import type { ModelsSettingsModel } from "./useModelsSettingsModel";

export function ModelsJsonEditor({ model }: { model: ModelsSettingsModel }): JSX.Element {
	const { t } = useTranslation("settings");
	return (
		<div className="mb-6">
			<div className="mb-3 flex items-center justify-between">
				<SettingHeading section={SETTINGS_SECTION["models-json"]} />
				<Button variant="primary" size="sm" onClick={() => void model.onJsonSave()} disabled={model.saving}>
					{model.saving ? t("saving") : t("save")}
				</Button>
			</div>
			<div className="overflow-hidden rounded-xl border border-border bg-muted">
				<textarea
					value={model.jsonText}
					onChange={(event) => {
						model.setJsonText(event.target.value);
						model.clearJsonError();
					}}
					spellCheck={false}
					className="w-full resize-none bg-transparent px-4 py-3 font-mono text-[12px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/40"
					style={{ minHeight: "400px" }}
					placeholder='{ "providers": {} }'
				/>
			</div>
			{model.jsonError && (
				<div className="mt-2 flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
					<span className="icon-[mdi--alert-circle-outline] h-3.5 w-3.5 shrink-0" />
					{model.jsonError}
				</div>
			)}
		</div>
	);
}
