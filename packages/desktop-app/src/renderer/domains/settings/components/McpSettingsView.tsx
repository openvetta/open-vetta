import type { Button } from "@shared/components/ui/button";
type HostButton = typeof Button;
export type { HostButton as _HostPrimitiveHoldButton };
import { useTranslation } from "react-i18next";
import { SettingsAiAssist } from "../ai-assist";
import { BuiltinMcpSecretsDialog } from "./BuiltinMcpSecretsDialog";
import { McpDiscoverSection, McpInstalledList } from "./McpServerList";
import type { McpSettingsModel } from "./useMcpSettingsModel";

export function McpSettingsView({ model }: { model: McpSettingsModel }): JSX.Element {
	const { t } = useTranslation("settings");

	if (!model.config) {
		return (
			<div className="mx-auto w-full max-w-[680px] px-8 py-4">
				<h1 className="mb-2 text-[20px] font-bold text-foreground">{t("mcpTitle")}</h1>
				<p className="mb-6 text-[12px] text-muted-foreground">{t("mcpDescription")}</p>
				<div className="flex items-center justify-center py-16">
					<span className="text-[13px] text-muted-foreground">{t("loading")}</span>
				</div>
			</div>
		);
	}

	return (
		<div className="mx-auto w-full max-w-[680px] px-8 py-4 pb-10">
			<div className="mb-6">
				<div className="mb-1 flex flex-wrap items-center justify-between gap-3">
					<h1 className="text-[20px] font-bold text-foreground">{t("mcpTitle")}</h1>
					<SettingsAiAssist tabId="mcp" />
				</div>
				<p className="text-[12px] leading-relaxed text-muted-foreground">{t("mcpDescription")}</p>
			</div>

			<McpInstalledList model={model} />
			<McpDiscoverSection model={model} />

			<BuiltinMcpSecretsDialog
				open={model.secretsDialogPreset !== null}
				preset={model.secretsDialogPreset}
				initialValues={model.secretsDialogInitial}
				saving={model.saving || model.busyPresetName !== null}
				allowDefer={model.secretsDialogMode === "add"}
				onOpenChange={(open) => {
					if (!open) model.onCloseSecretsDialog();
				}}
				onConfirm={(values) => void model.onConfirmSecretsDialog(values)}
				onDefer={() => void model.onConfirmSecretsDialog({})}
			/>
		</div>
	);
}
