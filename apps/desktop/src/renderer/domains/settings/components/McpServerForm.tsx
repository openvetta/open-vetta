import { SegmentedControl } from "@shared/components/ui/segmented-control";
import { cn } from "@shared/lib/utils";
import { CheckboxField, InputField, TextareaField } from "@vetta-org/theme-ui/settings";
import { Button } from "@vetta-org/ui";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { isMcpFormValid, type McpServerFormState, type McpTransportType } from "./useMcpSettingsModel";

export function McpServerForm({
	form,
	setForm,
	onSave,
	onCancel,
	saving,
	saveLabel,
}: {
	form: McpServerFormState;
	setForm: React.Dispatch<React.SetStateAction<McpServerFormState>>;
	onSave: () => void;
	onCancel: () => void;
	saving: boolean;
	saveLabel: string;
}): JSX.Element {
	const { t } = useTranslation("settings");
	const formId = useId();
	const [advancedOpen, setAdvancedOpen] = useState(() => hasAdvancedValues(form));

	return (
		<>
			<div className="grid grid-cols-2 gap-3">
				<div className={form.transport === "http" ? "col-span-2" : undefined}>
					<label htmlFor={`${formId}-serverName`} className="mb-1 block text-[11px] text-muted-foreground">
						{t("serverName")} *
					</label>
					<InputField
						id={`${formId}-serverName`}
						aria-label={t("serverName")}
						value={form.name}
						onChange={(value) => setForm((current) => ({ ...current, name: value }))}
						placeholder="e.g. playwright"
					/>
				</div>
				{form.transport === "stdio" ? (
					<StdioBasicFields form={form} setForm={setForm} />
				) : (
					<HttpBasicFields form={form} setForm={setForm} />
				)}
			</div>

			<div className="mt-3">
				<button
					type="button"
					onClick={() => setAdvancedOpen((open) => !open)}
					aria-expanded={advancedOpen}
					className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
				>
					<span
						className={cn(
							"icon-[mdi--chevron-right] h-3.5 w-3.5 transition-transform",
							advancedOpen && "rotate-90",
						)}
					/>
					{t("advancedOptions")}
				</button>

				{advancedOpen && (
					<div className="mt-3 grid grid-cols-2 gap-3 border-t border-border/50 pt-3">
						<fieldset className="col-span-2 min-w-0">
							<legend className="mb-1 block text-[11px] text-muted-foreground">{t("transportType")}</legend>
							<SegmentedControl
								items={[
									{ key: "stdio" as McpTransportType, label: t("stdio") },
									{ key: "http" as McpTransportType, label: "HTTP" },
								]}
								value={form.transport}
								onChange={(transport) => setForm((current) => ({ ...current, transport }))}
							/>
						</fieldset>
						{form.transport === "stdio" ? (
							<StdioAdvancedFields form={form} setForm={setForm} />
						) : (
							<HttpAdvancedFields form={form} setForm={setForm} />
						)}
						<div>
							<label
								htmlFor={`${formId}-startupTimeout`}
								className="mb-1 block text-[11px] text-muted-foreground"
							>
								{t("startupTimeout")}
							</label>
							<InputField
								id={`${formId}-startupTimeout`}
								aria-label={t("startupTimeout")}
								value={form.startupTimeout}
								onChange={(value) => setForm((current) => ({ ...current, startupTimeout: value }))}
								placeholder={t("default10000")}
							/>
						</div>
						<div className="col-span-2">
							<label
								htmlFor={`${formId}-autoApproveTools`}
								className="mb-1 block text-[11px] text-muted-foreground"
							>
								{t("autoApproveTools")}
							</label>
							<InputField
								id={`${formId}-autoApproveTools`}
								aria-label={t("autoApproveTools")}
								value={form.autoApprove}
								onChange={(value) => setForm((current) => ({ ...current, autoApprove: value }))}
								placeholder="e.g. read_file, list_directory"
							/>
						</div>
						<div className="col-span-2 flex items-center gap-6">
							<CheckboxField
								checked={form.disabled}
								onChange={(value) => setForm((current) => ({ ...current, disabled: value }))}
								label={t("disable")}
							/>
							<CheckboxField
								checked={form.debug}
								onChange={(value) => setForm((current) => ({ ...current, debug: value }))}
								label={t("debugMode")}
							/>
						</div>
					</div>
				)}
			</div>

			<div className="mt-3 flex justify-end gap-2">
				<Button variant="ghost" size="sm" onClick={onCancel}>
					{t("cancel")}
				</Button>
				<Button variant="primary" size="sm" onClick={onSave} disabled={!isMcpFormValid(form) || saving}>
					{saveLabel}
				</Button>
			</div>
		</>
	);
}

function hasAdvancedValues(form: McpServerFormState): boolean {
	return Boolean(
		form.transport === "http" ||
			form.env.trim() ||
			form.cwd.trim() ||
			form.headers.trim() ||
			form.autoApprove.trim() ||
			form.startupTimeout.trim() ||
			form.disabled ||
			form.debug,
	);
}

function StdioBasicFields({
	form,
	setForm,
}: {
	form: McpServerFormState;
	setForm: React.Dispatch<React.SetStateAction<McpServerFormState>>;
}): JSX.Element {
	const { t } = useTranslation("settings");
	const formId = useId();
	return (
		<>
			<div>
				<label htmlFor={`${formId}-command`} className="mb-1 block text-[11px] text-muted-foreground">
					{t("command")} *
				</label>
				<InputField
					id={`${formId}-command`}
					aria-label={t("command")}
					value={form.command}
					onChange={(value) => setForm((current) => ({ ...current, command: value }))}
					placeholder="e.g. npx, node, uvx"
				/>
			</div>
			<div className="col-span-2">
				<label htmlFor={`${formId}-arguments`} className="mb-1 block text-[11px] text-muted-foreground">
					{t("arguments")}
				</label>
				<InputField
					id={`${formId}-arguments`}
					aria-label={t("arguments")}
					value={form.args}
					onChange={(value) => setForm((current) => ({ ...current, args: value }))}
					placeholder="e.g. -y, @playwright/mcp@latest"
				/>
			</div>
		</>
	);
}

function StdioAdvancedFields({
	form,
	setForm,
}: {
	form: McpServerFormState;
	setForm: React.Dispatch<React.SetStateAction<McpServerFormState>>;
}): JSX.Element {
	const { t } = useTranslation("settings");
	const formId = useId();
	return (
		<>
			<div className="col-span-2">
				<label htmlFor={`${formId}-envVariables`} className="mb-1 block text-[11px] text-muted-foreground">
					{t("envVariables")}
				</label>
				<TextareaField
					id={`${formId}-envVariables`}
					aria-label={t("envVariables")}
					value={form.env}
					onChange={(value) => setForm((current) => ({ ...current, env: value }))}
					placeholder={`GITHUB_TOKEN=\${GITHUB_TOKEN}\nNODE_ENV=production`}
					rows={3}
				/>
			</div>
			<div className="col-span-2">
				<label htmlFor={`${formId}-workDirectory`} className="mb-1 block text-[11px] text-muted-foreground">
					{t("workDirectory")}
				</label>
				<InputField
					id={`${formId}-workDirectory`}
					aria-label={t("workDirectory")}
					value={form.cwd}
					onChange={(value) => setForm((current) => ({ ...current, cwd: value }))}
					placeholder="e.g. ${PROJECT_ROOT}"
				/>
			</div>
		</>
	);
}

function HttpBasicFields({
	form,
	setForm,
}: {
	form: McpServerFormState;
	setForm: React.Dispatch<React.SetStateAction<McpServerFormState>>;
}): JSX.Element {
	const { t } = useTranslation("settings");
	const formId = useId();
	return (
		<div className="col-span-2">
			<label htmlFor={`${formId}-sseUrl`} className="mb-1 block text-[11px] text-muted-foreground">
				{t("sseUrl")} *
			</label>
			<InputField
				id={`${formId}-sseUrl`}
				aria-label={t("sseUrl")}
				value={form.url}
				onChange={(value) => setForm((current) => ({ ...current, url: value }))}
				placeholder="e.g. https://mcp.exa.ai/mcp"
			/>
		</div>
	);
}

function HttpAdvancedFields({
	form,
	setForm,
}: {
	form: McpServerFormState;
	setForm: React.Dispatch<React.SetStateAction<McpServerFormState>>;
}): JSX.Element {
	const { t } = useTranslation("settings");
	const formId = useId();
	return (
		<div className="col-span-2">
			<label htmlFor={`${formId}-requestHeaders`} className="mb-1 block text-[11px] text-muted-foreground">
				{t("requestHeaders")}
			</label>
			<TextareaField
				id={`${formId}-requestHeaders`}
				aria-label={t("requestHeaders")}
				value={form.headers}
				onChange={(value) => setForm((current) => ({ ...current, headers: value }))}
				placeholder={`Authorization=Bearer \${EXA_TOKEN}`}
				rows={2}
			/>
		</div>
	);
}
