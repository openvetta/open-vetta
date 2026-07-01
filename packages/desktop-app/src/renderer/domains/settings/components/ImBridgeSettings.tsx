import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import QRCode from "qrcode";
import { cn } from "@shared/lib/utils";
import { ModelSelect } from "@shared/components/ModelSelect";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@shared/components/ui/dialog";
import type {
	ImAgentModelRef,
	ImBridgeConfig,
	ImBridgeStatus,
	ImLegacyDetection,
	ImLogEvent,
	ImSetConfigPayload,
	ImTransportSelector,
	ImTransportStatus,
	ImWechatBindEvent,
} from "@preload/api";
import { SettingHeading, SettingRow, SettingSection } from "./shared";
import { SETTINGS_SECTION } from "../registry";

// =============================================================================
// Form state
// =============================================================================

// Feishu 表单仅保留 App ID / App Secret；其余字段（verificationToken / encryptKey /
// baseUrl）由后端长连接模式不需要、或保持先前已存值不变。
interface FeishuFormState {
	appId: string;
	appSecret: string;
}

function emptyFeishuForm(): FeishuFormState {
	return { appId: "", appSecret: "" };
}

function feishuFormFromConfig(cfg: ImBridgeConfig): FeishuFormState {
	return {
		appId: cfg.feishu.appId,
		appSecret: cfg.feishu.appSecret,
	};
}

function feishuFormToPayload(
	cfg: ImBridgeConfig,
	form: FeishuFormState,
	enabled: boolean,
): ImSetConfigPayload {
	// 透传已存在的可选字段，避免覆盖用户先前配置。
	return {
		enabled,
		feishu: {
			appId: form.appId.trim(),
			appSecret: form.appSecret,
			verificationToken: cfg.feishu.verificationToken || undefined,
			encryptKey: cfg.feishu.encryptKey || undefined,
			baseUrl: cfg.feishu.baseUrl || undefined,
		},
	};
}

// =============================================================================
// Status chip
// =============================================================================

const STATUS_LABEL: Record<ImTransportStatus, string> = {
	offline: "imbStatusOffline",
	connecting: "imbStatusConnecting",
	online: "imbStatusOnline",
	error: "imbStatusError",
	awaiting_bind: "imbStatusAwaitingBind",
};

const STATUS_CLASS: Record<ImTransportStatus, string> = {
	offline: "bg-muted text-muted-foreground",
	connecting: "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-300",
	online: "bg-green-100 text-green-900 dark:bg-green-900/30 dark:text-green-300",
	error: "bg-red-100 text-red-900 dark:bg-red-900/30 dark:text-red-300",
	awaiting_bind: "bg-blue-100 text-blue-900 dark:bg-blue-900/30 dark:text-blue-300",
};

function StatusBadge({ status }: { status: ImTransportStatus }): JSX.Element {
	const { t } = useTranslation("settings");
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium",
				STATUS_CLASS[status],
			)}
		>
			<span className="h-1.5 w-1.5 rounded-full bg-current" />
			{t(STATUS_LABEL[status] as any)}
		</span>
	);
}

// =============================================================================
// Main component
// =============================================================================

export function ImBridgeSettings(): JSX.Element {
	const { t } = useTranslation("settings");
	const [config, setConfig] = useState<ImBridgeConfig | null>(null);
	const [feishuForm, setFeishuForm] = useState<FeishuFormState>(emptyFeishuForm);
	const [feishuDialogOpen, setFeishuDialogOpen] = useState(false);
	const [wechatDialogOpen, setWechatDialogOpen] = useState(false);
	const [status, setStatus] = useState<ImBridgeStatus | null>(null);
	const [showSecret, setShowSecret] = useState(false);
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [saveOk, setSaveOk] = useState<string | null>(null);
	const [testing, setTesting] = useState(false);
	const [testResult, setTestResult] = useState<string | null>(null);
	const [logsOpen, setLogsOpen] = useState(false);
	const [logs, setLogs] = useState<ImLogEvent[]>([]);
	const [legacy, setLegacy] = useState<ImLegacyDetection | null>(null);
	const [importing, setImporting] = useState(false);
	const [probing, setProbing] = useState(false);
	const [probeResult, setProbeResult] = useState<{ ok: boolean; msg: string } | null>(null);
	const unsubRef = useRef<(() => void) | null>(null);

	// Initial load + subscribe.
	useEffect(() => {
		let cancelled = false;
		(async () => {
			const cfg = await window.vetta.im.getConfig();
			if (cancelled) return;
			setConfig(cfg);
			setFeishuForm(feishuFormFromConfig(cfg));

			const unsub = await window.vetta.im.subscribeStatus(
				(snap) => setStatus(snap),
				(log) => setLogs((prev) => [log, ...prev].slice(0, 500)),
			);
			if (cancelled) {
				unsub();
				return;
			}
			unsubRef.current = unsub;

			try {
				const detected = await window.vetta.im.detectLegacy();
				if (!cancelled && detected.hasLegacyData) {
					setLegacy(detected);
				}
			} catch {
				// best effort; non-fatal
			}

		})();

		return () => {
			cancelled = true;
			unsubRef.current?.();
			unsubRef.current = null;
		};
	}, []);

	const handleImportLegacy = useCallback(async () => {
		if (!legacy || importing) return;
		setImporting(true);
		try {
			const result = await window.vetta.im.importLegacy(legacy);
			if (result.ok) {
				const refreshed = await window.vetta.im.getConfig();
				setConfig(refreshed);
				setFeishuForm(feishuFormFromConfig(refreshed));
				setLegacy(null);
				setSaveOk(t("imbImportOk"));
			} else {
				setSaveError(result.error ?? t("imbImportFail"));
			}
		} finally {
			setImporting(false);
		}
	}, [legacy, importing]);

	const handleSkipLegacy = useCallback(() => {
		setLegacy(null);
	}, []);

	// 字段级校验。
	const feishuValidation = useMemo(() => {
		const errors: Partial<Record<keyof FeishuFormState, string>> = {};
		if (!feishuForm.appId.trim()) errors.appId = t("imbFeishuAppIdRequired");
		if (!feishuForm.appSecret) errors.appSecret = t("appSecretRequired");
		return { errors, valid: Object.keys(errors).length === 0 };
	}, [feishuForm]);

	const updateFeishuField = useCallback(
		<K extends keyof FeishuFormState>(key: K, value: FeishuFormState[K]) => {
			setSaveError(null);
			setSaveOk(null);
			setFeishuForm((prev) => ({ ...prev, [key]: value }));
		},
		[],
	);

	const handlePickModel = useCallback(
		async (next: ImAgentModelRef | null) => {
			if (!config) return;
			setSaving(true);
			setSaveError(null);
			setSaveOk(null);
			setProbeResult(null);
			try {
				const result = await window.vetta.im.setConfig({
					enabled: config.enabled,
					transport: config.transport,
					agentModel: next, // null → clear
				});
				if (!result.ok) {
					setSaveError(result.error ?? t("saveModelFailed"));
					return;
				}
				const refreshed = await window.vetta.im.getConfig();
				setConfig(refreshed);
				setSaveOk(next ? t("setModelOk", { provider: next.provider, model: next.model }) : t("clearedModel"));
			} finally {
				setSaving(false);
			}
		},
		[config],
	);

	const handleProbeModel = useCallback(async () => {
		if (!config?.agentModel) {
			setProbeResult({ ok: false, msg: t("pleaseSelectModel") });
			return;
		}
		setProbing(true);
		setProbeResult(null);
		try {
			const result = await window.vetta.im.probeAgentModel(config.agentModel);
			setProbeResult({
				ok: result.ok,
				msg: result.ok ? (result.message ?? t("testOk")) : (result.error ?? t("testUnknown")),
			});
		} finally {
			setProbing(false);
		}
	}, [config]);

	const handleToggleEnabled = useCallback(
		async (enabled: boolean) => {
			if (!config) return;
			// Validate per-transport before allowing the switch on.
			if (enabled) {
				if (!config.agentModel) {
					setSaveError(t("pleaseChooseModel"));
					return;
				}
				if (config.transport === "feishu" && !feishuValidation.valid) {
					setSaveError(t("pleaseFillFeishu"));
					setFeishuDialogOpen(true);
					return;
				}
				if (config.transport === "wechat" && !config.wechat.bound) {
					setSaveError(t("pleaseBindWechat"));
					setWechatDialogOpen(true);
					return;
				}
			}
			setSaving(true);
			try {
				// Send only the slot for the active transport so we don't
				// accidentally clobber the other transport's stored creds.
				const payload: ImSetConfigPayload = {
					enabled,
					transport: config.transport,
					feishu:
						config.transport === "feishu"
							? feishuFormToPayload(config, feishuForm, enabled).feishu
							: undefined,
				};
				const result = await window.vetta.im.setConfig(payload);
				if (!result.ok) {
					setSaveError(result.error ?? t("saveFailed"));
				} else {
					const refreshed = await window.vetta.im.getConfig();
					setConfig(refreshed);
					setFeishuForm(feishuFormFromConfig(refreshed));
					setSaveOk(enabled ? t("saveOk") : t("disableOk"));
				}
			} finally {
				setSaving(false);
			}
		},
		[config, feishuForm, feishuValidation.valid],
	);

	// Switch the active transport without changing enabled. Used by clicking
	// "{t("activateChannel")}" on a configured channel card.
	const handleSwitchTransport = useCallback(
		async (next: ImTransportSelector) => {
			if (!config || config.transport === next) return;
			setSaving(true);
			setSaveError(null);
			setSaveOk(null);
			try {
				const result = await window.vetta.im.setConfig({
					enabled: config.enabled,
					transport: next,
				});
				if (!result.ok) {
					setSaveError(result.error ?? t("switchFailed"));
					return;
				}
				const refreshed = await window.vetta.im.getConfig();
				setConfig(refreshed);
				setSaveOk(t("switchTo", { channel: next === "feishu" ? t("feishuChannel") : t("wechatChannel") }));
			} finally {
				setSaving(false);
			}
		},
		[config],
	);

	const handleWechatLogout = useCallback(async () => {
		if (!config) return;
		const ok = window.confirm(t("unbindConfirm"));
		if (!ok) return;
		setSaving(true);
		try {
			const result = await window.vetta.im.wechat.logout();
			if (!result.ok) {
				setSaveError(result.error ?? t("unbindError"));
				return;
			}
			const refreshed = await window.vetta.im.getConfig();
			setConfig(refreshed);
			setSaveOk(t("unbindSuccess"));
		} finally {
			setSaving(false);
		}
	}, [config]);

	const handleSaveFeishu = useCallback(async () => {
		if (!config || !feishuValidation.valid || saving) return;
		setSaving(true);
		setSaveError(null);
		setSaveOk(null);
		try {
			const payload = feishuFormToPayload(config, feishuForm, config.enabled);
			const result = await window.vetta.im.setConfig(payload);
			if (!result.ok) {
				setSaveError(result.error ?? t("saveFailed"));
				return;
			}
			const refreshed = await window.vetta.im.getConfig();
			setConfig(refreshed);
			setFeishuForm(feishuFormFromConfig(refreshed));
			setSaveOk(
				result.mode === "plaintext" ? t("saveOkPlaintext") : t("saveOkEncrypted"),
			);
		} catch (err) {
			setSaveError((err as Error).message);
		} finally {
			setSaving(false);
		}
	}, [config, feishuForm, feishuValidation.valid, saving]);

	const handleTestFeishu = useCallback(async () => {
		if (testing || !config) return;
		setTesting(true);
		setTestResult(null);
		try {
			const result = await window.vetta.im.testConnection({
				appId: feishuForm.appId.trim(),
				appSecret: feishuForm.appSecret,
				verificationToken: config.feishu.verificationToken || undefined,
				encryptKey: config.feishu.encryptKey || undefined,
				baseUrl: config.feishu.baseUrl || undefined,
			});
			setTestResult(result.ok ? (result.message ?? t("testPass")) : (result.error ?? t("testFail")));
		} finally {
			setTesting(false);
		}
	}, [config, feishuForm, testing]);

	const handleRestart = useCallback(async () => {
		await window.vetta.im.restart();
	}, []);

	const handleOpenLogs = useCallback(async () => {
		const initial = await window.vetta.im.getRecentLogs();
		setLogs(initial);
		setLogsOpen(true);
	}, []);

	if (!config) {
		return (
			<div className="mx-auto w-full max-w-[680px] px-8 py-4">
				<h1 className="mb-6 text-[20px] font-bold text-foreground">Vetta Claw</h1>
				<div className="text-[13px] text-muted-foreground">{t("loadFailed")}</div>
			</div>
		);
	}

	const transportStatus: ImTransportStatus = status?.transport ?? "offline";

	return (
		<div className="mx-auto w-full max-w-[680px] px-8 py-4">
			<h1 className="mb-6 text-[20px] font-bold text-foreground">Vetta Claw</h1>


			{legacy?.hasLegacyData && (
				<div className="mb-4 rounded-lg border border-blue-300 bg-blue-50 px-4 py-3 text-[12px] text-blue-900 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-200">
					<div className="mb-2 font-medium">{t("legacyTitle")}</div>
					<div className="mb-3">
						{t("legacyPath", { path: legacy.credentialsPath ?? legacy.configPath ?? legacy.statePath })}
						{legacy.parsed?.feishu?.appId && (
							<span className="ml-2 text-blue-700 dark:text-blue-300">
								（App ID: {legacy.parsed.feishu.appId}）
							</span>
						)}
					</div>
					<div className="flex gap-2">
						<button
							type="button"
							onClick={() => void handleImportLegacy()}
							disabled={importing || !legacy.parsed?.feishu?.appId}
							className="rounded-md bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
						>
							{importing ? t("importing") : t("importToNew")}
						</button>
						<button
							type="button"
							onClick={handleSkipLegacy}
							className="rounded-md border border-input bg-secondary px-3 py-1.5 text-[12px] text-foreground hover:bg-accent"
						>
							{t("skip")}
						</button>
					</div>
				</div>
			)}

			{/* ─────────────────────────────────────────────────────────────── */}
			<SettingSection t={t as any} section={SETTINGS_SECTION["imbridge-toggle"]}>
				<SettingRow
					title={t("enableImBridge")}
					description={t("enableImBridgeDesc")}
					border={false}
				>
					<button
						type="button"
						role="switch"
						aria-checked={config.enabled}
						onClick={() => void handleToggleEnabled(!config.enabled)}
						disabled={saving}
						className={cn(
							"relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
							config.enabled ? "bg-primary" : "bg-muted-foreground/30",
						)}
					>
						<span
							className={cn(
								"inline-block h-3.5 w-3.5 transform rounded-full bg-background shadow transition-transform",
								config.enabled ? "translate-x-[18px]" : "translate-x-[3px]",
							)}
						/>
					</button>
				</SettingRow>
			</SettingSection>

			{/* ─────────────────────────────────────────────────────────────── */}
			<SettingSection
				section={SETTINGS_SECTION["imbridge-model"]}
				title={t("dialogModel")}
				description={t("dialogModelDesc")}
			>
				<SettingRow title={t("modelSetting")} description={t("modelSettingDesc")}>
					<div className="flex flex-wrap items-center gap-2">
						<ModelSelect
							value={config.agentModel ? `${config.agentModel.provider}/${config.agentModel.model}` : null}
							onChange={(key) => {
								if (!key) {
									void handlePickModel(null);
									return;
								}
								const sep = key.indexOf("/");
								if (sep < 0) return;
								void handlePickModel({ provider: key.slice(0, sep), model: key.slice(sep + 1) });
							}}
							allowClear
							disabled={saving}
							placeholder={t("notSet")}
							triggerClassName="min-w-[220px]"
							reasoning={
								config.agentModel
									? {
											value: config.agentModel.reasoningLevel,
											onChange: (level) => {
												const am = config.agentModel;
												if (am) void handlePickModel({ provider: am.provider, model: am.model, reasoningLevel: level });
											},
										}
									: undefined
							}
						/>
						<button
							type="button"
							onClick={() => void handleProbeModel()}
							disabled={probing || !config.agentModel}
							className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-input bg-secondary px-2.5 py-1 text-[12px] text-foreground transition-colors hover:bg-accent disabled:opacity-50"
						>
							<span>{t("testConnect")}</span>
							{probing ? (
								<span className="icon-[mdi--loading] h-3.5 w-3.5 animate-spin" />
							) : probeResult?.ok ? (
								<span className="icon-[mdi--check] h-3.5 w-3.5 text-green-600 dark:text-green-400" />
							) : probeResult && !probeResult.ok ? (
								<span className="icon-[mdi--close] h-3.5 w-3.5 text-red-500" />
							) : null}
						</button>
					</div>
				</SettingRow>
			</SettingSection>

			{/* ─────────────────────────────────────────────────────────────── */}
			{/* 消息渠道：卡片网格，未来新增的渠道直接追加新的 ChannelCard 即可。 */}
			<div className="@container mb-6">
				<div className="mb-3 flex items-baseline gap-2">
					<SettingHeading t={t as any} section={SETTINGS_SECTION["imbridge-channels"]} />
					<span className="text-[12px] text-muted-foreground">{t("channelsCount")}</span>
				</div>
				{/* 容器宽度足够时才双列，窄时单列，避免渠道卡逐字挤压 */}
				<div className="grid grid-cols-1 gap-3 @xl:grid-cols-2">
					<ChannelCard
						name={t("feishuName")}
						subtitle={t("feishuSubtitle")}
						iconClass="icon-[mdi--message-text] text-[#00D6B9]"
						configured={Boolean(config.feishu.appId)}
						isActive={config.transport === "feishu"}
						transportStatus={transportStatus}
						actionLabel={t("feishuSetting")}
						onAction={() => {
							setSaveError(null);
							setSaveOk(null);
							setTestResult(null);
							setFeishuDialogOpen(true);
						}}
						onActivate={
							config.transport === "feishu"
								? undefined
								: () => void handleSwitchTransport("feishu")
						}
					/>
					<ChannelCard
						name={t("wechatName")}
						subtitle={
							config.wechat.bound
								? `${t("bound")} (${config.wechat.ilinkBotId ?? "iLink"})`
								: t("wechatSubtitle")
						}
						iconClass="icon-[mdi--wechat] text-[#07C160]"
						configured={config.wechat.bound}
						isActive={config.transport === "wechat"}
						transportStatus={transportStatus}
						actionLabel={config.wechat.bound ? t("wechatManage") : t("wechatBind")}
						onAction={() => {
							setSaveError(null);
							setSaveOk(null);
							// 预热：未绑定时，提前让 main 把 sidecar 切到 wechat / 拉起来。
							// 这样 dialog 内的 startBind 在等 awaiting_bind 时几乎无需轮询，
							// 直接快速进入发送 bind 帧 → 二维码到达的时间显著缩短。
							if (
								!config.wechat.bound &&
								(config.transport !== "wechat" || !config.enabled)
							) {
								void window.vetta.im.setConfig({ enabled: true, transport: "wechat" });
							}
							setWechatDialogOpen(true);
						}}
						onActivate={
							config.transport === "wechat"
								? undefined
								: () => void handleSwitchTransport("wechat")
						}
					/>
				</div>
			</div>

			<Dialog open={feishuDialogOpen} onOpenChange={setFeishuDialogOpen}>
				<DialogContent className="sm:max-w-[460px]">
					<DialogHeader>
						<DialogTitle>{t("feishuSettingsTitle")}</DialogTitle>
						<DialogDescription>
							{t("feishuDesc")}
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-3 py-2">
						<div>
							<label className="mb-1 block text-[12px] font-medium text-foreground">App ID</label>
							<input
								type="text"
								value={feishuForm.appId}
								onChange={(e) => updateFeishuField("appId", e.target.value)}
								className={cn(
									"w-full rounded-md border bg-secondary px-2.5 py-1.5 text-[12px] text-foreground",
									feishuValidation.errors.appId ? "border-red-400" : "border-input",
								)}
								placeholder="cli_xxxxxxxxxxxxxxxx"
							/>
						</div>
						<div>
							<label className="mb-1 block text-[12px] font-medium text-foreground">App Secret</label>
							<div className="flex items-center gap-1.5">
								<input
									type={showSecret ? "text" : "password"}
									value={feishuForm.appSecret}
									onChange={(e) => updateFeishuField("appSecret", e.target.value)}
									className={cn(
										"flex-1 rounded-md border bg-secondary px-2.5 py-1.5 text-[12px] text-foreground",
										feishuValidation.errors.appSecret ? "border-red-400" : "border-input",
									)}
									placeholder="App Secret"
								/>
								<button
									type="button"
									onClick={() => setShowSecret((v) => !v)}
									className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
									aria-label={showSecret ? t("hide") : t("show")}
								>
									<span
										className={cn(
											showSecret ? "icon-[mdi--eye-off-outline]" : "icon-[mdi--eye-outline]",
											"h-3.5 w-3.5",
										)}
									/>
								</button>
							</div>
						</div>

						<div className="min-h-[18px] text-[12px]">
							{saveError && <span className="text-red-500">{saveError}</span>}
							{saveOk && !saveError && (
								<span className="text-green-600 dark:text-green-400">{saveOk}</span>
							)}
							{testResult && !saveError && !saveOk && (
								<span className="text-muted-foreground">{testResult}</span>
							)}
						</div>
					</div>

					<DialogFooter>
						<button
							type="button"
							onClick={() => void handleTestFeishu()}
							disabled={testing || !feishuValidation.valid}
							className="rounded-lg border border-input bg-secondary px-3 py-1.5 text-[12px] text-foreground transition-colors hover:bg-accent disabled:opacity-50"
						>
							{testing ? t("testing") : t("testConnection")}
						</button>
						<button
							type="button"
							onClick={() => void handleSaveFeishu()}
							disabled={!feishuValidation.valid || saving}
							className="rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
						>
							{saving ? t("savingLabel") : t("saveLabel")}
						</button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<WechatBindDialog
				open={wechatDialogOpen}
				onOpenChange={setWechatDialogOpen}
				bound={config.wechat.bound}
				ilinkBotId={config.wechat.ilinkBotId}
				ilinkUserId={config.wechat.ilinkUserId}
				onLogout={() => void handleWechatLogout()}
				onConfirmedRefresh={() => {
					void window.vetta.im.getConfig().then((refreshed) => {
						setConfig(refreshed);
					});
				}}
			/>

			{/* ─────────────────────────────────────────────────────────────── */}
			<SettingSection
				section={SETTINGS_SECTION["imbridge-status"]}
				title={
					<div className="flex items-center justify-between">
						<span>{t("statusLog")}</span>
						<StatusBadge status={transportStatus} />
					</div>
				}
			>
				<SettingRow title={t("bridgePid")} description={t("bridgePidDesc")}>
					<span className="text-[13px] tabular-nums text-muted-foreground">{status?.sidecarPid ?? "—"}</span>
				</SettingRow>
				{status?.lastError && (
					<SettingRow title={t("lastError")} description={status.lastErrorAt ?? ""}>
						<span className="text-[12px] text-red-500">{status.lastError}</span>
					</SettingRow>
				)}
				<div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
					<button
						type="button"
						onClick={() => void handleOpenLogs()}
						className="rounded-lg border border-input bg-secondary px-3 py-1.5 text-[12px] text-foreground transition-colors hover:bg-accent"
					>
						{t("viewLogs")}
					</button>
					<button
						type="button"
						onClick={() => void handleRestart()}
						disabled={!config.enabled}
						className="rounded-lg border border-input bg-secondary px-3 py-1.5 text-[12px] text-foreground transition-colors hover:bg-accent disabled:opacity-50"
					>
						{t("restartBridgeBtn")}
					</button>
				</div>
			</SettingSection>

			{logsOpen && <LogDrawer logs={logs} onClose={() => setLogsOpen(false)} />}
		</div>
	);
}

// =============================================================================
// Channel card
// =============================================================================

function ChannelCard({
	name,
	subtitle,
	iconClass,
	configured,
	isActive,
	transportStatus,
	actionLabel,
	onAction,
	onActivate,
}: {
	name: string;
	subtitle: string;
	iconClass: string;
	configured: boolean;
	isActive: boolean;
	transportStatus: ImTransportStatus;
	actionLabel: string;
	onAction: () => void;
	/** When undefined the channel is already active and the badge is shown. */
	onActivate?: () => void;
}): JSX.Element {
	const { t } = useTranslation("settings");
	// The status badge only makes sense for the active channel — the
	// inactive one is always implicitly offline regardless of transportStatus.
	const effectiveStatus: ImTransportStatus = isActive ? transportStatus : "offline";

	return (
		<div
			className={cn(
				"flex flex-col gap-4 rounded-2xl border bg-muted p-5",
				isActive ? "border-primary/60" : "border-border",
			)}
		>
			{/* 标题行 */}
			<div className="flex items-start gap-3">
				<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-background">
					<span className={cn(iconClass, "h-6 w-6")} />
				</span>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-1.5">
						<div className="text-[15px] font-semibold text-foreground">{name}</div>
						{isActive && (
							<span className="inline-flex items-center rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
								{t("channelActive")}
							</span>
						)}
					</div>
					<div className="mt-0.5 truncate text-[12px] text-muted-foreground">{subtitle}</div>
				</div>
				{configured ? (
					<StatusBadge status={effectiveStatus} />
				) : (
					<span className="inline-flex items-center rounded-full bg-muted-foreground/15 px-2 py-0.5 text-[11px] text-muted-foreground">
						{t("channelNotAssociated")}
					</span>
				)}
			</div>

			{/* 操作按钮组 */}
			<div className="flex gap-2">
				{configured && onActivate && (
					<button
						type="button"
						onClick={onActivate}
						className="flex shrink-0 items-center gap-1 rounded-lg border border-input bg-secondary px-3 py-2.5 text-[12px] text-foreground transition-colors hover:bg-accent"
						title={t("activateChannelTitle")}
					>
						<span className="icon-[mdi--swap-horizontal] h-4 w-4" />
						{t("activateChannel")}
					</button>
				)}
				<button
					type="button"
					onClick={onAction}
					className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-input bg-secondary py-2.5 text-[13px] font-medium text-foreground transition-colors hover:bg-accent"
				>
					<span className="icon-[mdi--cog-outline] h-4 w-4" />
					{actionLabel}
				</button>
			</div>
		</div>
	);
}

// =============================================================================
// Wechat bind dialog
// =============================================================================

type WechatDialogPhase =
	| "idle"
	| "starting"
	| "waiting"
	| "scanned"
	| "expired_refreshing"
	| "redirected"
	| "confirmed"
	| "failed";

interface WechatDialogState {
	phase: WechatDialogPhase;
	qrUrl?: string;
	qrDataUrl?: string;
	qrAttempt: number;
	error?: string;
}

const initialWechatDialogState: WechatDialogState = {
	phase: "idle",
	qrAttempt: 0,
};

function WechatBindDialog({
	open,
	onOpenChange,
	bound,
	ilinkBotId,
	ilinkUserId,
	onLogout,
	onConfirmedRefresh,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	bound: boolean;
	ilinkBotId?: string;
	ilinkUserId?: string;
	onLogout: () => void;
	onConfirmedRefresh: () => void;
}): JSX.Element {
	const { t } = useTranslation("settings");
	const [state, setState] = useState<WechatDialogState>(initialWechatDialogState);
	const subUnsubRef = useRef<(() => void) | null>(null);

	// Clean up the subscription whenever the dialog closes.
	useEffect(() => {
		if (!open) {
			subUnsubRef.current?.();
			subUnsubRef.current = null;
			setState(initialWechatDialogState);
		}
	}, [open]);

	// Render the QR string into a data URL whenever it changes. We use a
	// data URL (rather than canvas) so React can re-render with no
	// imperative DOM ops, and so the same image works in tests / DPI
	// changes without canvas reset gymnastics.
	useEffect(() => {
		const url = state.qrUrl;
		if (!url) {
			return;
		}
		let cancelled = false;
		QRCode.toDataURL(url, {
			errorCorrectionLevel: "M",
			margin: 1,
			width: 240,
			color: { dark: "#000000", light: "#ffffff" },
		})
			.then((dataUrl) => {
				if (!cancelled) {
					setState((prev) => (prev.qrUrl === url ? { ...prev, qrDataUrl: dataUrl } : prev));
				}
			})
			.catch(() => {
				if (!cancelled) {
					setState((prev) => ({ ...prev, error: t("qrRenderError") }));
				}
			});
		return () => {
			cancelled = true;
		};
	}, [state.qrUrl]);

	const startBind = useCallback(async () => {
		setState({ phase: "starting", qrAttempt: 0 });

		// Subscribe before issuing startBind so we never miss the first qr event.
		const unsub = await window.vetta.im.wechat.subscribeBind((event: ImWechatBindEvent) => {
			switch (event.kind) {
				case "qr":
					setState((prev) => ({
						...prev,
						phase: prev.phase === "expired_refreshing" || prev.qrAttempt > 0 ? "waiting" : "waiting",
						qrUrl: event.url,
						qrDataUrl: undefined, // force re-render via the toDataURL effect
						qrAttempt: event.attempt,
						error: undefined,
					}));
					break;
				case "status":
					setState((prev) => {
						switch (event.status) {
							case "scanned":
								return { ...prev, phase: "scanned" };
							case "expired":
								return { ...prev, phase: "expired_refreshing" };
							case "redirected":
								return { ...prev, phase: "redirected" };
							case "confirmed":
								return { ...prev, phase: "confirmed" };
							case "failed":
								return { ...prev, phase: "failed", error: event.error ?? t("bindFailedGeneric") };
							case "cancelled":
								return { ...prev, phase: "failed", error: t("bindCanceled") };
							default:
								return prev;
						}
					});
					break;
				case "bound":
					// Trigger a config refresh in the parent so the channel
					// card and master switch reflect the new bound state.
					onConfirmedRefresh();
					setState((prev) => ({ ...prev, phase: "confirmed" }));
					// Auto-close after a brief celebration window.
					setTimeout(() => onOpenChange(false), 1500);
					break;
				case "unbound":
					setState(initialWechatDialogState);
					onConfirmedRefresh();
					break;
			}
		});
		subUnsubRef.current = unsub;

		const result = await window.vetta.im.wechat.startBind();
		if (!result.ok) {
			setState({
				phase: "failed",
				qrAttempt: 0,
				error: result.error ?? t("bindStartFailed"),
			});
		}
	}, [onConfirmedRefresh, onOpenChange]);

	// 未绑定时自动触发 startBind，省去用户点「开始绑定」一步直接看到二维码。
	useEffect(() => {
		if (open && !bound && state.phase === "idle") {
			void startBind();
		}
	}, [open, bound, state.phase, startBind]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[460px]">
				<DialogHeader>
					<DialogTitle>{bound ? t("wechatTitle") : t("wechatBindTitle")}</DialogTitle>
					<DialogDescription>
						{bound
							? t("wechatBoundDesc")
							: t("wechatBindDesc")}
					</DialogDescription>
				</DialogHeader>

				{bound ? (
					<div className="space-y-3 py-2 text-[12px] text-foreground">
						<div className="rounded-md border border-input bg-secondary px-3 py-2">
							<div className="text-muted-foreground">ilink_bot_id</div>
							<div className="font-mono text-[11px] break-all">{ilinkBotId ?? "—"}</div>
						</div>
						<div className="rounded-md border border-input bg-secondary px-3 py-2">
							<div className="text-muted-foreground">ilink_user_id</div>
							<div className="font-mono text-[11px] break-all">{ilinkUserId ?? "—"}</div>
						</div>
					</div>
				) : (
					<WechatBindBody state={state} onStart={() => void startBind()} />
				)}

				<DialogFooter className="gap-2">
					{bound ? (
						<>
							<button
								type="button"
								onClick={onLogout}
								className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-[12px] text-red-700 transition-colors hover:bg-red-100 dark:border-red-700/50 dark:bg-red-900/20 dark:text-red-300"
							>
								{t("unbindAccount")}
							</button>
							<button
								type="button"
								onClick={() => onOpenChange(false)}
								className="rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
							>
								{t("bindDone")}
							</button>
						</>
					) : (
						<button
							type="button"
							onClick={() => onOpenChange(false)}
							className="rounded-lg border border-input bg-secondary px-3 py-1.5 text-[12px] text-foreground transition-colors hover:bg-accent"
						>
							{t("cancel")}
						</button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function WechatBindBody({
	state,
	onStart,
}: {
	state: WechatDialogState;
	onStart: () => void;
}): JSX.Element {
	const { t } = useTranslation("settings");
	// idle 阶段由父组件自动触发 startBind，渲染同 starting 的 loading，避免按钮闪现。
	if (state.phase === "idle" || state.phase === "starting") {
		return (
			<div className="flex flex-col items-center gap-3 py-10 text-center text-[12px] text-muted-foreground">
				<span className="icon-[mdi--loading] h-6 w-6 animate-spin" />
				<div>{t("bindGenerating")}</div>
			</div>
		);
	}

	if (state.phase === "failed") {
		return (
			<div className="flex flex-col items-center gap-3 py-6 text-center">
				<span className="icon-[mdi--close-circle] h-10 w-10 text-red-500" />
				<div className="text-[12px] text-red-600 dark:text-red-400">{state.error ?? t("bindFailed")}</div>
				<button
					type="button"
					onClick={onStart}
					className="rounded-lg bg-primary px-4 py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90"
				>
					{t("retry")}
				</button>
			</div>
		);
	}

	if (state.phase === "confirmed") {
		return (
			<div className="flex flex-col items-center gap-3 py-8 text-center">
				<span className="icon-[mdi--check-circle] h-12 w-12 text-green-500" />
				<div className="text-[13px] font-medium text-foreground">{t("bindSuccessTitle")}</div>
				<div className="text-[11px] text-muted-foreground">{t("bindSuccessDesc")}</div>
			</div>
		);
	}

	const progressLabel = (() => {
		switch (state.phase) {
			case "scanned":
				return t("scanWechatConfirm");
			case "expired_refreshing":
				return t("qrExpired");
			case "redirected":
				return t("switchingRoute");
			default:
				return state.qrAttempt > 1
					? t("scanQrHintN", { n: state.qrAttempt })
					: t("scanQrHint");
		}
	})();

	return (
		<div className="flex flex-col items-center gap-3 py-3">
			<div className="flex h-[252px] w-[252px] items-center justify-center rounded-md border border-border bg-white p-1.5">
				{state.qrDataUrl ? (
					// eslint-disable-next-line @next/next/no-img-element
					<img src={state.qrDataUrl} alt="WeChat QR" className="h-full w-full" />
				) : (
					<span className="icon-[mdi--loading] h-8 w-8 animate-spin text-muted-foreground" />
				)}
			</div>
			<div className="text-center text-[12px] text-muted-foreground">{progressLabel}</div>
			<div className="text-center text-[11px] text-muted-foreground">
				{t("scanToAuthorize")}
			</div>
		</div>
	);
}

// =============================================================================
// Log drawer
// =============================================================================

function LogDrawer({ logs, onClose }: { logs: ImLogEvent[]; onClose: () => void }): JSX.Element {
	const { t } = useTranslation("settings");
	return (
		<div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
			<div
				className="flex h-full w-[520px] flex-col border-l border-border bg-background shadow-xl"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex items-center justify-between border-b border-border px-5 py-3">
					<SettingHeading t={t as any} section={SETTINGS_SECTION["imbridge-logs"]} title={t("logTitle")} className="text-[14px]" />
					<button
						type="button"
						onClick={onClose}
						className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
						aria-label={t("close")}
					>
						<span className="icon-[mdi--close] h-4 w-4" />
					</button>
				</div>
				<div className="flex-1 overflow-y-auto px-5 py-3 font-mono text-[11px]">
					{logs.length === 0 ? (
						<div className="text-muted-foreground">{t("noLogs")}</div>
					) : (
						logs.map((log, idx) => (
							<div
								// eslint-disable-next-line react/no-array-index-key
								key={`${log.time}-${idx}`}
								className={cn(
									"mb-1 flex gap-2",
									log.level === "error" && "text-red-500",
									log.level === "warn" && "text-amber-500",
								)}
							>
								<span className="shrink-0 text-muted-foreground">{formatLogTime(log.time)}</span>
								<span className="shrink-0 uppercase">{log.level}</span>
								<span className="break-all">{log.msg}</span>
							</div>
						))
					)}
				</div>
			</div>
		</div>
	);
}

function formatLogTime(iso: string): string {
	try {
		const d = new Date(iso);
		return d.toTimeString().slice(0, 8);
	} catch {
		return iso;
	}
}
