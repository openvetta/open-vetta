import { useAtom, useAtomValue } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useSpring } from "motion/react";
import type { SubscriptionStatus } from "@preload/api.js";
import { remoteProvidersAtom, subscriptionStatusAtom } from "@shared/store/atoms";
import { creditsBalanceAtom, creditsUnlimitedAtom } from "@shared/store/auth-atoms";
import { cn } from "@shared/lib/utils";
import { ProviderIcon } from "@shared/components/provider-icon";
import { WINDOW_LABELS, formatExpiry, formatResetCountdown } from "@shared/lib/subscription-format";

/** hex(#rgb / #rrggbb) 转 rgba，用于按 badge 颜色生成低饱和渐变（深浅色通用）。 */
function hexToRgba(hex: string, alpha: number): string {
	let h = hex.replace("#", "");
	if (h.length === 3) h = h.split("").map((c) => c + c).join("");
	const n = Number.parseInt(h, 16);
	if (Number.isNaN(n)) return `rgba(245, 158, 11, ${alpha})`;
	return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Vetta Go 品牌标志：渐变 emblem + 字标，带漂浮与光环脉冲。 */
function VettaGoBrand(): JSX.Element {
	return (
		<div className="flex items-center gap-3">
			<motion.div
				className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 via-amber-500 to-orange-500 shadow-lg shadow-amber-500/30"
				animate={{ y: [0, -3, 0] }}
				transition={{ duration: 3, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
			>
				<span className="icon-[mdi--rocket-launch] h-6 w-6 text-white drop-shadow" />
				<motion.span
					className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-amber-300/60"
					animate={{ opacity: [0.6, 0, 0.6], scale: [1, 1.18, 1] }}
					transition={{ duration: 2.4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
				/>
			</motion.div>
			<div className="flex flex-col leading-tight">
				<span className="bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-[18px] font-extrabold tracking-tight text-transparent">
					Vetta Go
				</span>
				<span className="text-[10px] font-medium tracking-[0.18em] text-amber-500/70">
					当前订阅
				</span>
			</div>
		</div>
	);
}

const cardVariants = {
	hidden: { opacity: 0, y: 14, scale: 0.985 },
	show: { opacity: 1, y: 0, scale: 1 },
};

const listVariants = {
	hidden: {},
	show: { transition: { staggerChildren: 0.04 } },
};

const chipVariants = {
	hidden: { opacity: 0, y: 8, scale: 0.96 },
	show: { opacity: 1, y: 0, scale: 1 },
};

/** Vetta Go 会员卡：仅在 active && go_enabled 时展示。 */
function VettaGoCard({
	status,
	goProvider,
	onRefresh,
	refreshing,
}: {
	status: SubscriptionStatus;
	goProvider: { icon?: string; models?: RemoteModel[] } | undefined;
	onRefresh: () => void;
	refreshing: boolean;
}): JSX.Element {
	const [modelsExpanded, setModelsExpanded] = useState(false);
	// 展开动画结束后放开 overflow，避免模型卡 hover 放大被裁剪。
	const [modelsOverflowVisible, setModelsOverflowVisible] = useState(false);
	const [now, setNow] = useState(() => Date.now());
	const [showDone, setShowDone] = useState(false);
	const prevRefreshing = useRef(refreshing);
	const cardRef = useRef<HTMLDivElement>(null);
	const hoveringRef = useRef(false);
	const models = goProvider?.models ?? [];
	const windows = status.windows ?? [];
	const expiry = formatExpiry(status.expires_at);
	const unlimited = windows.length > 0 && windows.every((w) => w.limit <= 0);
	// 卡片渐变跟随订阅主 badge 背景色，低透明度降饱和。
	const themeColor = status.badge_color || "#f59e0b";

	// 鼠标跟随的 3D 倾斜：进卡片悬停时归位停止。
	const rotateX = useSpring(0, { stiffness: 150, damping: 18, mass: 0.4 });
	const rotateY = useSpring(0, { stiffness: 150, damping: 18, mass: 0.4 });

	useEffect(() => {
		const MAX = 3;
		const handle = (e: MouseEvent) => {
			const el = cardRef.current;
			if (!el || hoveringRef.current) return;
			const r = el.getBoundingClientRect();
			const dx = (e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2);
			const dy = (e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2);
			rotateY.set(Math.max(-MAX, Math.min(MAX, dx * MAX)));
			rotateX.set(Math.max(-MAX, Math.min(MAX, -dy * MAX)));
		};
		window.addEventListener("mousemove", handle);
		return () => window.removeEventListener("mousemove", handle);
	}, [rotateX, rotateY]);

	// 折叠时立刻收回 overflow，保证高度动画不漏出内容。
	useEffect(() => {
		if (!modelsExpanded) setModelsOverflowVisible(false);
	}, [modelsExpanded]);

	// 每分钟刷新倒计时显示。
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 60000);
		return () => clearInterval(timer);
	}, []);

	// 刷新完成的正反馈：短暂展示「已更新」。
	useEffect(() => {
		if (prevRefreshing.current && !refreshing) {
			setShowDone(true);
			const t = setTimeout(() => setShowDone(false), 1600);
			prevRefreshing.current = refreshing;
			return () => clearTimeout(t);
		}
		prevRefreshing.current = refreshing;
	}, [refreshing]);

	return (
		<motion.div
			ref={cardRef}
			className="mb-6"
			style={{ rotateX, rotateY, transformPerspective: 900 }}
			variants={cardVariants}
			initial="hidden"
			animate="show"
			transition={{ type: "spring", stiffness: 320, damping: 26 }}
			whileHover={{ y: -3 }}
			onMouseEnter={() => {
				hoveringRef.current = true;
				rotateX.set(0);
				rotateY.set(0);
			}}
			onMouseLeave={() => {
				hoveringRef.current = false;
			}}
		>
			<div
				className="group relative overflow-hidden rounded-2xl border p-5"
				style={{
					borderColor: hexToRgba(themeColor, 0.2),
					backgroundImage: `linear-gradient(to bottom right, ${hexToRgba(themeColor, 0.1)}, ${hexToRgba(themeColor, 0.035)}, transparent)`,
				}}
			>
				{/* 流动光晕 */}
				<motion.div
					className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full blur-3xl"
					style={{ backgroundColor: hexToRgba(themeColor, 0.12) }}
					animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.8, 0.5] }}
					transition={{ duration: 6, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
				/>
				<motion.div
					className="pointer-events-none absolute -bottom-12 -left-8 h-32 w-32 rounded-full blur-3xl"
					style={{ backgroundColor: hexToRgba(themeColor, 0.08) }}
					animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.7, 0.4] }}
					transition={{ duration: 7, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut", delay: 1 }}
				/>

				<div className="relative flex items-start justify-between gap-3">
					<VettaGoBrand />
					<motion.button
						type="button"
						onClick={onRefresh}
						disabled={refreshing}
						whileTap={{ scale: 0.92 }}
						className={cn(
							"flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors disabled:opacity-50",
							showDone ? "text-green-500" : "text-amber-500 hover:bg-amber-500/10",
						)}
					>
						<AnimatePresence mode="wait" initial={false}>
							{showDone ? (
								<motion.span
									key="done"
									initial={{ scale: 0, opacity: 0 }}
									animate={{ scale: 1, opacity: 1 }}
									exit={{ scale: 0, opacity: 0 }}
									className="flex items-center gap-1.5"
								>
									<span className="icon-[mdi--check-circle] h-3.5 w-3.5" />
									已更新
								</motion.span>
							) : (
								<motion.span
									key="idle"
									initial={{ opacity: 0 }}
									animate={{ opacity: 1 }}
									exit={{ opacity: 0 }}
									className="flex items-center gap-1.5"
								>
									<span className={cn("icon-[mdi--refresh] h-3.5 w-3.5", refreshing && "animate-spin")} />
									{refreshing ? "刷新中…" : "刷新"}
								</motion.span>
							)}
						</AnimatePresence>
					</motion.button>
				</div>

				{/* 套餐名 / 描述 */}
				<div className="relative mt-3 flex flex-wrap items-center gap-2">
					{status.badge_text && (
						<span
							className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm"
							style={{ backgroundColor: status.badge_color || "#f59e0b" }}
						>
							{status.badge_text}
						</span>
					)}
					<span className="text-[12px] text-muted-foreground">
						{status.description || `${status.tier_name || "Token 套餐"} · ${models.length} 个模型`}
					</span>
				</div>

				{expiry && (
					<div className="relative mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
						<span className="icon-[mdi--calendar-clock] h-3.5 w-3.5 shrink-0" />
						到期日 {expiry}
					</div>
				)}

				{/* 配额窗口：所有窗口 limit<=0 视为无限制，隐藏进度只提示不限额度 */}
				{unlimited ? (
					<motion.div
						className="relative mt-4 flex items-center gap-2 overflow-hidden rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/15 to-orange-500/10 px-3 py-3 text-[13px] font-semibold text-amber-500"
						initial={{ opacity: 0, scale: 0.97 }}
						animate={{ opacity: 1, scale: 1 }}
						transition={{ delay: 0.1 }}
					>
						<motion.span
							className="icon-[mdi--infinity] h-5 w-5 shrink-0"
							animate={{ scale: [1, 1.15, 1] }}
							transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
						/>
						无限制 · 畅享不限额度
						<motion.span
							className="pointer-events-none absolute inset-0 -skew-x-12 bg-gradient-to-r from-transparent via-white/15 to-transparent"
							animate={{ x: ["-120%", "220%"] }}
							transition={{ duration: 2.6, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut", repeatDelay: 1.4 }}
						/>
					</motion.div>
				) : windows.length > 0 ? (
					<div className="relative mt-4 space-y-2">
						{windows.map((w, i) => {
							const pct = w.limit > 0 ? Math.min(100, Math.round((w.consumed / w.limit) * 100)) : 0;
							return (
								<div key={w.kind} className="rounded-xl border border-border bg-background/40 px-3 py-2.5">
									<div className="flex items-center justify-between text-[12px]">
										<span className="font-medium text-foreground">{WINDOW_LABELS[w.kind]}</span>
										<span className="tabular-nums text-muted-foreground">
											{Math.round(w.consumed)} / {Math.round(w.limit)}
										</span>
									</div>
									<div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-border">
										<motion.div
											className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500"
											initial={{ width: 0 }}
											animate={{ width: `${pct}%` }}
											transition={{ duration: 0.7, delay: 0.12 + i * 0.08, ease: "easeOut" }}
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
				<motion.button
					type="button"
					onClick={() => setModelsExpanded((v) => !v)}
					disabled={models.length === 0}
					whileTap={{ scale: 0.98 }}
					whileHover={{ backgroundColor: hexToRgba(themeColor, 0.12) }}
					className="relative mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border py-2 text-[12px] font-medium transition-colors disabled:opacity-50"
					style={{
						borderColor: hexToRgba(themeColor, 0.22),
						backgroundColor: hexToRgba(themeColor, 0.06),
						color: themeColor,
					}}
				>
					<motion.span
						className="icon-[mdi--chevron-down] h-4 w-4"
						animate={{ rotate: modelsExpanded ? 180 : 0 }}
						transition={{ type: "spring", stiffness: 300, damping: 20 }}
					/>
					{models.length === 0 ? "暂无模型，点击上方刷新" : modelsExpanded ? "收起模型" : `查看 ${models.length} 个模型`}
				</motion.button>

				<AnimatePresence initial={false}>
					{modelsExpanded && models.length > 0 && (
						<motion.div
							key="models"
							initial={{ height: 0, opacity: 0 }}
							animate={{ height: "auto", opacity: 1 }}
							exit={{ height: 0, opacity: 0 }}
							transition={{ duration: 0.3, ease: "easeInOut" }}
							onAnimationComplete={() => modelsExpanded && setModelsOverflowVisible(true)}
							className={cn("relative", modelsOverflowVisible ? "overflow-visible" : "overflow-hidden")}
						>
							<motion.div
								className="mt-3 grid grid-cols-2 gap-2"
								variants={listVariants}
								initial="hidden"
								animate="show"
							>
								{models.map((model) => (
									<ModelChip
										key={model.id}
										model={model}
										accentClass="hover:border-amber-500/40 hover:bg-amber-500/5"
									/>
								))}
							</motion.div>
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</motion.div>
	);
}

type ModelCost = { input: number; output: number; cacheRead: number; cacheWrite: number };
type RemoteModel = { id: string; name?: string; api?: string; input?: string[]; reasoning?: boolean; contextWindow?: number; maxTokens?: number; tags?: string[]; cost?: ModelCost };
type RemoteProvider = { api?: string; baseUrl?: string; icon?: string; models?: RemoteModel[] };

/** 积分价格数字格式化：整数原样，否则最多两位小数去尾零。 */
function formatCredit(n: number): string {
	return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

/** 单个模型卡片：Go/Zen 共用，accentClass 控制 hover 主题色。 */
function ModelChip({ model, accentClass }: { model: RemoteModel; accentClass: string }): JSX.Element {
	const cost = model.cost;
	const hasPrice = !!cost && (cost.input > 0 || cost.output > 0);
	return (
		<motion.div
			variants={chipVariants}
			whileHover={{ y: -2, scale: 1.02 }}
			className={cn("rounded-xl border border-border bg-background/40 px-3 py-2.5 transition-colors", accentClass)}
		>
			<div className="truncate text-[12px] font-medium text-foreground">{model.name || model.id}</div>
			<div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
				{model.input?.includes("image") && (
					<span className="rounded bg-blue-500/10 px-1 py-0.5 text-blue-400">视觉</span>
				)}
				{model.reasoning && (
					<span className="rounded bg-purple-500/10 px-1 py-0.5 text-purple-400">推理</span>
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
			{hasPrice && cost && (
				<div className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
					<span className="icon-[mdi--circle-multiple-outline] h-3 w-3 shrink-0 opacity-70" />
					<span className="tabular-nums">
						入 {formatCredit(cost.input)} · 出 {formatCredit(cost.output)}
					</span>
					<span className="opacity-60">积分/百万tok</span>
				</div>
			)}
		</motion.div>
	);
}

/** Vetta Zen 官方卡：动效与 Vetta Go 一致（primary 主题），无鼠标倾斜。 */
function VettaZenCard({
	provider,
	onRefresh,
	refreshing,
	error,
	creditsBalance,
	creditsUnlimited,
}: {
	provider: RemoteProvider | undefined;
	onRefresh: () => void;
	refreshing: boolean;
	error: string | null;
	creditsBalance: number | null;
	creditsUnlimited: boolean;
}): JSX.Element {
	const [modelsExpanded, setModelsExpanded] = useState(false);
	const [modelsOverflowVisible, setModelsOverflowVisible] = useState(false);
	const [showDone, setShowDone] = useState(false);
	const prevRefreshing = useRef(refreshing);
	const models = provider?.models ?? [];

	// 折叠时收回 overflow，保证高度动画不漏出内容。
	useEffect(() => {
		if (!modelsExpanded) setModelsOverflowVisible(false);
	}, [modelsExpanded]);

	// 刷新完成的正反馈：短暂展示「已更新」。
	useEffect(() => {
		if (prevRefreshing.current && !refreshing) {
			setShowDone(true);
			const t = setTimeout(() => setShowDone(false), 1600);
			prevRefreshing.current = refreshing;
			return () => clearTimeout(t);
		}
		prevRefreshing.current = refreshing;
	}, [refreshing]);

	return (
		<motion.div
			className="mb-6"
			variants={cardVariants}
			initial="hidden"
			animate="show"
			transition={{ type: "spring", stiffness: 320, damping: 26 }}
			whileHover={{ y: -3 }}
		>
			<div className="group relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-5">
				{/* 流动光晕 */}
				<motion.div
					className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-primary/10 blur-3xl"
					animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.8, 0.5] }}
					transition={{ duration: 6, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
				/>
				<motion.div
					className="pointer-events-none absolute -bottom-12 -left-8 h-32 w-32 rounded-full bg-primary/5 blur-3xl"
					animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.7, 0.4] }}
					transition={{ duration: 7, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut", delay: 1 }}
				/>

				<div className="relative flex items-start justify-between gap-3">
					<div className="flex items-center gap-3">
						<ProviderIcon symbol={provider?.icon} className="h-11 w-11 rounded-xl" />
						<div>
							<div className="flex items-center gap-2 text-[16px] font-bold text-foreground">
								Vetta Zen
								<span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium text-primary">
									官方
								</span>
							</div>
							<div className="mt-0.5 text-[12px] text-muted-foreground">
								开箱即用 · {models.length} 个模型
							</div>
						</div>
					</div>
					<motion.button
						type="button"
						onClick={onRefresh}
						disabled={refreshing}
						whileTap={{ scale: 0.92 }}
						className={cn(
							"flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors disabled:opacity-50",
							showDone ? "text-green-500" : "text-primary hover:bg-primary/10",
						)}
					>
						<AnimatePresence mode="wait" initial={false}>
							{showDone ? (
								<motion.span
									key="done"
									initial={{ scale: 0, opacity: 0 }}
									animate={{ scale: 1, opacity: 1 }}
									exit={{ scale: 0, opacity: 0 }}
									className="flex items-center gap-1.5"
								>
									<span className="icon-[mdi--check-circle] h-3.5 w-3.5" />
									已更新
								</motion.span>
							) : (
								<motion.span
									key="idle"
									initial={{ opacity: 0 }}
									animate={{ opacity: 1 }}
									exit={{ opacity: 0 }}
									className="flex items-center gap-1.5"
								>
									<span className={cn("icon-[mdi--refresh] h-3.5 w-3.5", refreshing && "animate-spin")} />
									{refreshing ? "刷新中…" : "刷新"}
								</motion.span>
							)}
						</AnimatePresence>
					</motion.button>
				</div>

				{/* 积分余额（Vetta Zen 计费体系） */}
				<div className="relative mt-4 flex items-center justify-between rounded-xl border border-primary/15 bg-primary/5 px-3 py-2.5">
					<div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
						<span className="icon-[mdi--wallet-outline] h-4 w-4" />
						积分余额
					</div>
					{creditsUnlimited ? (
						<span className="text-[14px] font-bold text-primary">无限制</span>
					) : (
						<span
							className={cn(
								"text-[15px] font-bold tabular-nums",
								(creditsBalance ?? 0) <= 0 ? "text-destructive" : "text-foreground",
							)}
						>
							{creditsBalance !== null ? creditsBalance.toFixed(2) : "--"}
						</span>
					)}
				</div>

				{error && (
					<div className="relative mt-3 flex items-center gap-2 text-[12px] text-amber-400">
						<span className="icon-[mdi--alert-circle-outline] h-3.5 w-3.5 shrink-0" />
						{error === "unauthorized" ? "未授权，请先登录" : error}
					</div>
				)}

				{/* 查看模型 */}
				<motion.button
					type="button"
					onClick={() => setModelsExpanded((v) => !v)}
					disabled={models.length === 0}
					whileTap={{ scale: 0.98 }}
					className="relative mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 py-2 text-[12px] font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
				>
					<motion.span
						className="icon-[mdi--chevron-down] h-4 w-4"
						animate={{ rotate: modelsExpanded ? 180 : 0 }}
						transition={{ type: "spring", stiffness: 300, damping: 20 }}
					/>
					{models.length === 0 ? "暂无模型，点击上方刷新" : modelsExpanded ? "收起模型" : `查看 ${models.length} 个模型`}
				</motion.button>

				<AnimatePresence initial={false}>
					{modelsExpanded && models.length > 0 && (
						<motion.div
							key="models"
							initial={{ height: 0, opacity: 0 }}
							animate={{ height: "auto", opacity: 1 }}
							exit={{ height: 0, opacity: 0 }}
							transition={{ duration: 0.3, ease: "easeInOut" }}
							onAnimationComplete={() => modelsExpanded && setModelsOverflowVisible(true)}
							className={cn("relative", modelsOverflowVisible ? "overflow-visible" : "overflow-hidden")}
						>
							<motion.div
								className="mt-3 grid grid-cols-2 gap-2"
								variants={listVariants}
								initial="hidden"
								animate="show"
							>
								{models.map((model) => (
									<ModelChip
										key={model.id}
										model={model}
										accentClass="hover:border-primary/40 hover:bg-primary/5"
									/>
								))}
							</motion.div>
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</motion.div>
	);
}

/**
 * Vetta Zen / Vetta Go 会员卡片区。原先位于模型设置页，现归入账户设置页。
 * 自行拉取一次套餐状态与远程 providers，并提供刷新按钮。
 */
export function SubscriptionCards(): JSX.Element | null {
	const [remoteProviders, setRemoteProviders] = useAtom(remoteProvidersAtom);
	const [subscriptionStatus, setSubscriptionStatus] = useAtom(subscriptionStatusAtom);
	const [refreshing, setRefreshing] = useState(false);
	const [remoteError, setRemoteError] = useState<string | null>(null);
	const creditsBalance = useAtomValue(creditsBalanceAtom);
	const creditsUnlimited = useAtomValue(creditsUnlimitedAtom);

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
				<VettaZenCard
					provider={zenProvider}
					onRefresh={() => void handleRefreshRemote()}
					refreshing={refreshing}
					error={remoteError}
					creditsBalance={creditsBalance}
					creditsUnlimited={creditsUnlimited}
				/>
			)}
		</>
	);
}
