import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@shared/components/ui/button";
import {
	BUILTIN_MCP_PRESETS,
	builtinMcpIconUrl,
	type BuiltinMcpPreset,
	presetRequiresSecrets,
} from "../mcp/builtin-mcp-presets";
import { SettingSection } from "./shared";
import { SETTINGS_SECTION } from "../registry";

export function BuiltinMcpSection({
	addedNames,
	onAdd,
	onRemove,
	busyName,
	variant = "full",
}: {
	addedNames: Set<string>;
	onAdd: (preset: BuiltinMcpPreset) => Promise<void> | void;
	onRemove: (name: string) => Promise<void> | void;
	busyName: string | null;
	/** discover：只展示未添加项，仅「添加」 */
	variant?: "full" | "discover";
}): JSX.Element {
	const { t } = useTranslation("settings");
	const items = useMemo(() => {
		if (variant !== "discover") return [...BUILTIN_MCP_PRESETS];
		return BUILTIN_MCP_PRESETS.filter((preset) => !addedNames.has(preset.name));
	}, [addedNames, variant]);

	return (
		<div>
			{variant === "full" && (
				<div className="mb-3">
					<div className="text-[12px] font-medium text-foreground">{t("section_mcp-builtin-list")}</div>
					<p className="mt-0.5 text-[11px] text-muted-foreground">{t("mcpPresets.sectionHint")}</p>
				</div>
			)}

			<SettingSection section={SETTINGS_SECTION["mcp-builtin-available"]} title="">
				{items.length === 0 ? (
					<div className="px-5 py-8 text-center text-[12px] text-muted-foreground">
						{t("mcpStore.recommendedAllAdded")}
					</div>
				) : (
					items.map((preset) => (
						<BuiltinMcpRow
							key={preset.id}
							preset={preset}
							added={addedNames.has(preset.name)}
							busy={busyName === preset.name}
							discover={variant === "discover"}
							onAdd={onAdd}
							onRemove={onRemove}
						/>
					))
				)}
			</SettingSection>
		</div>
	);
}

function BuiltinMcpRow({
	preset,
	added,
	busy,
	discover,
	onAdd,
	onRemove,
}: {
	preset: BuiltinMcpPreset;
	added: boolean;
	busy: boolean;
	discover: boolean;
	onAdd: (preset: BuiltinMcpPreset) => Promise<void> | void;
	onRemove: (name: string) => Promise<void> | void;
}): JSX.Element {
	const { t } = useTranslation("settings");
	const [imgFailed, setImgFailed] = useState(false);
	const needsKey = presetRequiresSecrets(preset);

	return (
		<div className="flex items-start gap-3 border-b border-border px-5 py-3 last:border-b-0">
			{!imgFailed ? (
				<img
					src={builtinMcpIconUrl(preset.iconFile)}
					alt=""
					className="h-9 w-9 shrink-0 object-contain"
					onError={() => setImgFailed(true)}
				/>
			) : (
				<span className="icon-[mdi--puzzle-outline] h-9 w-9 shrink-0 text-muted-foreground" />
			)}
			<div className="min-w-0 flex-1">
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-[13px] font-medium text-foreground">{t(preset.displayNameKey)}</span>
					{!discover && added && (
						<span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-medium text-emerald-400">
							{t("added")}
						</span>
					)}
				</div>
				<p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{t(preset.descriptionKey)}</p>
			</div>
			{discover || !added ? (
				<Button variant="primary" size="sm" disabled={busy} onClick={() => void onAdd(preset)}>
					{busy ? t("processing") : needsKey ? t("mcpPresets.connect") : t("add")}
				</Button>
			) : (
				<Button variant="ghost" size="sm" disabled={busy} onClick={() => void onRemove(preset.name)}>
					{busy ? t("processing") : t("remove")}
				</Button>
			)}
		</div>
	);
}
