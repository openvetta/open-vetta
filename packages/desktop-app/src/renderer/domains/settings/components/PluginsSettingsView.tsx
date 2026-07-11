import { Input } from "@shared/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@shared/components/ui/select";
import { Switch } from "@shared/components/ui/switch";
import { cn } from "@shared/lib/utils";
import { openExternalLink } from "@shared/lib/open-external-link";
import { SettingsAiAssist } from "../ai-assist";
import type { PluginSettingFieldModel, PluginsSettingsModel } from "./usePluginsSettingsModel";
import { SettingRow, SettingSection } from "./shared";

const URL_PATTERN = /(https?:\/\/[^\s]+)/g;

function DescRow({
	title,
	description,
	border,
}: {
	border: boolean;
	description: string;
	title: string | undefined;
}): JSX.Element {
	const parts = description.split(URL_PATTERN);
	return (
		<div className={cn("px-5 py-4", border && "border-b border-border")}>
			{title && <div className="mb-0.5 text-[13px] font-medium text-foreground">{title}</div>}
			<div className="text-[12px] leading-relaxed text-muted-foreground">
				{parts.map((part, index) =>
					/^https?:\/\//.test(part) ? (
						<a
							// biome-ignore lint/suspicious/noArrayIndexKey: split segments are positional and stable
							key={index}
							href={part}
							onClick={(event) => openExternalLink(event, part)}
							className="text-primary underline underline-offset-2 hover:opacity-80"
						>
							{part}
						</a>
					) : (
						// biome-ignore lint/suspicious/noArrayIndexKey: split segments are positional and stable
						<span key={index}>{part}</span>
					),
				)}
			</div>
		</div>
	);
}

function SettingControl({
	field,
	onChange,
	pleaseSelect,
}: {
	field: PluginSettingFieldModel;
	onChange: (value: unknown) => void;
	pleaseSelect: string;
}): JSX.Element {
	const { schema, value } = field;
	switch (schema.type) {
		case "boolean":
			return <Switch checked={value === true} onCheckedChange={(checked) => onChange(checked)} />;
		case "number":
			return (
				<Input
					type="number"
					className="h-8 w-[200px] text-[12px] @max-xl:w-full"
					value={value === undefined || value === null ? "" : String(value)}
					onChange={(event) => {
						const raw = event.target.value;
						onChange(raw === "" ? undefined : Number(raw));
					}}
				/>
			);
		case "secret":
			return (
				<Input
					type="password"
					autoComplete="off"
					className="h-8 w-[240px] text-[12px] @max-xl:w-full"
					value={typeof value === "string" ? value : ""}
					onChange={(event) => onChange(event.target.value)}
				/>
			);
		case "enum":
			return (
				<Select value={typeof value === "string" ? value : ""} onValueChange={(next) => onChange(next)}>
					<SelectTrigger size="sm" className="h-8 min-w-[160px] text-[12px] @max-xl:w-full">
						<SelectValue placeholder={pleaseSelect} />
					</SelectTrigger>
					<SelectContent>
						{(schema.enum ?? []).map((option) => (
							<SelectItem key={option} value={option} className="text-[12px]">
								{option}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			);
		default:
			return (
				<Input
					type="text"
					className="h-8 w-[240px] text-[12px] @max-xl:w-full"
					value={typeof value === "string" ? value : ""}
					onChange={(event) => onChange(event.target.value)}
				/>
			);
	}
}

function PluginSettingsSection({
	model,
	section,
}: {
	model: PluginsSettingsModel;
	section: PluginsSettingsModel["sections"][number];
}): JSX.Element {
	return (
		<SettingSection section={section.section} description={section.description}>
			{section.fields.map((field) => {
				if (field.schema.type === "desc") {
					return (
						<DescRow
							key={field.schema.key}
							title={field.title}
							description={field.description ?? ""}
							border={field.border}
						/>
					);
				}
				return (
					<SettingRow
						key={field.schema.key}
						title={field.title ?? ""}
						description={field.description}
						border={field.border}
					>
						<SettingControl
							field={field}
							pleaseSelect={model.labels.pleaseSelect}
							onChange={(value) => model.actions.update(section.pluginId, field.schema.key, value)}
						/>
					</SettingRow>
				);
			})}
		</SettingSection>
	);
}

export function PluginsSettingsView({ model }: { model: PluginsSettingsModel }): JSX.Element {
	return (
		<div className="mx-auto w-full max-w-[680px] px-8 py-4">
			<div className="mb-6 flex flex-wrap items-center justify-between gap-3">
				<h1 className="text-[20px] font-bold text-foreground">{model.labels.title}</h1>
				<SettingsAiAssist tabId="plugins" />
			</div>

			{model.sections.length === 0 ? (
				<div className="rounded-xl border border-border bg-muted px-5 py-4 text-[12px] text-muted-foreground">
					{model.labels.noPlugin}
				</div>
			) : (
				model.sections.map((section) => (
					<PluginSettingsSection key={section.pluginId} model={model} section={section} />
				))
			)}
		</div>
	);
}
