import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { BuiltinMcpSectionView } from "@vetta/theme-ui/settings";
import {
	BUILTIN_MCP_PRESETS,
	builtinMcpIconUrl,
	type BuiltinMcpPreset,
	presetRequiresSecrets,
} from "../mcp/builtin-mcp-presets";
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
	/** discover：展示全部推荐（含已添加，卡片标「已添加」） */
	variant?: "full" | "discover";
}): JSX.Element {
	const { t } = useTranslation("settings");
	const items = useMemo(
		() =>
			BUILTIN_MCP_PRESETS.map((preset) => ({
				id: String(preset.id),
				name: preset.name,
				displayName: t(preset.displayNameKey),
				description: t(preset.descriptionKey),
				iconUrl: builtinMcpIconUrl(preset.iconFile),
				needsKey: presetRequiresSecrets(preset),
			})),
		[t],
	);

	const byName = useMemo(() => {
		const map = new Map(BUILTIN_MCP_PRESETS.map((preset) => [preset.name, preset]));
		return map;
	}, []);

	return (
		<BuiltinMcpSectionView
			items={items}
			addedNames={addedNames}
			busyName={busyName}
			variant={variant}
			section={SETTINGS_SECTION["mcp-builtin-available"]}
			labels={{
				listTitle: t("section_mcp-builtin-list"),
				sectionHint: t("mcpPresets.sectionHint"),
				allAdded: t("mcpStore.recommendedAllAdded"),
				added: t("added"),
				processing: t("processing"),
				connect: t("mcpPresets.connect"),
				add: t("add"),
				remove: t("remove"),
			}}
			onAdd={(name) => {
				const preset = byName.get(name);
				if (preset) void onAdd(preset);
			}}
			onRemove={(name) => void onRemove(name)}
		/>
	);
}
