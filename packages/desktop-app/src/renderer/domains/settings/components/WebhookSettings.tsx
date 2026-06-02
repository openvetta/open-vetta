import { useCallback, useEffect, useMemo, useState } from "react";
import type {
	WebhookCreateInput,
	WebhookEndpointPublic,
	WebhookKind,
	WebhookProviderDescriptor,
	WebhookUpdatePatch,
} from "@preload/api";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@shared/components/ui/dialog";
import { Switch } from "@shared/components/ui/switch";
import { cn } from "@shared/lib/utils";
import { SettingSection } from "./shared";
import { SETTINGS_SECTION } from "../registry";

// =============================================================================
// Form state
// =============================================================================

interface FormState {
	kind: WebhookKind;
	name: string;
	webhookUrl: string;
	signSecret: string;
	feishuMentionAll: boolean;
	dingtalkMentionAll: boolean;
	dingtalkAtMobiles: string; // comma-separated input
	dingtalkKeyword: string;
}

function emptyForm(kind: WebhookKind): FormState {
	return {
		kind,
		name: "",
		webhookUrl: "",
		signSecret: "",
		feishuMentionAll: false,
		dingtalkMentionAll: false,
		dingtalkAtMobiles: "",
		dingtalkKeyword: "",
	};
}

function formFromEndpoint(ep: WebhookEndpointPublic): FormState {
	return {
		kind: ep.kind,
		name: ep.name,
		webhookUrl: "",
		signSecret: "",
		feishuMentionAll: Boolean(ep.feishu?.mentionAll),
		dingtalkMentionAll: Boolean(ep.dingtalk?.mentionAll),
		dingtalkAtMobiles: ep.dingtalk?.atMobiles?.join(", ") ?? "",
		dingtalkKeyword: ep.dingtalk?.keyword ?? "",
	};
}

function parseMobiles(raw: string): string[] {
	return raw
		.split(/[,，\s]+/)
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

// =============================================================================
// Main component
// =============================================================================

export function WebhookSettings(): JSX.Element {
	const [endpoints, setEndpoints] = useState<WebhookEndpointPublic[]>([]);
	const [providers, setProviders] = useState<WebhookProviderDescriptor[]>([]);
	const [loading, setLoading] = useState(true);
	const [editorOpen, setEditorOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [form, setForm] = useState<FormState>(emptyForm("feishu"));
	const [editorError, setEditorError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [testingId, setTestingId] = useState<string | null>(null);
	const [rowMessage, setRowMessage] = useState<Record<string, { ok: boolean; text: string }>>({});

	const refresh = useCallback(async () => {
		const [list, provs] = await Promise.all([
			window.vetta.webhook.list(),
			window.vetta.webhook.listProviders(),
		]);
		setEndpoints(list);
		setProviders(provs);
	}, []);

	useEffect(() => {
		void (async () => {
			await refresh();
			setLoading(false);
		})();
	}, [refresh]);

	const providerByKind = useMemo(() => {
		const map = new Map<WebhookKind, WebhookProviderDescriptor>();
		for (const p of providers) map.set(p.kind, p);
		return map;
	}, [providers]);

	const openCreate = useCallback(() => {
		setEditingId(null);
		setForm(emptyForm(providers[0]?.kind ?? "feishu"));
		setEditorError(null);
		setEditorOpen(true);
	}, [providers]);

	const openEdit = useCallback((ep: WebhookEndpointPublic) => {
		setEditingId(ep.id);
		setForm(formFromEndpoint(ep));
		setEditorError(null);
		setEditorOpen(true);
	}, []);

	const handleToggle = useCallback(
		async (ep: WebhookEndpointPublic, next: boolean) => {
			const res = await window.vetta.webhook.toggle(ep.id, next);
			if (!res.ok) {
				setRowMessage((prev) => ({ ...prev, [ep.id]: { ok: false, text: res.error ?? "切换失败" } }));
				return;
			}
			await refresh();
		},
		[refresh],
	);

	const handleDelete = useCallback(
		async (ep: WebhookEndpointPublic) => {
			if (!window.confirm(`删除 Webhook「${ep.name}」？此操作不可撤销。`)) return;
			await window.vetta.webhook.delete(ep.id);
			await refresh();
		},
		[refresh],
	);

	const handleTest = useCallback(async (ep: WebhookEndpointPublic) => {
		setTestingId(ep.id);
		setRowMessage((prev) => ({ ...prev, [ep.id]: { ok: true, text: "发送中..." } }));
		try {
			const res = await window.vetta.webhook.test(ep.id);
			setRowMessage((prev) => ({
				...prev,
				[ep.id]: { ok: res.ok, text: res.ok ? "测试消息已发送" : (res.error ?? "发送失败") },
			}));
		} finally {
			setTestingId(null);
		}
	}, []);

	const handleSubmit = useCallback(async () => {
		const url = form.webhookUrl.trim();
		const name = form.name.trim() || providerByKind.get(form.kind)?.displayName || "未命名";

		if (!editingId && !url) {
			setEditorError("Webhook URL 不能为空");
			return;
		}

		const kindOpts: Pick<WebhookCreateInput, "feishu" | "dingtalk"> =
			form.kind === "feishu"
				? { feishu: { mentionAll: form.feishuMentionAll } }
				: {
						dingtalk: {
							mentionAll: form.dingtalkMentionAll,
							atMobiles: parseMobiles(form.dingtalkAtMobiles),
							keyword: form.dingtalkKeyword.trim() || undefined,
						},
					};

		setSaving(true);
		setEditorError(null);
		try {
			if (editingId) {
				const patch: WebhookUpdatePatch = {
					name,
					...kindOpts,
				};
				if (url) patch.webhookUrl = url;
				// signSecret: empty string clears, undefined leaves alone.
				if (form.signSecret !== "") patch.signSecret = form.signSecret;
				const res = await window.vetta.webhook.update(editingId, patch);
				if (!res.ok) {
					setEditorError(res.error ?? "保存失败");
					return;
				}
			} else {
				const input: WebhookCreateInput = {
					kind: form.kind,
					name,
					webhookUrl: url,
					signSecret: form.signSecret.trim() || undefined,
					enabled: true,
					...kindOpts,
				};
				const res = await window.vetta.webhook.create(input);
				if (!res.ok) {
					setEditorError(res.error ?? "创建失败");
					return;
				}
			}
			await refresh();
			setEditorOpen(false);
		} finally {
			setSaving(false);
		}
	}, [editingId, form, providerByKind, refresh]);

	if (loading) {
		return (
			<div className="mx-auto w-full max-w-[680px] px-8 py-4">
				<h1 className="mb-6 text-[20px] font-bold text-foreground">消息推送</h1>
				<div className="text-[13px] text-muted-foreground">加载中...</div>
			</div>
		);
	}

	return (
		<div className="mx-auto w-full max-w-[680px] px-8 py-4">
			<h1 className="mb-2 text-[20px] font-bold text-foreground">消息推送</h1>
			<p className="mb-6 text-[12px] text-muted-foreground">
				通过 Webhook 把 Vetta 的事件推送到飞书 / 钉钉群机器人。支持多通道并发推送、Markdown 渲染、加签校验。
			</p>

			<SettingSection
				section={SETTINGS_SECTION["webhook-channels"]}
				title={
					<div className="flex items-center justify-between">
						<span>渠道列表</span>
						<button
							type="button"
							onClick={openCreate}
							className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
						>
							<span className="icon-[mdi--plus] h-4 w-4" />
							新增 Webhook
						</button>
					</div>
				}
			>
				{endpoints.length === 0 ? (
					<div className="px-5 py-10 text-center text-[12px] text-muted-foreground">
						暂无 Webhook，点击右上角「新增 Webhook」开始配置。
					</div>
				) : (
					<div className="divide-y divide-border">
						{endpoints.map((ep) => {
							const provider = providerByKind.get(ep.kind);
							const message = rowMessage[ep.id];
							return (
								<div key={ep.id} className="flex flex-col gap-2 px-5 py-3">
									<div className="flex items-center gap-3">
										<span
											className={cn(
												provider?.iconClass ?? "icon-[mdi--webhook]",
												"h-5 w-5 shrink-0 text-foreground",
											)}
										/>
										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-2">
												<span className="truncate text-[13px] font-medium text-foreground">
													{ep.name}
												</span>
												<span className="rounded-full bg-muted-foreground/15 px-1.5 py-0.5 text-[10px] text-muted-foreground">
													{provider?.displayName ?? ep.kind}
												</span>
												{ep.hasSignSecret && (
													<span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">
														加签
													</span>
												)}
											</div>
											<div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
												{ep.urlMask ?? "—"}
											</div>
										</div>
										<Switch
											checked={ep.enabled}
											onCheckedChange={(v) => void handleToggle(ep, v)}
										/>
										<button
											type="button"
											onClick={() => void handleTest(ep)}
											disabled={testingId === ep.id}
											className="rounded-md border border-input bg-secondary px-2.5 py-1 text-[11px] text-foreground transition-colors hover:bg-accent disabled:opacity-50"
											title="发送测试消息"
										>
											{testingId === ep.id ? "测试中..." : "测试"}
										</button>
										<button
											type="button"
											onClick={() => openEdit(ep)}
											className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
											title="编辑"
										>
											<span className="icon-[mdi--pencil-outline] h-3.5 w-3.5" />
										</button>
										<button
											type="button"
											onClick={() => void handleDelete(ep)}
											className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
											title="删除"
										>
											<span className="icon-[mdi--trash-can-outline] h-3.5 w-3.5" />
										</button>
									</div>
									{message && (
										<div
											className={cn(
												"pl-8 text-[11px]",
												message.ok ? "text-muted-foreground" : "text-red-500",
											)}
										>
											{message.text}
										</div>
									)}
								</div>
							);
						})}
					</div>
				)}
			</SettingSection>

			<WebhookEditorDialog
				open={editorOpen}
				onOpenChange={setEditorOpen}
				editingId={editingId}
				providers={providers}
				form={form}
				setForm={setForm}
				error={editorError}
				saving={saving}
				onSubmit={() => void handleSubmit()}
			/>
		</div>
	);
}

// =============================================================================
// Editor dialog
// =============================================================================

function WebhookEditorDialog({
	open,
	onOpenChange,
	editingId,
	providers,
	form,
	setForm,
	error,
	saving,
	onSubmit,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	editingId: string | null;
	providers: WebhookProviderDescriptor[];
	form: FormState;
	setForm: React.Dispatch<React.SetStateAction<FormState>>;
	error: string | null;
	saving: boolean;
	onSubmit: () => void;
}): JSX.Element {
	const isEdit = editingId !== null;
	const [showSecret, setShowSecret] = useState(false);

	const setField = useCallback(
		<K extends keyof FormState>(key: K, value: FormState[K]) => {
			setForm((prev) => ({ ...prev, [key]: value }));
		},
		[setForm],
	);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[480px]">
				<DialogHeader>
					<DialogTitle>{isEdit ? "编辑 Webhook" : "新增 Webhook"}</DialogTitle>
					<DialogDescription>
						{isEdit
							? "URL 与签名 Secret 留空表示不修改；其它字段会按当前内容覆盖保存。"
							: "凭据将本地存储于 ~/.vetta/desktop-app/webhook-credentials.json (chmod 0600)。"}
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-3 py-2">
					<div>
						<label className="mb-1 block text-[12px] font-medium text-foreground">渠道类型</label>
						<div className="flex gap-2">
							{providers.map((p) => (
								<button
									key={p.kind}
									type="button"
									disabled={isEdit && p.kind !== form.kind}
									onClick={() => setField("kind", p.kind)}
									className={cn(
										"flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[12px] transition-colors",
										form.kind === p.kind
											? "border-primary bg-primary/10 text-foreground"
											: "border-input bg-secondary text-muted-foreground hover:bg-accent",
										isEdit && p.kind !== form.kind && "opacity-40",
									)}
								>
									<span className={cn(p.iconClass, "h-4 w-4")} />
									{p.displayName}
								</button>
							))}
						</div>
						{isEdit && (
							<div className="mt-1 text-[11px] text-muted-foreground">编辑模式下不可切换渠道类型</div>
						)}
					</div>

					<div>
						<label className="mb-1 block text-[12px] font-medium text-foreground">名称</label>
						<input
							type="text"
							value={form.name}
							onChange={(e) => setField("name", e.target.value)}
							placeholder="例：研发告警群"
							className="w-full rounded-md border border-input bg-secondary px-2.5 py-1.5 text-[12px] text-foreground"
						/>
					</div>

					<div>
						<label className="mb-1 block text-[12px] font-medium text-foreground">
							Webhook URL{isEdit && <span className="ml-1 text-muted-foreground">（留空不修改）</span>}
						</label>
						<input
							type="text"
							value={form.webhookUrl}
							onChange={(e) => setField("webhookUrl", e.target.value)}
							placeholder={
								form.kind === "feishu"
									? "https://open.feishu.cn/open-apis/bot/v2/hook/xxxx"
									: "https://oapi.dingtalk.com/robot/send?access_token=xxxx"
							}
							className="w-full rounded-md border border-input bg-secondary px-2.5 py-1.5 font-mono text-[11px] text-foreground"
						/>
					</div>

					<div>
						<label className="mb-1 block text-[12px] font-medium text-foreground">
							签名 Secret{" "}
							<span className="text-muted-foreground">
								（可选；启用了加签校验时填写{isEdit ? "；留空不修改，填空格清除" : ""}）
							</span>
						</label>
						<div className="flex items-center gap-1.5">
							<input
								type={showSecret ? "text" : "password"}
								value={form.signSecret}
								onChange={(e) => setField("signSecret", e.target.value)}
								placeholder={form.kind === "feishu" ? "secret" : "SECxxxx"}
								className="flex-1 rounded-md border border-input bg-secondary px-2.5 py-1.5 text-[12px] text-foreground"
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

					{form.kind === "feishu" && (
						<div className="flex items-center justify-between rounded-md border border-input bg-secondary px-3 py-2">
							<div className="text-[12px] text-foreground">
								@所有人
								<div className="text-[11px] text-muted-foreground">在每条消息开头插入 @all 标签</div>
							</div>
							<Switch
								checked={form.feishuMentionAll}
								onCheckedChange={(v) => setField("feishuMentionAll", v)}
							/>
						</div>
					)}

					{form.kind === "dingtalk" && (
						<>
							<div className="flex items-center justify-between rounded-md border border-input bg-secondary px-3 py-2">
								<div className="text-[12px] text-foreground">
									@所有人
									<div className="text-[11px] text-muted-foreground">需机器人开启 @所有人权限</div>
								</div>
								<Switch
									checked={form.dingtalkMentionAll}
									onCheckedChange={(v) => setField("dingtalkMentionAll", v)}
								/>
							</div>
							<div>
								<label className="mb-1 block text-[12px] font-medium text-foreground">
									@手机号 <span className="text-muted-foreground">（多个用逗号分隔）</span>
								</label>
								<input
									type="text"
									value={form.dingtalkAtMobiles}
									onChange={(e) => setField("dingtalkAtMobiles", e.target.value)}
									placeholder="13800138000, 13900139000"
									className="w-full rounded-md border border-input bg-secondary px-2.5 py-1.5 text-[12px] text-foreground"
								/>
							</div>
							<div>
								<label className="mb-1 block text-[12px] font-medium text-foreground">
									关键词{" "}
									<span className="text-muted-foreground">
										（机器人安全设置选「自定义关键词」时必填，将自动拼到消息标题前）
									</span>
								</label>
								<input
									type="text"
									value={form.dingtalkKeyword}
									onChange={(e) => setField("dingtalkKeyword", e.target.value)}
									placeholder="例：Vetta"
									className="w-full rounded-md border border-input bg-secondary px-2.5 py-1.5 text-[12px] text-foreground"
								/>
							</div>
						</>
					)}

					<div className="min-h-[18px] text-[12px]">
						{error && <span className="text-red-500">{error}</span>}
					</div>
				</div>

				<DialogFooter>
					<button
						type="button"
						onClick={() => onOpenChange(false)}
						disabled={saving}
						className="rounded-lg border border-input bg-secondary px-3 py-1.5 text-[12px] text-foreground transition-colors hover:bg-accent disabled:opacity-50"
					>
						取消
					</button>
					<button
						type="button"
						onClick={onSubmit}
						disabled={saving}
						className="rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
					>
						{saving ? "保存中..." : "保存"}
					</button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
