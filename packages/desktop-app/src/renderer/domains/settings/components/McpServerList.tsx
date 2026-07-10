import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@shared/components/ui/button";
import { SegmentedControl } from "@shared/components/ui/segmented-control";
import { BuiltinMcpSection } from "./BuiltinMcpSection";
import { McpServerForm } from "./McpServerForm";
import { McpServerRow } from "./McpServerRow";
import {
	RemoteMcpDiscoverList,
	RemoteMcpRefreshButton,
	useRemoteMcpSectionModel,
} from "./RemoteMcpSection";
import { SettingSection } from "./shared";
import { SETTINGS_SECTION } from "../registry";
import type { McpSettingsModel } from "./useMcpSettingsModel";

type McpDiscoverTab = "recommended" | "remote" | "manual";

/** 商店式：已安装（全部已添加 MCP） */
export function McpInstalledList({ model }: { model: McpSettingsModel }): JSX.Element {
	const { t } = useTranslation("settings");
	const names = model.serverNames;

	return (
		<section>
			<SettingSection section={SETTINGS_SECTION["mcp-server-list-builtin"]} title="">
				{names.length === 0 ? (
					<div className="px-5 py-6 text-center text-[12px] text-muted-foreground">{t("mcpStore.installedEmpty")}</div>
				) : (
					names.map((name) => <McpServerRow key={name} name={name} model={model} />)
				)}
			</SettingSection>
		</section>
	);
}

/** 商店式：发现 / 添加（仅展示尚未添加的项） */
export function McpDiscoverSection({ model }: { model: McpSettingsModel }): JSX.Element {
	const { t } = useTranslation("settings");
	const [tab, setTab] = useState<McpDiscoverTab>("recommended");
	const remoteModel = useRemoteMcpSectionModel({
		onAdd: model.onAddRemoteServer,
		onRemove: model.onRemoveRemoteServer,
	});

	return (
		<section className="mt-8">
			<div className="mb-3 flex flex-wrap items-center justify-between gap-3">
				<div className="min-w-0">
					<div className="text-[15px] font-semibold text-foreground">{t("mcpStore.discoverTitle")}</div>
					<p className="mt-0.5 text-[11px] text-muted-foreground">{t("mcpStore.discoverHint")}</p>
				</div>
				<div className="flex shrink-0 items-center gap-1.5">
					{tab === "remote" && <RemoteMcpRefreshButton model={remoteModel} />}
					<SegmentedControl
						items={[
							{ key: "recommended" as McpDiscoverTab, label: t("mcpStore.tabRecommended") },
							{ key: "remote" as McpDiscoverTab, label: t("mcpStore.tabRemote") },
							{ key: "manual" as McpDiscoverTab, label: t("mcpStore.tabManual") },
						]}
						value={tab}
						onChange={(next) => {
							setTab(next);
							if (next !== "manual" && model.addingServer) {
								model.onCancelAddServer();
							}
							if (next === "manual" && !model.addingServer) {
								model.onStartAddServer();
							}
						}}
					/>
				</div>
			</div>

			{tab === "recommended" && (
				<BuiltinMcpSection
					variant="discover"
					addedNames={model.addedServerNames}
					onAdd={model.onAddBuiltinServer}
					onRemove={model.onRemoveRemoteServer}
					busyName={model.busyPresetName}
				/>
			)}

			{tab === "remote" && (
				<RemoteMcpDiscoverList model={remoteModel} addedNames={model.addedServerNames} />
			)}

			{tab === "manual" && (
				<SettingSection section={SETTINGS_SECTION["mcp-server-list"]} title="">
					<div className="px-5 py-4">
						<p className="mb-3 text-[11px] text-muted-foreground">{t("mcpStore.manualHint")}</p>
						{model.addingServer ? (
							<McpServerForm
								form={model.serverForm}
								setForm={model.setServerForm}
								onSave={() => void model.onAddServer()}
								onCancel={() => {
									model.onCancelAddServer();
									setTab("recommended");
								}}
								saving={model.saving}
								saveLabel={t("addServer")}
							/>
						) : (
							<Button variant="outline" size="sm" onClick={model.onStartAddServer}>
								<span className="icon-[mdi--plus] h-3.5 w-3.5" />
								{t("addMcpServer")}
							</Button>
						)}
					</div>
				</SettingSection>
			)}
		</section>
	);
}
