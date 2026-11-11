import { Button } from "@vetta-org/ui";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AbilityIcon } from "./AbilityIcon";
import type { AbilityBannerIcon } from "../types";

const easeOut = [0.22, 1, 0.36, 1] as const;
const MAX_SLIDES = 5;
const ROTATE_MS = 5000;

/** 市场尚未加载时的占位图标（solar 预设，与能力市场同风格）。 */
const FALLBACK_ICONS: AbilityBannerIcon[] = [
	{ id: "fallback:magic", type: "skill", icon: "solar:magic-stick-3-bold", title: "", description: "" },
	{ id: "fallback:chart", type: "skill", icon: "solar:chart-2-bold", title: "", description: "" },
	{ id: "fallback:code", type: "skill", icon: "solar:code-bold", title: "", description: "" },
	{ id: "fallback:widget", type: "plugin", title: "", description: "" },
	{ id: "fallback:mcp", type: "mcp", title: "", description: "" },
	{ id: "fallback:bundle", type: "bundle", title: "", description: "" },
];

/** 图标组合的 6 个落点：[left%, top%, 旋转角]；第 0 个是当前精选项。 */
const SLOT_LAYOUT = [
	{ left: 8, top: 22, rotate: -4 },
	{ left: 38, top: 8, rotate: 5 },
	{ left: 68, top: 20, rotate: -3 },
	{ left: 20, top: 62, rotate: 4 },
	{ left: 48, top: 56, rotate: -6 },
	{ left: 76, top: 62, rotate: 5 },
] as const;

function shuffleIcons(icons: AbilityBannerIcon[]): AbilityBannerIcon[] {
	const next = [...icons];
	for (let i = next.length - 1; i > 0; i -= 1) {
		const j = Math.floor(Math.random() * (i + 1));
		const a = next[i];
		const b = next[j];
		if (a && b) {
			next[i] = b;
			next[j] = a;
		}
	}
	return next;
}

export function AbilitiesBanner({ icons }: { icons: AbilityBannerIcon[] }): JSX.Element {
	const { t } = useTranslation("abilities");
	const navigate = useNavigate();

	const isFallback = icons.length === 0;
	const pool = useMemo(() => shuffleIcons(isFallback ? FALLBACK_ICONS : icons), [icons, isFallback]);
	const slideCount = isFallback ? 1 : Math.min(MAX_SLIDES, pool.length);
	const [active, setActive] = useState(0);
	const [paused, setPaused] = useState(false);

	useEffect(() => {
		setActive(0);
	}, [pool]);

	useEffect(() => {
		if (slideCount <= 1 || paused) return;
		const timer = window.setInterval(() => setActive((value) => (value + 1) % slideCount), ROTATE_MS);
		return () => window.clearInterval(timer);
	}, [slideCount, paused, active]);

	const featured = pool[active % pool.length]!;
	const group = useMemo(
		() =>
			SLOT_LAYOUT.map((_, index) => pool[(active + index) % pool.length]!),
		[active, pool],
	);

	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.45, ease: easeOut }}
			data-tour="capabilities-banner"
			onMouseEnter={() => setPaused(true)}
			onMouseLeave={() => setPaused(false)}
			className="relative grid h-[232px] grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] overflow-hidden rounded-2xl border border-border/50 bg-card/40"
		>
			<div aria-hidden className="relative overflow-hidden">
				<div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-primary/8 to-transparent" />
				<div className="absolute -left-8 top-6 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />
				<div className="absolute -bottom-10 right-4 h-36 w-36 rounded-full bg-primary/15 blur-3xl" />
				<AnimatePresence mode="popLayout" initial={false}>
					<motion.div
						key={active}
						initial={{ opacity: 0, scale: 0.94 }}
						animate={{ opacity: 1, scale: 1 }}
						exit={{ opacity: 0, scale: 1.04 }}
						transition={{ duration: 0.4, ease: easeOut }}
						className="absolute inset-0"
					>
						{group.map((source, index) => {
							const layout = SLOT_LAYOUT[index]!;
							const isFeatured = index === 0;
							return (
								<div
									key={`${index}-${source.id}`}
									style={{
										left: `${layout.left}%`,
										top: `${layout.top}%`,
										transform: `rotate(${layout.rotate}deg)`,
									}}
									className={`absolute flex h-[60px] w-[60px] items-center justify-center rounded-2xl border bg-card/95 p-2 shadow-lg shadow-black/10 backdrop-blur-sm ${
										isFeatured ? "z-10 border-primary/60 ring-2 ring-primary/30" : "border-border/50"
									}`}
								>
									<AbilityIcon
										icon={source.icon}
										type={source.type}
										className="h-full w-full rounded-lg border-0 bg-primary/10 text-primary"
									/>
								</div>
							);
						})}
					</motion.div>
				</AnimatePresence>
			</div>

			<div className="relative flex min-w-0 flex-col justify-center gap-1 px-7 py-6">
				<AnimatePresence mode="wait" initial={false}>
					<motion.div
						key={featured.id}
						initial={{ opacity: 0, y: 6 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -6 }}
						transition={{ duration: 0.25, ease: easeOut }}
						className="flex min-w-0 flex-col"
					>
						{isFallback ? (
							<>
								<p className="text-[20px] font-semibold tracking-tight text-foreground">{t("banner.title")}</p>
								<p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground/70">
									{t("banner.description")}
								</p>
							</>
						) : (
							<>
								<p className="text-[12px] text-muted-foreground/60">{t("banner.featured")}</p>
								<p className="mt-0.5 truncate text-[22px] font-semibold tracking-tight text-foreground">
									{featured.title}
								</p>
								<p className="mt-2 line-clamp-3 text-[12.5px] leading-relaxed text-muted-foreground/70">
									{featured.description}
								</p>
								<div className="mt-4">
									<Button
										variant="secondary"
										size="sm"
										onClick={() => void navigate({ to: "/abilities", search: { detail: featured.id } })}
									>
										{t("banner.details")}
									</Button>
								</div>
							</>
						)}
					</motion.div>
				</AnimatePresence>

				{slideCount > 1 && (
					<div className="absolute bottom-4 left-7 flex items-center gap-1.5">
						{Array.from({ length: slideCount }, (_, index) => (
							<button
								key={index}
								type="button"
								aria-label={t("banner.goTo", { n: index + 1 })}
								onClick={() => setActive(index)}
								className={`h-1.5 rounded-full transition-all ${
									index === active ? "w-4 bg-primary" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
								}`}
							/>
						))}
					</div>
				)}
			</div>
		</motion.div>
	);
}
