import { useEffect, useState } from "react";
import type { InstalledPlugin, PluginSettingSchema } from "@preload/api";
import { Input } from "@shared/components/ui/input";
import { Switch } from "@shared/components/ui/switch";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@shared/components/ui/select";
import { cn } from "@shared/lib/utils";
import { openExternalLink } from "@shared/lib/open-external-link";
import type { SettingsSectionRegistration } from "../registry";
import { usePluginI18n } from "../../plugins/runtime/plugin-i18n";
import { SettingRow, SettingSection } from "./shared";

type ValuesByPlugin = Record<string, Record<string, unknown>>;

/**
 * Renders a settings form for every installed plugin that declares
 * `contributes.settings`. Each plugin gets its own SettingSection; fields are
 * generated from the schema (VSCode-style) and rendered as standard SettingRows.
 * Values persist via window.vetta.plugins.setSettings, namespaced by plugin id.
 */
export function PluginsSettings(): JSX.Element {
	const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
	const [values, setValues] = useState<ValuesByPlugin>({});
	const tr = usePluginI18n();

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			const all = await window.vetta.plugins.list();
			const configurable = all.filter((plugin) => (plugin.settingsSchema?.length ?? 0) > 0);
			if (cancelled) return;
			setPlugins(configurable);
			const entries = await Promise.all(
				configurable.map(async (plugin) => [plugin.id, await window.vetta.plugins.getSettings(plugin.id)] as const),
			);
			if (cancelled) return;
			setValues(Object.fromEntries(entries));
		})();
		const unsub = window.vetta.plugins.onSettingsChanged(({ pluginId, values: next }) => {
			setValues((prev) => ({ ...prev, [pluginId]: next }));
		});
		return () => {
			cancelled = true;
			unsub();
		};
	}, []);

	const update = (pluginId: string, key: string, value: unknown): void => {
		setValues((prev) => ({ ...prev, [pluginId]: { ...prev[pluginId], [key]: value } }));
		void window.vetta.plugins.setSettings(pluginId, { [key]: value });
	};

	return (
		<div className="mx-auto w-full max-w-[680px] px-8 py-4">
			<h1 className="mb-6 text-[20px] font-bold text-foreground">插件设置</h1>

			{plugins.length === 0 ? (
				<div className="rounded-xl border border-border bg-muted px-5 py-4 text-[12px] text-muted-foreground">
					暂无可配置的插件。安装声明了设置项的插件后会显示在这里。
				</div>
			) : (
				plugins.map((plugin) => {
					const pluginValues = values[plugin.id] ?? {};
					const visible = (plugin.settingsSchema ?? []).filter((setting) =>
						isSettingVisible(setting, pluginValues),
					);
					const section: SettingsSectionRegistration = {
						id: `plugin-${plugin.id}`,
						tab: "plugins",
						title: tr(plugin, plugin.name),
					};
					return (
						<SettingSection
							key={plugin.id}
							section={section}
							description={plugin.description ? tr(plugin, plugin.description) : undefined}
						>
							{visible.map((setting, index) => {
								const border = index < visible.length - 1;
								if (setting.type === "desc") {
									return (
										<DescRow
											key={setting.key}
											title={setting.title ? tr(plugin, setting.title) : undefined}
											description={setting.description ? tr(plugin, setting.description) : ""}
											border={border}
										/>
									);
								}
								return (
									<SettingRow
										key={setting.key}
										title={tr(plugin, setting.title)}
										description={setting.description ? tr(plugin, setting.description) : undefined}
										border={border}
									>
										<SettingControl
											setting={setting}
											value={pluginValues[setting.key]}
											onChange={(value) => update(plugin.id, setting.key, value)}
										/>
									</SettingRow>
								);
							})}
						</SettingSection>
					);
				})
			)}
		</div>
	);
}

// Split text into plain segments and http(s) URLs so URLs can render as links.
const URL_PATTERN = /(https?:\/\/[^\s]+)/g;

/** Render a `desc` item: read-only note text with any URLs as clickable external links. */
function DescRow({
	title,
	description,
	border,
}: {
	title: string | undefined;
	description: string;
	border: boolean;
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

/** A field is hidden when its `visibleWhen` condition does not match the current values. */
function isSettingVisible(setting: PluginSettingSchema, values: Record<string, unknown>): boolean {
	const condition = setting.visibleWhen;
	if (!condition) return true;
	const current = values[condition.key];
	return typeof current === "string" && condition.in.includes(current);
}

function SettingControl({
	setting,
	value,
	onChange,
}: {
	setting: PluginSettingSchema;
	value: unknown;
	onChange: (value: unknown) => void;
}): JSX.Element {
	switch (setting.type) {
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
						<SelectValue placeholder="请选择" />
					</SelectTrigger>
					<SelectContent>
						{(setting.enum ?? []).map((option) => (
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
