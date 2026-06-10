import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAtomValue } from "jotai";
import QRCode from "qrcode";
import { cn } from "@shared/lib/utils";
import { remoteProvidersAtom } from "@shared/store/atoms";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@shared/components/ui/dialog";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@shared/components/ui/select";
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
	ModelsConfigData,
} from "@preload/api";
import { SettingHeading, SettingRow, SettingSection } from "./shared";
import { SETTINGS_SECTION } from "../registry";

// shadcn Select treats "" as "no value set" internally and refuses items
// with an empty value, so we use a magic sentinel for the "未设置" row.
const MODEL_NONE = "__vetta_im_model_none__";

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
	offline: "未启用",
	connecting: "连接中",
	online: "在线",
	error: "错误",
	awaiting_bind: "等待扫码",
};

const STATUS_CLASS: Record<ImTransportStatus, string> = {
	offline: "bg-muted text-muted-foreground",
	connecting: "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-300",
	online: "bg-green-100 text-green-900 dark:bg-green-900/30 dark:text-green-300",
	error: "bg-red-100 text-red-900 dark:bg-red-900/30 dark:text-red-300",
	awaiting_bind: "bg-blue-100 text-blue-900 dark:bg-blue-900/30 dark:text-blue-300",
};

function StatusBadge({ status }: { status: ImTransportStatus }): JSX.Element {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium",
				STATUS_CLASS[status],
			)}
		>
			<span className="h-1.5 w-1.5 rounded-full bg-current" />
			{STATUS_LABEL[status]}
		</span>
	);
}

// =============================================================================
// Main component
// =============================================================================

export function ImBridgeSettings(): JSX.Element {
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
	const [models, setModels] = useState<ModelsConfigData | null>(null);
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

			try {
				const m = await window.vetta.models.get();
				if (!cancelled) setModels(m);
			} catch {
				// non-fatal — UI will just show empty model picker
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
				setSaveOk("已导入旧版凭据，原文件已重命名为 .bak");
			} else {
				setSaveError(result.error ?? "导入失败");
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
		if (!feishuForm.appId.trim()) errors.appId = "App ID 不能为空";
		if (!feishuForm.appSecret) errors.appSecret = "App Secret 不能为空";
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

	// Mirror ModelSelector.tsx's source-of-truth: local models from
	// models.json + remote models from the auth-server (Vetta Zen et al.,
	// streamed in by useAuth and parked in remoteProvidersAtom). Same
	// dedup-by-key rule so local overrides win.
	const remoteProviders = useAtomValue(remoteProvidersAtom);
	const modelOptions = useMemo<
		Array<{ provider: string; model: string; displayName: string; remote: boolean; key: string }>
	>(() => {
		type ProviderShape = {
			models?: Array<{ id: string; name?: string }>;
		};
		const flatten = (
			providers: Record<string, ProviderShape | undefined>,
			remote: boolean,
		) => {
			const out: Array<{
				provider: string;
				model: string;
				displayName: string;
				remote: boolean;
				key: string;
			}> = [];
			for (const [provider, p] of Object.entries(providers)) {
				for (const m of p?.models ?? []) {
					if (!m.id) continue;
					out.push({
						provider,
						model: m.id,
						displayName: m.name || m.id,
						remote,
						key: `${provider}/${m.id}`,
					});
				}
			}
			return out;
		};
		const local = models?.providers ? flatten(models.providers, false) : [];
		const remote = flatten(remoteProviders as Record<string, ProviderShape>, true);
		const localKeys = new Set(local.map((m) => m.key));
		return [...local, ...remote.filter((m) => !localKeys.has(m.key))];
	}, [models, remoteProviders]);

	// Group by provider for SelectGroup rendering.
	const groupedModelOptions = useMemo(() => {
		const groups = new Map<string, typeof modelOptions>();
		for (const m of modelOptions) {
			const list = groups.get(m.provider) ?? [];
			list.push(m);
			groups.set(m.provider, list);
		}
		return [...groups.entries()];
	}, [modelOptions]);

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
					setSaveError(result.error ?? "保存模型失败");
					return;
				}
				const refreshed = await window.vetta.im.getConfig();
				setConfig(refreshed);
				setSaveOk(next ? `已设为 ${next.provider} / ${next.model}` : "已清除模型设定");
			} finally {
				setSaving(false);
			}
		},
		[config],
	);

	const handleProbeModel = useCallback(async () => {
		if (!config?.agentModel) {
			setProbeResult({ ok: false, msg: "请先选择模型" });
			return;
		}
		setProbing(true);
		setProbeResult(null);
		try {
			const result = await window.vetta.im.probeAgentModel(config.agentModel);
			setProbeResult({
				ok: result.ok,
				msg: result.ok ? (result.message ?? "可连通") : (result.error ?? "未知错误"),
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
					setSaveError("请先在「对话模型」里选择 IM 桥接使用的模型");
					return;
				}
				if (config.transport === "feishu" && !feishuValidation.valid) {
					setSaveError("请先填写飞书 App ID 与 App Secret");
					setFeishuDialogOpen(true);
					return;
				}
				if (config.transport === "wechat" && !config.wechat.bound) {
					setSaveError("请先扫码绑定微信账号");
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
					setSaveError(result.error ?? "保存失败");
				} else {
					const refreshed = await window.vetta.im.getConfig();
					setConfig(refreshed);
					setFeishuForm(feishuFormFromConfig(refreshed));
					setSaveOk(enabled ? "已启用" : "已停用");
				}
			} finally {
				setSaving(false);
			}
		},
		[config, feishuForm, feishuValidation.valid],
	);

	// Switch the active transport without changing enabled. Used by clicking
	// "激活" on a configured channel card.
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
					setSaveError(result.error ?? "切换失败");
					return;
				}
				const refreshed = await window.vetta.im.getConfig();
				setConfig(refreshed);
				setSaveOk(`已切换到 ${next === "feishu" ? "飞书" : "微信"}`);
			} finally {
				setSaving(false);
			}
		},
		[config],
	);

	const handleWechatLogout = useCallback(async () => {
		if (!config) return;
		const ok = window.confirm("确认解绑当前 WeChat 账号吗？解绑后需要重新扫码。");
		if (!ok) return;
		setSaving(true);
		try {
			const result = await window.vetta.im.wechat.logout();
			if (!result.ok) {
				setSaveError(result.error ?? "解绑失败");
				return;
			}
			const refreshed = await window.vetta.im.getConfig();
			setConfig(refreshed);
			setSaveOk("已解绑");
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
				setSaveError(result.error ?? "保存失败");
				return;
			}
			const refreshed = await window.vetta.im.getConfig();
			setConfig(refreshed);
			setFeishuForm(feishuFormFromConfig(refreshed));
			setSaveOk(
				result.mode === "plaintext" ? "已保存（明文存储，建议安装系统密钥服务）" : "已加密保存",
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
			setTestResult(result.ok ? (result.message ?? "测试通过") : (result.error ?? "测试失败"));
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
				<div className="text-[13px] text-muted-foreground">加载中...</div>
			</div>
		);
	}

	const transportStatus: ImTransportStatus = status?.transport ?? "offline";

	return (
		<div className="mx-auto w-full max-w-[680px] px-8 py-4">
			<h1 className="mb-6 text-[20px] font-bold text-foreground">Vetta Claw</h1>


			{legacy?.hasLegacyData && (
				<div className="mb-4 rounded-lg border border-blue-300 bg-blue-50 px-4 py-3 text-[12px] text-blue-900 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-200">
					<div className="mb-2 font-medium">检测到旧版 im-gateway 配置</div>
					<div className="mb-3">
						旧路径：{legacy.credentialsPath ?? legacy.configPath ?? legacy.statePath}
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
							{importing ? "导入中..." : "导入到新设置"}
						</button>
						<button
							type="button"
							onClick={handleSkipLegacy}
							className="rounded-md border border-input bg-secondary px-3 py-1.5 text-[12px] text-foreground hover:bg-accent"
						>
							跳过
						</button>
					</div>
				</div>
			)}

			{/* ─────────────────────────────────────────────────────────────── */}
			<SettingSection section={SETTINGS_SECTION["imbridge-toggle"]}>
				<SettingRow
					title="启用 IM 桥接"
					description="开启后，桥接进程随 Vetta 一起运行；完全退出 Vetta 后立即停止接收消息。"
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
				title="对话模型"
				description="IM 桥接拉起的 coding-agent 子进程会用这个模型回复消息；未设置时跟随 Vetta 全局默认模型。"
			>
				<SettingRow title="模型" description="可以用模型配置中的模型">
					<div className="flex flex-wrap items-center gap-2">
						<Select
							value={
								config.agentModel ? `${config.agentModel.provider}/${config.agentModel.model}` : MODEL_NONE
							}
							onValueChange={(v) => {
								if (v === MODEL_NONE) {
									void handlePickModel(null);
									return;
								}
								const sep = v.indexOf("/");
								if (sep < 0) return;
								void handlePickModel({ provider: v.slice(0, sep), model: v.slice(sep + 1) });
							}}
							disabled={saving}
						>
							<SelectTrigger className="h-7 min-w-[220px] px-2 py-1 text-[12px]">
								<SelectValue placeholder="— 未设置 —" />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									<SelectItem value={MODEL_NONE} className="text-[12px]">
										— 未设置（用 Vetta 全局默认模型）—
									</SelectItem>
								</SelectGroup>
								{groupedModelOptions.map(([provider, items]) => (
									<SelectGroup key={provider}>
										<SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
											{provider}
											{items[0]?.remote && (
												<span className="ml-1.5 rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[9px] font-medium text-blue-400">
													云端
												</span>
											)}
										</SelectLabel>
										{items.map((o) => (
											<SelectItem
												key={o.key}
												value={o.key}
												className="text-[12px]"
												title={o.key}
											>
												{o.displayName}
											</SelectItem>
										))}
									</SelectGroup>
								))}
							</SelectContent>
						</Select>
						<button
							type="button"
							onClick={() => void handleProbeModel()}
							disabled={probing || !config.agentModel}
							className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-input bg-secondary px-2.5 py-1 text-[12px] text-foreground transition-colors hover:bg-accent disabled:opacity-50"
						>
							<span>测试连通</span>
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
			<div className="mb-6">
				<div className="mb-3 flex items-baseline gap-2">
					<SettingHeading section={SETTINGS_SECTION["imbridge-channels"]} />
					<span className="text-[12px] text-muted-foreground">2 个渠道</span>
				</div>
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
					<ChannelCard
						name="飞书"
						subtitle="飞书机器人"
						iconClass="icon-[mdi--message-text] text-[#00D6B9]"
						configured={Boolean(config.feishu.appId)}
						isActive={config.transport === "feishu"}
						transportStatus={transportStatus}
						actionLabel="设置机器人"
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
						name="微信"
						subtitle={
							config.wechat.bound
								? `已绑定 (${config.wechat.ilinkBotId ?? "iLink"})`
								: "微信个人号 (iLink)"
						}
						iconClass="icon-[mdi--wechat] text-[#07C160]"
						configured={config.wechat.bound}
						isActive={config.transport === "wechat"}
						transportStatus={transportStatus}
						actionLabel={config.wechat.bound ? "管理 / 解绑" : "扫码绑定"}
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
						<DialogTitle>设置飞书机器人</DialogTitle>
						<DialogDescription>
							填写自建应用的 App ID 与 App Secret，凭据将本地存储于 ~/.vetta/desktop-app/im-credentials.json (chmod 0600)。
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
									aria-label={showSecret ? "隐藏" : "显示"}
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
							{testing ? "测试中..." : "测试连接"}
						</button>
						<button
							type="button"
							onClick={() => void handleSaveFeishu()}
							disabled={!feishuValidation.valid || saving}
							className="rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
						>
							{saving ? "保存中..." : "保存"}
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
						<span>状态与日志</span>
						<StatusBadge status={transportStatus} />
					</div>
				}
			>
				<SettingRow title="桥接进程 PID" description="im-gateway 子进程的 PID">
					<span className="text-[13px] tabular-nums text-muted-foreground">{status?.sidecarPid ?? "—"}</span>
				</SettingRow>
				{status?.lastError && (
					<SettingRow title="最近错误" description={status.lastErrorAt ?? ""}>
						<span className="text-[12px] text-red-500">{status.lastError}</span>
					</SettingRow>
				)}
				<div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
					<button
						type="button"
						onClick={() => void handleOpenLogs()}
						className="rounded-lg border border-input bg-secondary px-3 py-1.5 text-[12px] text-foreground transition-colors hover:bg-accent"
					>
						查看实时日志
					</button>
					<button
						type="button"
						onClick={() => void handleRestart()}
						disabled={!config.enabled}
						className="rounded-lg border border-input bg-secondary px-3 py-1.5 text-[12px] text-foreground transition-colors hover:bg-accent disabled:opacity-50"
					>
						重启桥接
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
								活动
							</span>
						)}
					</div>
					<div className="mt-0.5 truncate text-[12px] text-muted-foreground">{subtitle}</div>
				</div>
				{configured ? (
					<StatusBadge status={effectiveStatus} />
				) : (
					<span className="inline-flex items-center rounded-full bg-muted-foreground/15 px-2 py-0.5 text-[11px] text-muted-foreground">
						未关联
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
						title="切换为活动渠道"
					>
						<span className="icon-[mdi--swap-horizontal] h-4 w-4" />
						激活
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
					setState((prev) => ({ ...prev, error: "二维码渲染失败" }));
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
								return { ...prev, phase: "failed", error: event.error ?? "绑定失败" };
							case "cancelled":
								return { ...prev, phase: "failed", error: "绑定已取消" };
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
				error: result.error ?? "启动绑定失败",
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
					<DialogTitle>{bound ? "微信账号" : "扫码绑定微信"}</DialogTitle>
					<DialogDescription>
						{bound
							? "已绑定的 iLink 机器人。Vetta 与微信服务器之间通过长轮询交换消息。"
							: "打开微信扫一扫，扫描下方二维码完成授权。"}
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
								解绑账号
							</button>
							<button
								type="button"
								onClick={() => onOpenChange(false)}
								className="rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
							>
								完成
							</button>
						</>
					) : (
						<button
							type="button"
							onClick={() => onOpenChange(false)}
							className="rounded-lg border border-input bg-secondary px-3 py-1.5 text-[12px] text-foreground transition-colors hover:bg-accent"
						>
							取消
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
	// idle 阶段由父组件自动触发 startBind，渲染同 starting 的 loading，避免按钮闪现。
	if (state.phase === "idle" || state.phase === "starting") {
		return (
			<div className="flex flex-col items-center gap-3 py-10 text-center text-[12px] text-muted-foreground">
				<span className="icon-[mdi--loading] h-6 w-6 animate-spin" />
				<div>正在生成二维码…</div>
			</div>
		);
	}

	if (state.phase === "failed") {
		return (
			<div className="flex flex-col items-center gap-3 py-6 text-center">
				<span className="icon-[mdi--close-circle] h-10 w-10 text-red-500" />
				<div className="text-[12px] text-red-600 dark:text-red-400">{state.error ?? "绑定失败"}</div>
				<button
					type="button"
					onClick={onStart}
					className="rounded-lg bg-primary px-4 py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90"
				>
					重试
				</button>
			</div>
		);
	}

	if (state.phase === "confirmed") {
		return (
			<div className="flex flex-col items-center gap-3 py-8 text-center">
				<span className="icon-[mdi--check-circle] h-12 w-12 text-green-500" />
				<div className="text-[13px] font-medium text-foreground">绑定成功</div>
				<div className="text-[11px] text-muted-foreground">即将自动关闭…</div>
			</div>
		);
	}

	const progressLabel = (() => {
		switch (state.phase) {
			case "scanned":
				return "已扫码，请在微信中确认…";
			case "expired_refreshing":
				return "二维码已过期，正在刷新…";
			case "redirected":
				return "服务器路由切换中…";
			default:
				return state.qrAttempt > 1
					? `请用微信扫一扫扫描二维码 (第 ${state.qrAttempt} 次)`
					: "请用微信扫一扫扫描二维码";
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
				打开微信扫一扫，扫描下方二维码完成授权
			</div>
		</div>
	);
}

// =============================================================================
// Log drawer
// =============================================================================

function LogDrawer({ logs, onClose }: { logs: ImLogEvent[]; onClose: () => void }): JSX.Element {
	return (
		<div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
			<div
				className="flex h-full w-[520px] flex-col border-l border-border bg-background shadow-xl"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex items-center justify-between border-b border-border px-5 py-3">
					<SettingHeading section={SETTINGS_SECTION["imbridge-logs"]} title="实时日志（最近 500 条）" className="text-[14px]" />
					<button
						type="button"
						onClick={onClose}
						className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
						aria-label="关闭"
					>
						<span className="icon-[mdi--close] h-4 w-4" />
					</button>
				</div>
				<div className="flex-1 overflow-y-auto px-5 py-3 font-mono text-[11px]">
					{logs.length === 0 ? (
						<div className="text-muted-foreground">暂无日志</div>
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
