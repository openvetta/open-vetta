import { useTranslation } from "react-i18next";
import { Button } from "@shared/components/ui/button";
import { SegmentedControl } from "@shared/components/ui/segmented-control";
import { CheckboxField, InputField, TextareaField } from "./SettingsFormFields";
import {
	isMcpFormValid,
	type McpServerFormState,
	type McpTransportType,
} from "./useMcpSettingsModel";

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
	return (
		<>
			<div className="mb-3">
				<label className="mb-1 block text-[11px] text-muted-foreground">{t("transportType")}</label>
				<SegmentedControl
					items={[
						{ key: "stdio" as McpTransportType, label: t("stdio") },
						{ key: "http" as McpTransportType, label: "HTTP" },
					]}
					value={form.transport}
					onChange={(transport) => setForm((current) => ({ ...current, transport }))}
				/>
			</div>
			<div className="grid grid-cols-2 gap-3">
				<div className={form.transport === "http" ? "" : "col-span-1"}>
					<label className="mb-1 block text-[11px] text-muted-foreground">{t("serverName")} *</label>
					<InputField
						value={form.name}
						onChange={(value) => setForm((current) => ({ ...current, name: value }))}
						placeholder="e.g. filesystem"
					/>
				</div>
				{form.transport === "stdio" ? <StdioFields form={form} setForm={setForm} /> : <HttpFields form={form} setForm={setForm} />}
				<div>
					<label className="mb-1 block text-[11px] text-muted-foreground">{t("startupTimeout")}</label>
					<InputField
						value={form.startupTimeout}
						onChange={(value) => setForm((current) => ({ ...current, startupTimeout: value }))}
						placeholder={t("default10000")}
					/>
				</div>
				<div className="col-span-2">
					<label className="mb-1 block text-[11px] text-muted-foreground">{t("autoApproveTools")}</label>
					<InputField
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

function StdioFields({
	form,
	setForm,
}: {
	form: McpServerFormState;
	setForm: React.Dispatch<React.SetStateAction<McpServerFormState>>;
}): JSX.Element {
	const { t } = useTranslation("settings");
	return (
		<>
			<div>
				<label className="mb-1 block text-[11px] text-muted-foreground">{t("command")} *</label>
				<InputField
					value={form.command}
					onChange={(value) => setForm((current) => ({ ...current, command: value }))}
					placeholder="e.g. npx, node, uvx"
				/>
			</div>
			<div className="col-span-2">
				<label className="mb-1 block text-[11px] text-muted-foreground">{t("arguments")}</label>
				<InputField
					value={form.args}
					onChange={(value) => setForm((current) => ({ ...current, args: value }))}
					placeholder="e.g. -y, @modelcontextprotocol/server-filesystem, /path"
				/>
			</div>
			<div className="col-span-2">
				<label className="mb-1 block text-[11px] text-muted-foreground">{t("envVariables")}</label>
				<TextareaField
					value={form.env}
					onChange={(value) => setForm((current) => ({ ...current, env: value }))}
					placeholder={"GITHUB_TOKEN=${GITHUB_TOKEN}\nNODE_ENV=production"}
					rows={3}
				/>
			</div>
			<div>
				<label className="mb-1 block text-[11px] text-muted-foreground">{t("workDirectory")}</label>
				<InputField
					value={form.cwd}
					onChange={(value) => setForm((current) => ({ ...current, cwd: value }))}
					placeholder="e.g. ${PROJECT_ROOT}"
				/>
			</div>
		</>
	);
}

function HttpFields({
	form,
	setForm,
}: {
	form: McpServerFormState;
	setForm: React.Dispatch<React.SetStateAction<McpServerFormState>>;
}): JSX.Element {
	const { t } = useTranslation("settings");
	return (
		<>
			<div className="col-span-2">
				<label className="mb-1 block text-[11px] text-muted-foreground">{t("sseUrl")} *</label>
				<InputField
					value={form.url}
					onChange={(value) => setForm((current) => ({ ...current, url: value }))}
					placeholder="e.g. https://mcp.exa.ai/mcp"
				/>
			</div>
			<div className="col-span-2">
				<label className="mb-1 block text-[11px] text-muted-foreground">{t("requestHeaders")}</label>
				<TextareaField
					value={form.headers}
					onChange={(value) => setForm((current) => ({ ...current, headers: value }))}
					placeholder={"Authorization=Bearer ${EXA_TOKEN}"}
					rows={2}
				/>
			</div>
		</>
	);
}
