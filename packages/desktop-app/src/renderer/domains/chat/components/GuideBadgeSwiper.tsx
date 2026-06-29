import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

// 引导 badge：常驻(persistent)无法关闭；首次(once)关闭后本地持久化，以后不再展示。
// 两种类型点击主体都会触发 onClick 回调。
type GuideBadgeType = "persistent" | "once";

interface GuideBadge {
	id: string;
	type: GuideBadgeType;
	icon: string;
	text: string;
	onClick: () => void;
}

// 首次类 badge 关闭后写入此 localStorage key（JSON 字符串数组），下次启动据此过滤。
const DISMISSED_KEY = "vetta-guide-badges-dismissed";
// 自动轮播间隔。
const ROTATE_INTERVAL = 5000;
const easeOut = [0.16, 1, 0.3, 1] as const;

function loadDismissed(): Set<string> {
	try {
		const raw = localStorage.getItem(DISMISSED_KEY);
		if (!raw) return new Set();
		const arr = JSON.parse(raw) as unknown;
		return Array.isArray(arr) ? new Set(arr.filter((x): x is string => typeof x === "string")) : new Set();
	} catch {
		return new Set();
	}
}

function persistDismissed(ids: Set<string>): void {
	try {
		localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
	} catch {
		// localStorage 不可用时静默降级：本次会话内仍按已关闭处理。
	}
}

interface GuideBadgeSwiperProps {
	mounted: boolean;
}

export function GuideBadgeSwiper({ mounted }: GuideBadgeSwiperProps): JSX.Element | null {
	const { t } = useTranslation("chat");
	const navigate = useNavigate();
	const [dismissed, setDismissed] = useState<Set<string>>(loadDismissed);
	const [index, setIndex] = useState(0);

	// badge 清单：onClick 依赖 navigate，故在组件内构建。
	// 新功能提示走 once 类型，点击跳转对应设置页。
	const allBadges = useMemo<GuideBadge[]>(
		() => [
			{
				id: "pet-feature",
				type: "once",
				icon: "icon-[mdi--paw-outline]",
				text: t("guideBadgeSwiper.petFeatureText"),
				onClick: () => void navigate({ to: "/settings/$tab", params: { tab: "pet" } }),
			},
			{
				id: "quick-panel-feature",
				type: "once",
				icon: "icon-[solar--magnifer-linear]",
				text: t("guideBadgeSwiper.quickPanelText"),
				onClick: () =>
					void navigate({
						to: "/settings/$tab",
						params: { tab: "shortcuts" },
						search: { section: "shortcuts-quickpanel" },
					}),
			},
		],
		[navigate],
	);

	const badges = useMemo(
		() => allBadges.filter((b) => b.type === "persistent" || !dismissed.has(b.id)),
		[allBadges, dismissed],
	);

	// badge 数量变化时把 index 收敛回有效范围，避免越界后空白。
	useEffect(() => {
		setIndex((i) => (badges.length === 0 ? 0 : i % badges.length));
	}, [badges.length]);

	useEffect(() => {
		if (badges.length <= 1) return;
		const id = window.setInterval(() => setIndex((i) => (i + 1) % badges.length), ROTATE_INTERVAL);
		return () => window.clearInterval(id);
	}, [badges.length]);

	const handleDismiss = useCallback((badgeId: string) => {
		setDismissed((prev) => {
			const next = new Set(prev);
			next.add(badgeId);
			persistDismissed(next);
			return next;
		});
	}, []);

	if (badges.length === 0) return null;
	const current = badges[index % badges.length];

	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: mounted ? 1 : 0, y: mounted ? 0 : 8 }}
			transition={{ duration: 0.5, ease: easeOut }}
			className="mb-3 flex h-8 w-full items-center"
		>
			<AnimatePresence mode="wait">
				<motion.div
					key={current.id}
					initial={{ opacity: 0, y: 6 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: -6 }}
					transition={{ duration: 0.32, ease: easeOut }}
					className="flex items-center"
				>
					<button
						type="button"
						onClick={current.onClick}
						title={current.text}
						className="group flex h-7 items-center gap-1.5 rounded-full border border-primary/30 bg-[color-mix(in_srgb,var(--primary)_8%,var(--card))] pl-2.5 pr-2 text-[11px] font-medium text-primary transition-colors hover:border-primary/50 hover:bg-[color-mix(in_srgb,var(--primary)_14%,var(--card))]"
					>
						<span className={`${current.icon} h-3 w-3 shrink-0`} />
						<span className="whitespace-nowrap">{current.text}</span>
						{current.type === "once" && (
							<span
								role="button"
								tabIndex={-1}
								aria-label={t("guideBadgeSwiper.dismissTooltip")}
								title={t("guideBadgeSwiper.dismissTooltip")}
								onClick={(e) => {
									e.stopPropagation();
									handleDismiss(current.id);
								}}
								className="ml-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-primary/60 transition-colors hover:bg-primary/15 hover:text-primary"
							>
								<span className="icon-[mdi--close] h-3 w-3" />
							</span>
						)}
					</button>
				</motion.div>
			</AnimatePresence>
		</motion.div>
	);
}
