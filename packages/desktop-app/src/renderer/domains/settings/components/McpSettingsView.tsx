import { useTranslation } from "react-i18next";
import { Button } from "@shared/components/ui/button";
import { SegmentedControl } from "@shared/components/ui/segmented-control";
import { McpJsonEditor } from "./McpJsonEditor";
import { McpServerList } from "./McpServerList";
import { RemoteMcpSection } from "./RemoteMcpSection";
import type { McpEditMode, McpSettingsModel } from "./useMcpSettingsModel";

export function McpSettingsView({ model }: { model: McpSettingsModel }): JSX.Element {
	const { t } = useTranslation("settings");

	if (!model.config) {
		return (
			<div className="mx-auto w-full max-w-[680px] px-8 py-4">
				<h1 className="mb-6 text-[20px] font-bold text-foreground">{t("title")}</h1>
				<div className="flex items-center justify-center py-16">
					<span className="text-[13px] text-muted-foreground">{t("loading")}</span>
				</div>
			</div>
		);
	}

	return (
		<div className="mx-auto w-full max-w-[680px] px-8 py-4">
			<div className="mb-6 flex items-center justify-between">
				<h1 className="text-[20px] font-bold text-foreground">{t("title")}</h1>
				<SegmentedControl
					items={[
						{ key: "visual" as McpEditMode, label: t("viewMode"), icon: "icon-[mdi--view-list-outline]" },
						{ key: "json" as McpEditMode, label: "JSON", icon: "icon-[mdi--code-json]" },
					]}
					value={model.mode}
					onChange={model.onModeSwitch}
				/>
			</div>

			{model.mode === "visual" ? (
				<>
					<McpServerList model={model} />
					{!model.addingServer && (
						<Button
							variant="outline"
							onClick={model.onStartAddServer}
							className="flex w-full justify-center border-dashed py-3"
						>
							<span className="icon-[mdi--plus] h-4 w-4" />
							{t("addMcpServer")}
						</Button>
					)}
				</>
			) : (
				<McpJsonEditor model={model} />
			)}

			{model.mode === "visual" && (
				<RemoteMcpSection
					addedNames={model.addedServerNames}
					onAdd={model.onAddRemoteServer}
					onRemove={model.onRemoveRemoteServer}
				/>
			)}

			<div className="mt-6 text-center text-[11px] text-muted-foreground/60">
				{t("configFilePath")}: ~/.vetta/agent/mcp.json
			</div>
		</div>
	);
}
