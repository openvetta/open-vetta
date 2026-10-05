import { Button } from "@vetta-org/ui";
import { type JSX, useId } from "react";
import { CheckboxField, InputField, SelectField } from "./SettingsFormFields";

export interface ModelsProviderFormStateView {
	readonly name: string;
	readonly api: string;
	readonly baseUrl: string;
	readonly apiKey: string;
	readonly headers: string;
	readonly authHeader: boolean;
}

export interface ModelsProviderFormViewLabels {
	readonly providerName: string;
	readonly baseUrl: string;
	readonly apiKey: string;
	readonly apiType: string;
	readonly apiKeyPlaceholder: string;
	readonly customHeaders: string;
	readonly useAuthHeader: string;
	readonly cancel: string;
	readonly namePlaceholder: string;
	readonly baseUrlPlaceholder: string;
	readonly copyApiKey: string;
}

export interface ModelsProviderFormViewProps {
	readonly form: ModelsProviderFormStateView;
	readonly onChange: (patch: Partial<ModelsProviderFormStateView>) => void;
	readonly onSave: () => void;
	readonly onCancel: () => void;
	readonly saving: boolean;
	readonly saveLabel: string;
	readonly apiOptions: readonly { value: string; label: string }[];
	readonly labels: ModelsProviderFormViewLabels;
	readonly onCopyApiKey?: () => void;
}

export function ModelsProviderFormView({
	form,
	onChange,
	onSave,
	onCancel,
	saving,
	saveLabel,
	apiOptions,
	labels,
	onCopyApiKey,
}: ModelsProviderFormViewProps): JSX.Element {
	const formId = useId();
	return (
		<>
			<div className="grid grid-cols-2 gap-3">
				<div>
					<label htmlFor={`${formId}-providerName`} className="mb-1 block text-[11px] text-muted-foreground">
						{labels.providerName}
					</label>
					<InputField
						id={`${formId}-providerName`}
						aria-label={labels.providerName}
						value={form.name}
						onChange={(value) => onChange({ name: value })}
						placeholder={labels.namePlaceholder}
					/>
				</div>
				<div>
					<label htmlFor={`${formId}-apiType`} className="mb-1 block text-[11px] text-muted-foreground">
						{labels.apiType}
					</label>
					<SelectField
						id={`${formId}-apiType`}
						aria-label={labels.apiType}
						value={form.api}
						onChange={(value) => onChange({ api: value })}
						options={[...apiOptions]}
					/>
				</div>
				<div className="col-span-2">
					<label htmlFor={`${formId}-baseUrl`} className="mb-1 block text-[11px] text-muted-foreground">
						{labels.baseUrl}
					</label>
					<InputField
						id={`${formId}-baseUrl`}
						aria-label={labels.baseUrl}
						value={form.baseUrl}
						onChange={(value) => onChange({ baseUrl: value })}
						placeholder={labels.baseUrlPlaceholder}
					/>
				</div>
				<div className="col-span-2">
					<label htmlFor={`${formId}-apiKey`} className="mb-1 block text-[11px] text-muted-foreground">
						{labels.apiKey}
					</label>
					<div className="flex items-center gap-2">
						<div className="min-w-0 flex-1">
							<InputField
								id={`${formId}-apiKey`}
								aria-label={labels.apiKey}
								value={form.apiKey}
								onChange={(value) => onChange({ apiKey: value })}
								placeholder={labels.apiKeyPlaceholder}
								type="password"
							/>
						</div>
						{onCopyApiKey && (
							<Button
								variant="ghost"
								size="icon-sm"
								onClick={onCopyApiKey}
								title={labels.copyApiKey}
								aria-label={labels.copyApiKey}
							>
								<span className="icon-[mdi--content-copy] h-3.5 w-3.5" />
							</Button>
						)}
					</div>
				</div>
				<div className="col-span-2">
					<label htmlFor={`${formId}-customHeaders`} className="mb-1 block text-[11px] text-muted-foreground">
						{labels.customHeaders}
					</label>
					<textarea
						id={`${formId}-customHeaders`}
						aria-label={labels.customHeaders}
						value={form.headers}
						onChange={(event) => onChange({ headers: event.target.value })}
						placeholder={"X-Custom-Header: value\nAuthorization: Bearer xxx"}
						rows={2}
						className="w-full resize-none rounded-lg border border-input bg-secondary px-3 py-2 font-mono text-[12px] text-foreground placeholder:text-muted-foreground/40 outline-none transition-colors hover:bg-accent focus:border-ring"
					/>
				</div>
				<div className="col-span-2">
					<CheckboxField
						checked={form.authHeader}
						onChange={(value) => onChange({ authHeader: value })}
						label={labels.useAuthHeader}
					/>
				</div>
			</div>
			<div className="mt-3 flex justify-end gap-2">
				<Button variant="ghost" size="sm" onClick={onCancel}>
					{labels.cancel}
				</Button>
				<Button variant="primary" size="sm" onClick={onSave} disabled={!form.name.trim() || saving}>
					{saveLabel}
				</Button>
			</div>
		</>
	);
}
