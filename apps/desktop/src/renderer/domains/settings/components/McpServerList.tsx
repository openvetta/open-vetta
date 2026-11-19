import { useTranslation } from "react-i18next";
import { SETTINGS_SECTION } from "../registry";
import { McpServerRow } from "./McpServerRow";
import type { McpSettingsModel } from "./useMcpSettingsModel";

const MCP_GRID_CLASS = "grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2.5";

/** 已添加 MCP 宫格：连接器由内置预设或手动添加产生。 */
export function McpStorePanel({ model }: { model: McpSettingsModel }): JSX.Element {
	const { t } = useTranslation("settings");
	const names = model.serverNames;
	const section = SETTINGS_SECTION["mcp-server-list-builtin"];

	return (
		<section
			id={section.id}
			data-setting-section-id={section.id}
			data-setting-section-highlight-target={section.id}
		>
			{names.length === 0 ? (
				<div className="rounded-xl bg-card px-5 py-10 text-center text-[12px] text-muted-foreground">
					{t("mcpStore.installedEmpty")}
				</div>
			) : (
				<div className={MCP_GRID_CLASS}>
					{names.map((name) => (
						<McpServerRow key={name} name={name} model={model} />
					))}
				</div>
			)}
		</section>
	);
}
