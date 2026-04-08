import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@shared/lib/utils";
import type {
	ImBridgeConfig,
	ImBridgeStatus,
	ImLegacyDetection,
	ImLogEvent,
	ImSetConfigPayload,
	ImTransportStatus,
} from "@preload/api";
import { SettingRow, SettingSection } from "./shared";

// =============================================================================
// Form state
// =============================================================================

interface FormState {
	enabled: boolean;
	appId: string;
	appSecret: string;
	verificationToken: string;
	encryptKey: string;
	baseUrl: string;
}

function emptyForm(): FormState {
	return {
		enabled: false,
		appId: "",
		appSecret: "",
		verificationToken: "",
		encryptKey: "",
		baseUrl: "",
	};
}

function formFromConfig(cfg: ImBridgeConfig): FormState {
	return {
		enabled: cfg.enabled,
		appId: cfg.feishu.appId,
		appSecret: cfg.feishu.appSecret,
		verificationToken: cfg.feishu.verificationToken,
		encryptKey: cfg.feishu.encryptKey,
		baseUrl: cfg.feishu.baseUrl ?? "",
	};
}

function formToPayload(form: FormState): ImSetConfigPayload {
	return {
		enabled: form.enabled,
		feishu: {
			appId: form.appId.trim(),
			appSecret: form.appSecret,
			verificationToken: form.verificationToken || undefined,
			encryptKey: form.encryptKey || undefined,
			baseUrl: form.baseUrl.trim() || undefined,
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
};

const STATUS_CLASS: Record<ImTransportStatus, string> = {
	offline: "bg-muted text-muted-foreground",
	connecting: "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-300",
	online: "bg-green-100 text-green-900 dark:bg-green-900/30 dark:text-green-300",
	error: "bg-red-100 text-red-900 dark:bg-red-900/30 dark:text-red-300",
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
	const [form, setForm] = useState<FormState>(emptyForm);
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
	const unsubRef = useRef<(() => void) | null>(null);

	// Initial load + subscribe.
	useEffect(() => {
		let cancelled = false;
		(async () => {
			const cfg = await window.vetta.im.getConfig();
			if (cancelled) return;
			setConfig(cfg);
			setForm(formFromConfig(cfg));

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
				setForm(formFromConfig(refreshed));
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

	// Field-level validation. saveable means save button enabled.
	const validation = useMemo(() => {
		const errors: Partial<Record<keyof FormState, string>> = {};
		if (!form.appId.trim()) errors.appId = "App ID 不能为空";
		if (!form.appSecret) errors.appSecret = "App Secret 不能为空";
		return { errors, valid: Object.keys(errors).length === 0 };
	}, [form]);

	const updateField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
		setSaveError(null);
		setSaveOk(null);
		setForm((prev) => ({ ...prev, [key]: value }));
	}, []);

	const handleToggleEnabled = useCallback(
		async (enabled: boolean) => {
			updateField("enabled", enabled);
			if (!config) return;
			// Toggling without unsaved field changes → propagate immediately.
			if (validation.valid) {
				setSaving(true);
				try {
					const payload = formToPayload({ ...form, enabled });
					const result = await window.vetta.im.setConfig(payload);
					if (!result.ok) {
						setSaveError(result.error ?? "保存失败");
					} else {
						const refreshed = await window.vetta.im.getConfig();
						setConfig(refreshed);
						setForm(formFromConfig(refreshed));
						setSaveOk(enabled ? "已启用" : "已停用");
					}
				} finally {
					setSaving(false);
				}
			}
		},
		[config, form, validation.valid, updateField],
	);

	const handleSave = useCallback(async () => {
		if (!validation.valid || saving) return;
		setSaving(true);
		setSaveError(null);
		setSaveOk(null);
		try {
			const payload = formToPayload(form);
			const result = await window.vetta.im.setConfig(payload);
			if (!result.ok) {
				setSaveError(result.error ?? "保存失败");
				return;
			}
			const refreshed = await window.vetta.im.getConfig();
			setConfig(refreshed);
			setForm(formFromConfig(refreshed));
			setSaveOk(result.mode === "plaintext" ? "已保存（明文存储，建议安装系统密钥服务）" : "已加密保存");
		} catch (err) {
			setSaveError((err as Error).message);
		} finally {
			setSaving(false);
		}
	}, [form, saving, validation.valid]);

	const handleTest = useCallback(async () => {
		if (testing) return;
		setTesting(true);
		setTestResult(null);
		try {
			const result = await window.vetta.im.testConnection({
				appId: form.appId.trim(),
				appSecret: form.appSecret,
				verificationToken: form.verificationToken || undefined,
				encryptKey: form.encryptKey || undefined,
				baseUrl: form.baseUrl.trim() || undefined,
			});
			setTestResult(result.ok ? (result.message ?? "测试通过") : (result.error ?? "测试失败"));
		} finally {
			setTesting(false);
		}
	}, [form, testing]);

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
				<h1 className="mb-6 text-[20px] font-bold text-foreground">IM 集成</h1>
				<div className="text-[13px] text-muted-foreground">加载中...</div>
			</div>
		);
	}

	const transportStatus: ImTransportStatus = status?.transport ?? "offline";

	return (
		<div className="mx-auto w-full max-w-[680px] px-8 py-4">
			<h1 className="mb-6 text-[20px] font-bold text-foreground">IM 集成</h1>


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
			<SettingSection title="总开关">
				<SettingRow
					title="启用 IM 桥接"
					description="开启后，桥接进程随 Vetta 一起运行；完全退出 Vetta 后立即停止接收消息。"
					border={false}
				>
					<button
						type="button"
						role="switch"
						aria-checked={form.enabled}
						onClick={() => void handleToggleEnabled(!form.enabled)}
						disabled={saving}
						className={cn(
							"relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
							form.enabled ? "bg-primary" : "bg-muted-foreground/30",
						)}
					>
						<span
							className={cn(
								"inline-block h-3.5 w-3.5 transform rounded-full bg-background shadow transition-transform",
								form.enabled ? "translate-x-[18px]" : "translate-x-[3px]",
							)}
						/>
					</button>
				</SettingRow>
			</SettingSection>

			{/* ─────────────────────────────────────────────────────────────── */}
			<SettingSection title="飞书配置">
				<SettingRow title="App ID" description="飞书自建应用的 App ID（cli_ 开头）">
					<input
						type="text"
						value={form.appId}
						onChange={(e) => updateField("appId", e.target.value)}
						className={cn(
							"w-[260px] rounded-md border bg-secondary px-2.5 py-1.5 text-[12px] text-foreground",
							validation.errors.appId ? "border-red-400" : "border-input",
						)}
						placeholder="cli_xxxxxxxxxxxxxxxx"
					/>
				</SettingRow>
				<SettingRow title="App Secret" description="本地明文存储于 ~/.vetta/desktop-app/im-credentials.json (chmod 0600)">
					<div className="flex w-[260px] items-center gap-1.5">
						<input
							type={showSecret ? "text" : "password"}
							value={form.appSecret}
							onChange={(e) => updateField("appSecret", e.target.value)}
							className={cn(
								"flex-1 rounded-md border bg-secondary px-2.5 py-1.5 text-[12px] text-foreground",
								validation.errors.appSecret ? "border-red-400" : "border-input",
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
				</SettingRow>
				<SettingRow title="Verification Token" description="可选；事件订阅校验 token">
					<input
						type="text"
						value={form.verificationToken}
						onChange={(e) => updateField("verificationToken", e.target.value)}
						className="w-[260px] rounded-md border border-input bg-secondary px-2.5 py-1.5 text-[12px] text-foreground"
						placeholder="可选"
					/>
				</SettingRow>
				<SettingRow title="Encrypt Key" description="可选；事件加密 key">
					<input
						type="text"
						value={form.encryptKey}
						onChange={(e) => updateField("encryptKey", e.target.value)}
						className="w-[260px] rounded-md border border-input bg-secondary px-2.5 py-1.5 text-[12px] text-foreground"
						placeholder="可选"
					/>
				</SettingRow>
				<SettingRow title="传输模式" description="首期固定为长连接（基于飞书 oapi-sdk-go）">
					<select
						value="long-connection"
						disabled
						className="w-[260px] rounded-md border border-input bg-secondary px-2.5 py-1.5 text-[12px] text-foreground"
					>
						<option value="long-connection">长连接</option>
					</select>
				</SettingRow>
				<div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-border">
					<div className="text-[12px] text-muted-foreground">
						{saveError && <span className="text-red-500">{saveError}</span>}
						{saveOk && !saveError && <span className="text-green-600 dark:text-green-400">{saveOk}</span>}
						{testResult && !saveError && !saveOk && <span>{testResult}</span>}
					</div>
					<div className="flex gap-2">
						<button
							type="button"
							onClick={() => void handleTest()}
							disabled={testing}
							className="rounded-lg border border-input bg-secondary px-3 py-1.5 text-[12px] text-foreground transition-colors hover:bg-accent disabled:opacity-50"
						>
							{testing ? "测试中..." : "测试连接"}
						</button>
						<button
							type="button"
							onClick={() => void handleSave()}
							disabled={!validation.valid || saving}
							className="rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
						>
							{saving ? "保存中..." : "保存"}
						</button>
					</div>
				</div>
			</SettingSection>

			{/* ─────────────────────────────────────────────────────────────── */}
			<SettingSection
				title={
					<div className="flex items-center justify-between">
						<span>状态与日志</span>
						<StatusBadge status={transportStatus} />
					</div>
				}
			>
				<SettingRow title="活跃会话数" description="桥接进程当前持有的 coding-agent 子进程数量">
					<span className="text-[13px] tabular-nums text-foreground">{status?.activeSessions ?? 0}</span>
				</SettingRow>
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
						disabled={!form.enabled}
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
					<h2 className="text-[14px] font-semibold text-foreground">实时日志（最近 500 条）</h2>
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
