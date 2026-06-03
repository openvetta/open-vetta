import { useAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import type { SubscriptionStatus } from "@preload/api.js";
import { remoteProvidersAtom, subscriptionStatusAtom } from "@shared/store/atoms";
import { cn } from "@shared/lib/utils";
import { ProviderIcon } from "@shared/components/provider-icon";
import { WINDOW_LABELS, formatExpiry, formatResetCountdown } from "@shared/lib/subscription-format";

/** Vetta Go 会员卡：仅在 active && go_enabled 时展示。 */
function VettaGoCard({
	status,
	goProvider,
	onRefresh,
	refreshing,
}: {
	status: SubscriptionStatus;
	goProvider: { icon?: string; models?: Array<{ id: string; name?: string; input?: string[]; reasoning?: boolean; tags?: string[]; contextWindow?: number; maxTokens?: number }> } | undefined;
	onRefresh: () => void;
	refreshing: boolean;
}): JSX.Element {
	const [modelsExpanded, setModelsExpanded] = useState(false);
	const [now, setNow] = useState(() => Date.now());
	const models = goProvider?.models ?? [];
	const windows = status.windows ?? [];
	const expiry = formatExpiry(status.expires_at);

	// 每分钟刷新倒计时显示。
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 60000);
		return () => clearInterval(timer);
	}, []);

	return (
		<div className="mb-6">
			<div className="relative overflow-hidden rounded-2xl border border-amber-500/25 bg-gradient-to-br from-amber-500/15 via-amber-400/5 to-transparent p-5">
				<div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-amber-500/15 blur-3xl" />
				<div className="pointer-events-none absolute -bottom-12 -left-8 h-32 w-32 rounded-full bg-amber-400/10 blur-3xl" />

				<div className="relative flex items-start justify-between gap-3">
					<div className="flex items-center gap-3">
						<ProviderIcon symbol={goProvider?.icon} className="h-11 w-11 rounded-xl" />
						<div>
							<div className="flex items-center gap-2 text-[16px] font-bold text-foreground">
								{status.tier_name || "Vetta Go"}
								{status.badge_text && (
									<span
										className="rounded-full px-1.5 py-0.5 text-[9px] font-medium text-white"
										style={{ backgroundColor: status.badge_color || "#f59e0b" }}
									>
										{status.badge_text}
									</span>
								)}
							</div>
							<div className="mt-0.5 text-[12px] text-muted-foreground">
								{status.description || `Token 套餐 · ${models.length} 个模型`}
							</div>
						</div>
					</div>
					<button
						type="button"
						onClick={onRefresh}
						disabled={refreshing}
						className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] text-amber-500 transition-colors hover:bg-amber-500/10 disabled:opacity-50"
					>
						<span className={cn("icon-[mdi--refresh] h-3.5 w-3.5", refreshing && "animate-spin")} />
						{refreshing ? "刷新中…" : "刷新"}
					</button>
				</div>

				{expiry && (
					<div className="relative mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
						<span className="icon-[mdi--calendar-clock] h-3.5 w-3.5 shrink-0" />
						到期日 {expiry}
					</div>
				)}

				{/* 配额窗口：所有窗口 limit<=0 视为无限制，隐藏进度只提示不限额度 */}
				{windows.length > 0 && windows.every((w) => w.limit <= 0) ? (
					<div className="relative mt-4 flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2.5 text-[12px] font-medium text-amber-500">
						<span className="icon-[mdi--infinity] h-4 w-4 shrink-0" />
						无限制 · 不限额度
					</div>
				) : windows.length > 0 ? (
					<div className="relative mt-4 space-y-2">
						{windows.map((w) => {
							const pct = w.limit > 0 ? Math.min(100, Math.round((w.consumed / w.limit) * 100)) : 0;
							return (
								<div key={w.kind} className="rounded-xl border border-border bg-background/40 px-3 py-2.5">
									<div className="flex items-center justify-between text-[12px]">
										<span className="font-medium text-foreground">{WINDOW_LABELS[w.kind]}</span>
										<span className="text-muted-foreground">
											{Math.round(w.consumed)} / {Math.round(w.limit)}
										</span>
									</div>
									<div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-border">
										<div
											className="h-full rounded-full bg-amber-500/70 transition-all"
											style={{ width: `${pct}%` }}
										/>
									</div>
									<div className="mt-1 text-[10px] text-muted-foreground">
										{formatResetCountdown(w.reset_at, now)}
									</div>
								</div>
							);
						})}
					</div>
				) : null}

				{/* 模型列表 */}
				<button
					type="button"
					onClick={() => setModelsExpanded((v) => !v)}
					disabled={models.length === 0}
					className="relative mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/5 py-2 text-[12px] font-medium text-amber-500 transition-colors hover:bg-amber-500/10 disabled:opacity-50"
				>
					<span
						className={cn(
							"icon-[mdi--chevron-down] h-4 w-4 transition-transform",
							modelsExpanded && "rotate-180",
						)}
					/>
					{models.length === 0 ? "暂无模型，点击上方刷新" : modelsExpanded ? "收起模型" : "查看模型"}
				</button>

				{modelsExpanded && models.length > 0 && (
					<div className="relative mt-3 grid grid-cols-2 gap-2">
						{models.map((model) => (
							<div key={model.id} className="rounded-xl border border-border bg-background/40 px-3 py-2.5">
								<div className="truncate text-[12px] font-medium text-foreground">
									{model.name || model.id}
								</div>
								<div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
									{model.input?.includes("image") && (
										<span className="rounded bg-blue-500/10 px-1 py-0.5 text-blue-400">vision</span>
									)}
									{model.reasoning && (
										<span className="rounded bg-purple-500/10 px-1 py-0.5 text-purple-400">reasoning</span>
									)}
									{model.tags?.map((tag) => (
										<span key={tag} className="rounded bg-accent px-1 py-0.5 text-muted-foreground">{tag.trim()}</span>
									))}
									{model.contextWindow != null && (
										<span>{(model.contextWindow / 1024).toFixed(0)}K ctx</span>
									)}
									{model.maxTokens != null && (
										<span>· {(model.maxTokens / 1024).toFixed(0)}K max</span>
									)}
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

type RemoteModel = { id: string; name?: string; api?: string; input?: string[]; reasoning?: boolean; contextWindow?: number; maxTokens?: number; tags?: string[] };
type RemoteProvider = { api?: string; baseUrl?: string; icon?: string; models?: RemoteModel[] };

/**
 * Vetta Zen / Vetta Go 会员卡片区。原先位于模型设置页，现归入账户设置页。
 * 自行拉取一次套餐状态与远程 providers，并提供刷新按钮。
 */
export function SubscriptionCards(): JSX.Element | null {
	const [remoteProviders, setRemoteProviders] = useAtom(remoteProvidersAtom);
	const [subscriptionStatus, setSubscriptionStatus] = useAtom(subscriptionStatusAtom);
	const [refreshing, setRefreshing] = useState(false);
	const [remoteError, setRemoteError] = useState<string | null>(null);
	const [zenModelsExpanded, setZenModelsExpanded] = useState(false);

	const handleRefreshRemote = useCallback(async () => {
		setRefreshing(true);
		setRemoteError(null);
		try {
			const [result, sub] = await Promise.all([
				window.vetta.models.fetchRemote(),
				window.vetta.subscription.getStatus(),
			]);
			if (result.error) {
				setRemoteError(result.error);
			}
			setRemoteProviders(result.providers);
			// 拉取成功才覆盖；失败时保留内存态，UI 回退到缓存标志。
			if (sub.status) setSubscriptionStatus(sub.status);
		} catch {
			setRemoteError("请求失败");
		} finally {
			setRefreshing(false);
		}
	}, [setRemoteProviders, setSubscriptionStatus]);

	// 打开账户页时拉取一次套餐状态（与远程 providers 对齐）。
	useEffect(() => {
		void window.vetta.subscription
			.getStatus()
			.then((sub) => {
				if (sub.status) setSubscriptionStatus(sub.status);
			})
			.catch(() => {});
	}, [setSubscriptionStatus]);

	// Vetta Zen:唯一的官方远程服务商(不可增删改),取 remoteProviders 中的单一条目。
	const remoteEntries = Object.entries(remoteProviders as Record<string, RemoteProvider>);
	const zenProvider = remoteEntries.find(([name]) => name === "vetta-zen")?.[1];
	const zenModels = zenProvider?.models ?? [];
	// Zen 可用：provider 存在 或 缓存标志 zen_enabled（离线回退）。两者皆否则隐藏会员卡。
	const zenAvailable = zenProvider !== undefined || subscriptionStatus.zen_enabled;

	// Vetta Go：仅在 active && go_enabled 时展示；模型从 vetta-go provider 读取。
	const goProvider = remoteEntries.find(([name]) => name === "vetta-go")?.[1];
	const showGoCard = subscriptionStatus.active && subscriptionStatus.go_enabled;

	if (!zenAvailable && !showGoCard) return null;

	return (
		<>
			{/* Vetta Go:Token 套餐会员卡,仅在 active && go_enabled 时展示 */}
			{showGoCard && (
				<VettaGoCard
					status={subscriptionStatus}
					goProvider={goProvider}
					onRefresh={() => void handleRefreshRemote()}
					refreshing={refreshing}
				/>
			)}

			{/* Vetta Zen:官方远程服务,会员卡式,模型默认折叠。Zen 不可用时整卡隐藏 */}
			{zenAvailable && (
				<div className="mb-6">
					<div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-5">
						<div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-primary/10 blur-3xl" />
						<div className="pointer-events-none absolute -bottom-12 -left-8 h-32 w-32 rounded-full bg-primary/5 blur-3xl" />

						<div className="relative flex items-start justify-between gap-3">
							<div className="flex items-center gap-3">
								<ProviderIcon symbol={zenProvider?.icon} className="h-11 w-11 rounded-xl" />
								<div>
									<div className="flex items-center gap-2 text-[16px] font-bold text-foreground">
										Vetta Zen
										<span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium text-primary">
											官方
										</span>
									</div>
									<div className="mt-0.5 text-[12px] text-muted-foreground">
										开箱即用 · {zenModels.length} 个模型
									</div>
								</div>
							</div>
							<button
								type="button"
								onClick={() => void handleRefreshRemote()}
								disabled={refreshing}
								className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
							>
								<span className={cn("icon-[mdi--refresh] h-3.5 w-3.5", refreshing && "animate-spin")} />
								{refreshing ? "刷新中…" : "刷新"}
							</button>
						</div>

						{remoteError && (
							<div className="relative mt-3 flex items-center gap-2 text-[12px] text-amber-400">
								<span className="icon-[mdi--alert-circle-outline] h-3.5 w-3.5 shrink-0" />
								{remoteError === "unauthorized" ? "未授权，请先登录" : remoteError}
							</div>
						)}

						{/* 查看模型:点击展开,grid 布局 */}
						<button
							type="button"
							onClick={() => setZenModelsExpanded((v) => !v)}
							disabled={zenModels.length === 0}
							className="relative mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 py-2 text-[12px] font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
						>
							<span
								className={cn(
									"icon-[mdi--chevron-down] h-4 w-4 transition-transform",
									zenModelsExpanded && "rotate-180",
								)}
							/>
							{zenModels.length === 0 ? "暂无模型，点击上方刷新" : zenModelsExpanded ? "收起模型" : "查看模型"}
						</button>

						{zenModelsExpanded && zenModels.length > 0 && (
							<div className="relative mt-3 grid grid-cols-2 gap-2">
								{zenModels.map((model) => (
									<div
										key={model.id}
										className="rounded-xl border border-border bg-background/40 px-3 py-2.5"
									>
										<div className="truncate text-[12px] font-medium text-foreground">
											{model.name || model.id}
										</div>
										<div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
											{model.input?.includes("image") && (
												<span className="rounded bg-blue-500/10 px-1 py-0.5 text-blue-400">vision</span>
											)}
											{model.reasoning && (
												<span className="rounded bg-purple-500/10 px-1 py-0.5 text-purple-400">reasoning</span>
											)}
											{model.tags?.map((tag) => (
												<span key={tag} className="rounded bg-accent px-1 py-0.5 text-muted-foreground">{tag.trim()}</span>
											))}
											{model.contextWindow != null && (
												<span>{(model.contextWindow / 1024).toFixed(0)}K ctx</span>
											)}
											{model.maxTokens != null && (
												<span>· {(model.maxTokens / 1024).toFixed(0)}K max</span>
											)}
										</div>
									</div>
								))}
							</div>
						)}
					</div>
				</div>
			)}
		</>
	);
}
