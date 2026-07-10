import { useTranslation } from "react-i18next";
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
				<h1 className="text-[20px] font-bold text-foreground">{t("mcpTitle")}</h1>
				<p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{t("mcpDescription")}</p>
				<div className="mt-3 flex gap-2 rounded-xl border border-border/50 bg-card/40 px-3.5 py-3">
					<span className="icon-[mdi--lightbulb-on-outline] mt-0.5 h-4 w-4 shrink-0 text-primary" />
					<p className="text-[12px] leading-relaxed text-muted-foreground">{t("mcpStore.aiHelpHint")}</p>
				</div>
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
