import { useTranslation } from "react-i18next";
import { ModelSelect } from "@shared/components/ModelSelect";
import { Button } from "@vetta/ui";
import { cn } from "@shared/lib/utils";
import { SettingsAiAssist } from "../ai-assist";
import { SettingHeading, SettingRow, SettingSection } from "@vetta/theme-ui/settings";
import { SETTINGS_SECTION } from "../registry";
import { ImChannelCard } from "./ImChannelCard";
import { ImFeishuDialog } from "./ImFeishuDialog";
import { ImLegacyImportBanner } from "./ImLegacyImportBanner";
import { ImLogDrawer } from "./ImLogDrawer";
import { ImStatusBadge } from "./ImStatusBadge";
import { WechatBindDialog } from "./WechatBindDialog";
import type { ImBridgeSettingsModel } from "./useImBridgeSettingsModel";

export function ImBridgeSettingsView({ model }: { model: ImBridgeSettingsModel }): JSX.Element {
	const { t } = useTranslation("settings");

	if (!model.config) {
		return (
			<div className="mx-auto w-full max-w-[680px] px-8 pt-2 pb-4">
				<h1 className="mb-6 text-[20px] font-bold text-foreground">Vetta Claw</h1>
				<div className="text-[13px] text-muted-foreground">{t("loadFailed")}</div>
			</div>
		);
	}

	return (
		<div className="mx-auto w-full max-w-[680px] px-8 pt-2 pb-4">
			<div className="mb-6 flex flex-wrap items-center justify-between gap-3">
				<h1 className="text-[20px] font-bold text-foreground">Vetta Claw</h1>
				<SettingsAiAssist tabId="im" />
			</div>

			{model.legacy?.hasLegacyData && (
				<ImLegacyImportBanner
					legacy={model.legacy}
					importing={model.importing}
					onImport={model.onImportLegacy}
					onSkip={model.onSkipLegacy}
				/>
			)}

			<SettingSection section={SETTINGS_SECTION["imbridge-toggle"]} title={t("section_imbridge-toggle")}>
				<SettingRow title={t("enableImBridge")} description={t("enableImBridgeDesc")} border={false}>
					<button
						type="button"
						role="switch"
						aria-checked={model.config.enabled}
						onClick={() => void model.onToggleEnabled(!model.config?.enabled)}
						disabled={model.saving}
						className={cn(
							"relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
							model.config.enabled ? "bg-primary" : "bg-muted-foreground/30",
						)}
					>
						<span
							className={cn(
								"inline-block h-3.5 w-3.5 transform rounded-full bg-background shadow transition-transform",
								model.config.enabled ? "translate-x-[18px]" : "translate-x-[3px]",
							)}
						/>
					</button>
				</SettingRow>
			</SettingSection>

			<SettingSection
				section={SETTINGS_SECTION["imbridge-model"]}
				title={t("dialogModel")}
				description={t("dialogModelDesc")}
			>
				<SettingRow title={t("modelSetting")} description={t("modelSettingDesc")}>
					<div className="flex flex-wrap items-center gap-2">
						<ModelSelect
							value={
								model.config.agentModel
									? `${model.config.agentModel.provider}/${model.config.agentModel.model}`
									: null
							}
							onChange={(key) => {
								if (!key) {
									void model.onPickModel(null);
									return;
								}
								const sep = key.indexOf("/");
								if (sep < 0) return;
								void model.onPickModel({ provider: key.slice(0, sep), model: key.slice(sep + 1) });
							}}
							allowClear
							disabled={model.saving}
							placeholder={t("notSet")}
							triggerClassName="min-w-[220px]"
							reasoning={
								model.config.agentModel
									? {
											value: model.config.agentModel.reasoningLevel,
											onChange: (level) => {
												const agentModel = model.config?.agentModel;
												if (agentModel) {
													void model.onPickModel({
														provider: agentModel.provider,
														model: agentModel.model,
														reasoningLevel: level,
													});
												}
											},
										}
									: undefined
							}
						/>
						<Button
							variant="outline"
							size="sm"
							onClick={() => void model.onProbeModel()}
							disabled={model.probing || !model.config.agentModel}
						>
							<span>{t("testConnect")}</span>
							{model.probing ? (
								<span className="icon-[mdi--loading] h-3.5 w-3.5 animate-spin" />
							) : model.probeResult?.ok ? (
								<span className="icon-[mdi--check] h-3.5 w-3.5 text-emerald-400" />
							) : model.probeResult && !model.probeResult.ok ? (
								<span className="icon-[mdi--close] h-3.5 w-3.5 text-destructive" />
							) : null}
						</Button>
					</div>
				</SettingRow>
			</SettingSection>

			<div className="mb-6">
				<div className="mb-3 flex items-baseline gap-2">
					<SettingHeading
						section={SETTINGS_SECTION["imbridge-channels"]}
						title={t("section_imbridge-channels")}
					/>
					<span className="text-[12px] text-muted-foreground">{t("channelsCount")}</span>
				</div>
				<div className="grid grid-cols-2 gap-3">
					<ImChannelCard
						name={t("feishuName")}
						subtitle={t("feishuSubtitle")}
						iconClass="icon-[mdi--message-text] text-primary"
						configured={Boolean(model.config.feishu.appId)}
						isActive={model.config.transport === "feishu"}
						transportStatus={model.transportStatus}
						actionLabel={t("feishuSetting")}
						onAction={model.onOpenFeishuDialog}
						onActivate={
							model.config.transport === "feishu" ? undefined : () => void model.onSwitchTransport("feishu")
						}
					/>
					<ImChannelCard
						name={t("wechatName")}
						subtitle={
							model.config.wechat.bound
								? `${t("bound")} (${model.config.wechat.ilinkBotId ?? "iLink"})`
								: t("wechatSubtitle")
						}
						iconClass="icon-[mdi--wechat] text-emerald-400"
						configured={model.config.wechat.bound}
						isActive={model.config.transport === "wechat"}
						transportStatus={model.transportStatus}
						actionLabel={model.config.wechat.bound ? t("wechatManage") : t("wechatBind")}
						onAction={model.onOpenWechatDialog}
						onActivate={
							model.config.transport === "wechat" ? undefined : () => void model.onSwitchTransport("wechat")
						}
					/>
				</div>
			</div>

			<ImFeishuDialog model={model} />
			<WechatBindDialog
				open={model.wechatDialogOpen}
				onOpenChange={model.setWechatDialogOpen}
				bound={model.config.wechat.bound}
				ilinkBotId={model.config.wechat.ilinkBotId}
				ilinkUserId={model.config.wechat.ilinkUserId}
				onLogout={() => void model.onWechatLogout()}
				onConfirmedRefresh={model.onWechatConfirmedRefresh}
			/>

			<SettingSection
				section={SETTINGS_SECTION["imbridge-status"]}
				title={
					<div className="flex items-center justify-between">
						<span>{t("statusLog")}</span>
						<ImStatusBadge status={model.transportStatus} />
					</div>
				}
			>
				<SettingRow title={t("bridgePid")} description={t("bridgePidDesc")}>
					<span className="text-[13px] tabular-nums text-muted-foreground">{model.status?.sidecarPid ?? "—"}</span>
				</SettingRow>
				{model.status?.lastError && (
					<SettingRow title={t("lastError")} description={model.status.lastErrorAt ?? ""}>
						<span className="text-[12px] text-destructive">{model.status.lastError}</span>
					</SettingRow>
				)}
				<div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
					<Button variant="outline" size="sm" onClick={() => void model.onOpenLogs()}>
						{t("viewLogs")}
					</Button>
					<Button variant="outline" size="sm" onClick={() => void model.onRestart()} disabled={!model.config.enabled}>
						{t("restartBridgeBtn")}
					</Button>
				</div>
			</SettingSection>

			{model.logsOpen && <ImLogDrawer logs={model.logs} onClose={() => model.setLogsOpen(false)} />}
		</div>
	);
}
