import { useCallback, useEffect, useState } from "react";
import type { ModelsConfigData, ProviderTemplate } from "@preload/api.js";
import { cn } from "@shared/lib/utils";
import { Button } from "@shared/components/ui/button";
import { ProviderIcon } from "@shared/components/provider-icon";
import { SettingSection } from "./shared";
import { InputField } from "./ModelsSettings";

type ProviderEntry = ModelsConfigData["providers"][string];

/** 一行展示用的模板:live(来自服务端) 或 orphaned(已采纳但服务端已下线,只有本地快照)。 */
interface TemplateRow {
	id: string;
	displayName: string;
	api: string;
	baseUrl?: string;
	icon?: string;
	models: NonNullable<ProviderEntry["models"]>;
	offline: boolean;
}

type ModelCost = { input: number; output: number; cacheRead: number; cacheWrite: number };

/**
 * 价格摘要(元/百万 tokens):只展示模型实际配置了的价格项——
 * 输入(未命中) / 命中(缓存读) / 写入(缓存写,没有就不展示) / 输出。全 0 或无价返回 null。
 */
function formatPrice(cost: ModelCost | undefined): string | null {
	if (!cost) return null;
	// 保留有效小数、去尾零:0.0029 不能被 toFixed(2) 抹成 0.00(与服务端对不上)。
	const num = (n: number) => (Number.isInteger(n) ? String(n) : parseFloat(n.toFixed(6)).toString());
	const parts: string[] = [];
	if (cost.input) parts.push(`输入 ¥${num(cost.input)}`);
	if (cost.cacheRead) parts.push(`命中 ¥${num(cost.cacheRead)}`);
	if (cost.cacheWrite) parts.push(`写入 ¥${num(cost.cacheWrite)}`);
	if (cost.output) parts.push(`输出 ¥${num(cost.output)}`);
	if (parts.length === 0) return null;
	return parts.join(" · ");
}

export function PresetProvidersSection({
	config,
	saveConfig,
}: {
	config: ModelsConfigData;
	saveConfig: (config: ModelsConfigData) => Promise<void>;
}): JSX.Element {
	const [templates, setTemplates] = useState<ProviderTemplate[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [openId, setOpenId] = useState<string | null>(null);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [draftKey, setDraftKey] = useState("");
	const [saving, setSaving] = useState(false);

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const result = await window.vetta.models.fetchTemplates();
			setTemplates(result.templates);
			if (result.error) setError(result.error);
		} catch {
			setError("拉取失败");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	// live 模板 + 已采纳但服务端下线的孤儿条目,按 id 去重合并展示
	const liveIds = new Set(templates.map((t) => t.id));
	const orphaned: TemplateRow[] = Object.entries(config.providers)
		.filter(([id, p]) => p.source === "template" && !liveIds.has(id))
		.map(([id, p]) => ({
			id,
			displayName: id,
			api: p.api ?? "",
			baseUrl: p.baseUrl,
			icon: p.icon,
			models: p.models ?? [],
			offline: true,
		}));
	const rows: TemplateRow[] = [
		...templates.map((t) => ({
			id: t.id,
			displayName: t.displayName,
			api: t.api,
			baseUrl: t.baseUrl,
			icon: t.icon,
			models: t.models,
			offline: false,
		})),
		...orphaned,
	];

	const isAdopted = (id: string): boolean => config.providers[id]?.source === "template";

	const startEdit = (row: TemplateRow): void => {
		setOpenId(row.id);
		setDraftKey(config.providers[row.id]?.apiKey ?? "");
	};

	const adopt = useCallback(
		async (row: TemplateRow): Promise<void> => {
			const key = draftKey.trim();
			if (!key) return;
			setSaving(true);
			try {
				const entry: ProviderEntry = {
					source: "template",
					templateId: row.id,
					displayName: row.displayName,
					icon: row.icon,
					api: row.api,
					baseUrl: row.baseUrl,
					apiKey: key,
					models: row.models,
				};
				await saveConfig({
					...config,
					providers: { ...config.providers, [row.id]: entry },
				});
				setOpenId(null);
				setDraftKey("");
			} finally {
				setSaving(false);
			}
		},
		[config, draftKey, saveConfig],
	);

	const remove = useCallback(
		async (row: TemplateRow): Promise<void> => {
			const providers = { ...config.providers };
			delete providers[row.id];
			const defaultModel = config.defaultModel?.startsWith(`${row.id}/`) ? undefined : config.defaultModel;
			await saveConfig({ ...config, defaultModel, providers });
			if (openId === row.id) setOpenId(null);
		},
		[config, openId, saveConfig],
	);

	return (
		<div className="mt-6">
			<SettingSection
				title={
					<div className="flex items-center justify-between">
						<span>预设服务商</span>
						<button
							type="button"
							onClick={() => void load()}
							disabled={loading}
							className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
						>
							<span className={cn("icon-[mdi--refresh] h-3.5 w-3.5", loading && "animate-spin")} />
							{loading ? "刷新中…" : "刷新"}
						</button>
					</div>
				}
			>
				{error && rows.length === 0 && (
					<div className="flex items-center gap-2 px-5 py-3 text-[12px] text-amber-400">
						<span className="icon-[mdi--alert-circle-outline] h-3.5 w-3.5 shrink-0" />
						{error}，点击刷新重试
					</div>
				)}
				{rows.length === 0 && !error && (
					<div className="px-5 py-6 text-center text-[12px] text-muted-foreground">
						{loading ? "加载中…" : "暂无预设服务商，点击刷新获取"}
					</div>
				)}

				{rows.map((row) => {
					const adopted = isAdopted(row.id);
					const isOpen = openId === row.id;
					const isExpanded = expandedId === row.id;
					return (
						<div key={row.id} className="border-b border-border last:border-b-0">
							<div className="flex items-center gap-3 px-5 py-3.5">
								<button
									type="button"
									onClick={() => setExpandedId(isExpanded ? null : row.id)}
									className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
									title={isExpanded ? "收起模型" : "查看模型与价格"}
								>
									<span
										className={cn(
											"icon-[mdi--chevron-right] h-4 w-4 transition-transform",
											isExpanded && "rotate-90",
										)}
									/>
								</button>
								<ProviderIcon symbol={row.icon} className="h-7 w-7" />
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
										{row.displayName}
										{adopted && (
											<span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium text-primary">
												已启用
											</span>
										)}
										{row.offline && (
											<span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium text-amber-400">
												服务端已下线
											</span>
										)}
									</div>
									<div className="mt-0.5 text-[11px] text-muted-foreground">
										{row.api || "—"} · {row.models.length} 个模型
									</div>
								</div>
								<div className="flex items-center gap-1">
									{adopted ? (
										<>
											<button
												type="button"
												onClick={() => (isOpen ? setOpenId(null) : startEdit(row))}
												className="flex h-7 items-center rounded-lg px-2.5 text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
											>
												{isOpen ? "收起" : "改 Key"}
											</button>
											<button
												type="button"
												onClick={() => void remove(row)}
												className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400"
												title="移除"
											>
												<span className="icon-[mdi--delete-outline] h-3.5 w-3.5" />
											</button>
										</>
									) : (
										<Button
											variant="primary"
											size="sm"
											onClick={() => (isOpen ? setOpenId(null) : startEdit(row))}
											disabled={row.offline}
										>
											{isOpen ? "收起" : "启用"}
										</Button>
									)}
								</div>
							</div>

							{isOpen && (
								<div className="border-t border-border bg-secondary/40 px-5 py-3">
									<label className="mb-1 block text-[11px] text-muted-foreground">
										API Key（直连 {row.displayName}，仅存本地）
									</label>
									<div className="flex items-center gap-2">
										<div className="flex-1">
											<InputField
												value={draftKey}
												onChange={setDraftKey}
												placeholder="sk-..."
												type="password"
											/>
										</div>
										<Button
											variant="primary"
											size="sm"
											onClick={() => void adopt(row)}
											disabled={!draftKey.trim() || saving}
										>
											{adopted ? "保存" : "启用"}
										</Button>
									</div>
								</div>
							)}

							{isExpanded && (
								<div className="border-t border-border bg-secondary/30">
									{row.models.length === 0 && (
										<div className="px-5 py-4 text-center text-[12px] text-muted-foreground">暂无模型</div>
									)}
									{row.models.map((m) => {
										const price = formatPrice(m.cost);
										return (
											<div
												key={m.id}
												className="border-b border-border/50 px-5 py-2 pl-12 last:border-b-0"
											>
												<div className="truncate text-[12px] text-foreground">{m.name || m.id}</div>
												<div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
													{m.contextWindow != null && <span>{(m.contextWindow / 1024).toFixed(0)}K ctx</span>}
													{m.input?.includes("image") && (
														<span className="rounded bg-blue-500/10 px-1 py-0.5 text-[9px] text-blue-400">vision</span>
													)}
													{m.reasoning && (
														<span className="rounded bg-purple-500/10 px-1 py-0.5 text-[9px] text-purple-400">思考</span>
													)}
												</div>
												{price && (
													<div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground/80">
														<span>{price}</span>
														<span className="rounded bg-accent px-1 py-0.5 text-[9px] text-muted-foreground">
															/百万Tokens
														</span>
													</div>
												)}
											</div>
										);
									})}
								</div>
							)}
						</div>
					);
				})}
			</SettingSection>
		</div>
	);
}
