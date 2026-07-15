import { PluginCardView } from "@vetta/theme-ui/skills";
import { useTranslation } from "react-i18next";
import { usePluginI18n } from "../../plugins/runtime/plugin-i18n";
import type { PluginRow } from "../hooks/usePluginsPanelModel";

export function PluginCard({
	row,
	installing,
	onSelect,
	onInstall,
}: {
	row: PluginRow;
	installing: boolean;
	onSelect: (row: PluginRow) => void;
	onInstall: (row: PluginRow) => void;
}): JSX.Element {
	const isInstalled = row.installed !== null;
	const isSystem = row.installed?.source === "system";
	// archive = 本地 zip 导入或 plugin-workbench install-from-path
	const isCustom = row.installed?.source === "archive";
	const enabled = row.installed?.enabled ?? false;
	const tr = usePluginI18n();
	const { t } = useTranslation("skills");
	const name = tr(row.installed ?? undefined, row.name);
	const description = tr(row.installed ?? undefined, row.description);

	return (
		<PluginCardView
			model={{
				author: row.author,
				description,
				downloadCount: row.downloadCount,
				enabled,
				installing,
				isInstalled,
				isSystem,
				isCustom,
				name,
				needsUpdate: Boolean(row.needsUpdate),
				noDescription: t("card.noDescription"),
				notInstalledLabel: t("plugin.status.notInstalled"),
				statusEnabled: t("plugin.status.enabled"),
				statusDisabled: t("plugin.status.disabled"),
				systemBadge: t("plugin.badge.system"),
				customBadge: t("plugin.badge.custom"),
				updatableBadge: row.needsUpdate
					? t("plugin.badge.updatable", { version: row.market?.version })
					: undefined,
				version: row.version,
				installLabel: t("actions.install"),
			}}
			onSelect={() => onSelect(row)}
			onInstall={() => onInstall(row)}
		/>
	);
}
