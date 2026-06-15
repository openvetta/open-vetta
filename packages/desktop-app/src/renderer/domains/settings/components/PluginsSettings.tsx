import { useEffect, useMemo, useState } from "react";
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

type ValuesByPlugin = Record<string, Record<string, unknown>>;

/**
 * Renders a settings form for every installed plugin that declares
 * `contributes.settings`. Fields are generated from the schema (VSCode-style);
 * values persist via window.vetta.plugins.setSettings, namespaced by plugin id.
 */
export function PluginsSettings(): JSX.Element {
	const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
	const [values, setValues] = useState<ValuesByPlugin>({});

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

	if (plugins.length === 0) {
		return (
			<div className="p-6 text-sm text-muted-foreground">暂无可配置的插件。安装声明了设置项的插件后会显示在这里。</div>
		);
	}

	return (
		<div className="flex flex-col gap-8 p-6">
			{plugins.map((plugin) => (
				<section key={plugin.id} className="flex flex-col gap-4">
					<header className="flex flex-col gap-0.5">
						<h3 className="text-sm font-medium text-foreground">{plugin.name}</h3>
						{plugin.description && <p className="text-xs text-muted-foreground">{plugin.description}</p>}
					</header>
					<div className="flex flex-col gap-4">
						{(plugin.settingsSchema ?? []).map((setting) => (
							<SettingField
								key={setting.key}
								setting={setting}
								value={values[plugin.id]?.[setting.key]}
								onChange={(value) => update(plugin.id, setting.key, value)}
							/>
						))}
					</div>
				</section>
			))}
		</div>
	);
}

function SettingField({
	setting,
	value,
	onChange,
}: {
	setting: PluginSettingSchema;
	value: unknown;
	onChange: (value: unknown) => void;
}): JSX.Element {
	const control = useMemo(() => renderControl(setting, value, onChange), [setting, value, onChange]);
	const inline = setting.type === "boolean";
	return (
		<div className={inline ? "flex items-center justify-between gap-4" : "flex flex-col gap-1.5"}>
			<div className="flex flex-col gap-0.5">
				<label className="text-sm text-foreground">{setting.title}</label>
				{setting.description && <span className="text-xs text-muted-foreground">{setting.description}</span>}
			</div>
			{control}
		</div>
	);
}

function renderControl(
	setting: PluginSettingSchema,
	value: unknown,
	onChange: (value: unknown) => void,
): JSX.Element {
	switch (setting.type) {
		case "boolean":
			return <Switch checked={value === true} onCheckedChange={(checked) => onChange(checked)} />;
		case "number":
			return (
				<Input
					type="number"
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
					value={typeof value === "string" ? value : ""}
					onChange={(event) => onChange(event.target.value)}
				/>
			);
		case "enum":
			return (
				<Select value={typeof value === "string" ? value : ""} onValueChange={(next) => onChange(next)}>
					<SelectTrigger className="w-full">
						<SelectValue placeholder="请选择" />
					</SelectTrigger>
					<SelectContent>
						{(setting.enum ?? []).map((option) => (
							<SelectItem key={option} value={option}>
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
					value={typeof value === "string" ? value : ""}
					onChange={(event) => onChange(event.target.value)}
				/>
			);
	}
}
