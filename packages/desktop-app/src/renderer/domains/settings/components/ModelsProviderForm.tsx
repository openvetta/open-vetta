import { useTranslation } from "react-i18next";
import { Button } from "@shared/components/ui/button";
import { CheckboxField } from "./McpSettings";
import { InputField, SelectField } from "./SettingsFormFields";
import { API_OPTIONS, type ProviderFormState } from "./useModelsSettingsModel";

export function ModelsProviderForm({
	form,
	setForm,
	onSave,
	onCancel,
	saving,
	saveLabel,
}: {
	form: ProviderFormState;
	setForm: React.Dispatch<React.SetStateAction<ProviderFormState>>;
	onSave: () => void;
	onCancel: () => void;
	saving: boolean;
	saveLabel: string;
}): JSX.Element {
	const { t } = useTranslation("settings");
	return (
		<>
			<div className="grid grid-cols-2 gap-3">
				<div>
					<label className="mb-1 block text-[11px] text-muted-foreground">{t("providerName")}</label>
					<InputField
						value={form.name}
						onChange={(value) => setForm((current) => ({ ...current, name: value }))}
						placeholder="e.g. ollama, lm-studio"
					/>
				</div>
				<div>
					<label className="mb-1 block text-[11px] text-muted-foreground">{t("apiType")}</label>
					<SelectField
						value={form.api}
						onChange={(value) => setForm((current) => ({ ...current, api: value }))}
						options={API_OPTIONS}
					/>
				</div>
				<div className="col-span-2">
					<label className="mb-1 block text-[11px] text-muted-foreground">Base URL</label>
					<InputField
						value={form.baseUrl}
						onChange={(value) => setForm((current) => ({ ...current, baseUrl: value }))}
						placeholder="e.g. http://localhost:11434/v1"
					/>
				</div>
				<div className="col-span-2">
					<label className="mb-1 block text-[11px] text-muted-foreground">API Key</label>
					<InputField
						value={form.apiKey}
						onChange={(value) => setForm((current) => ({ ...current, apiKey: value }))}
						placeholder={t("apiKeyPlaceholder")}
						type="password"
					/>
				</div>
				<div className="col-span-2">
					<label className="mb-1 block text-[11px] text-muted-foreground">{t("customHeaders")}</label>
					<textarea
						value={form.headers}
						onChange={(event) => setForm((current) => ({ ...current, headers: event.target.value }))}
						placeholder={"X-Custom-Header: value\nAuthorization: Bearer xxx"}
						rows={2}
						className="w-full resize-none rounded-lg border border-input bg-secondary px-3 py-2 font-mono text-[12px] text-foreground placeholder:text-muted-foreground/40 outline-none transition-colors hover:bg-accent focus:border-ring"
					/>
				</div>
				<div className="col-span-2">
					<CheckboxField
						checked={form.authHeader}
						onChange={(value) => setForm((current) => ({ ...current, authHeader: value }))}
						label={t("useAuthHeader")}
					/>
				</div>
			</div>
			<div className="mt-3 flex justify-end gap-2">
				<Button variant="ghost" size="sm" onClick={onCancel}>
					{t("cancel")}
				</Button>
				<Button variant="primary" size="sm" onClick={onSave} disabled={!form.name.trim() || saving}>
					{saveLabel}
				</Button>
			</div>
		</>
	);
}
