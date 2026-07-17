import { SkillTypeIcon } from "@vetta/theme-ui/skills";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CapabilityBannerIcon } from "../hooks/useCapabilitiesModel";

const easeOut = [0.22, 1, 0.36, 1] as const;
const SLOT_COUNT = 3;
const ROTATE_MS = 3200;

/** 市场尚未加载时的占位图标（与技能市场 Solar 预设一致）。 */
const FALLBACK_ICONS: CapabilityBannerIcon[] = [
	{ id: "fallback:magic", kind: "skill", type: "skill", icon: "solar:magic-stick-3-bold" },
	{ id: "fallback:chart", kind: "skill", type: "skill", icon: "solar:chart-2-bold" },
	{ id: "fallback:code", kind: "skill", type: "skill", icon: "solar:code-bold" },
	{ id: "fallback:widget", kind: "skill", type: "skill", icon: "solar:widget-2-bold" },
	{ id: "fallback:rocket", kind: "skill", type: "skill", icon: "solar:rocket-2-bold" },
	{ id: "fallback:bolt", kind: "skill", type: "skill", icon: "solar:bolt-bold" },
];

const SLOT_LAYOUT = [
	{ className: "left-0 top-5 -rotate-[10deg] z-10" },
	{ className: "left-[52px] top-0 rotate-[4deg] z-30" },
	{ className: "left-[104px] top-6 rotate-[12deg] z-20" },
] as const;

function shuffleIcons(icons: CapabilityBannerIcon[]): CapabilityBannerIcon[] {
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

function BannerIconFace({ source }: { source: CapabilityBannerIcon }): JSX.Element {
	if (source.kind === "image") {
		return (
			<img
				src={source.url}
				alt=""
				className="h-full w-full object-contain"
				draggable={false}
			/>
		);
	}
	return <SkillTypeIcon type={source.type} icon={source.icon} className="h-5 w-5" />;
}

export function CapabilitiesBanner({
	icons,
}: {
	icons: CapabilityBannerIcon[];
}): JSX.Element {
	const { t } = useTranslation("skills");

	const pool = useMemo(() => {
		const source = icons.length > 0 ? icons : FALLBACK_ICONS;
		return shuffleIcons(source);
	}, [icons]);

	const [offset, setOffset] = useState(0);

	useEffect(() => {
		setOffset(0);
		if (pool.length <= SLOT_COUNT) return;
		const timer = window.setInterval(() => {
			setOffset((value) => value + 1);
		}, ROTATE_MS);
		return () => window.clearInterval(timer);
	}, [pool]);

	const slots = useMemo(() => {
		return Array.from({ length: SLOT_COUNT }, (_, index) => {
			const source = pool[(offset + index) % pool.length] ?? FALLBACK_ICONS[index]!;
			return { slot: index, source };
		});
	}, [offset, pool]);

	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.45, ease: easeOut }}
			className="relative overflow-hidden rounded-2xl border border-border/50 bg-card/40"
		>
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/12 via-primary/5 to-transparent"
			/>
			<div
				aria-hidden
				className="pointer-events-none absolute -right-6 -top-10 h-36 w-36 rounded-full bg-primary/15 blur-3xl"
			/>
			<div
				aria-hidden
				className="pointer-events-none absolute -bottom-12 right-10 h-28 w-40 rounded-full bg-primary/10 blur-3xl"
			/>

			<div className="relative flex items-center justify-between gap-4 px-5 py-4 sm:px-6 sm:py-5">
				<div className="min-w-0 flex-1">
					<p className="text-[15px] font-semibold tracking-tight text-foreground">
						{t("banner.title")}
					</p>
					<p className="mt-1 max-w-md text-[12px] leading-relaxed text-muted-foreground/70">
						{t("banner.description")}
					</p>
				</div>

				{/* 始终显示：不依赖 md 断点（侧栏下内容区常 <768px） */}
				<div aria-hidden className="relative h-[100px] w-[168px] shrink-0">
					<div className="absolute left-6 top-3 h-16 w-16 rounded-full bg-primary/10 blur-xl" />
					<div className="absolute right-0 top-8 h-12 w-12 rounded-full bg-primary/15 blur-lg" />
					<div className="absolute right-1 top-2 h-14 w-14 rounded-full border border-primary/20" />

					{slots.map(({ slot, source }) => {
						const layout = SLOT_LAYOUT[slot]!;
						return (
							<div
								key={slot}
								className={`absolute flex h-14 w-14 items-center justify-center rounded-xl border border-border/50 bg-card/95 p-1.5 ring-1 ring-inset ring-border/40 backdrop-blur-sm ${layout.className}`}
							>
								<AnimatePresence mode="wait" initial={false}>
									<motion.div
										key={`${slot}-${source.id}-${offset}`}
										initial={{ opacity: 0, scale: 0.88 }}
										animate={{ opacity: 1, scale: 1 }}
										exit={{ opacity: 0, scale: 0.92 }}
										transition={{ duration: 0.28, ease: easeOut }}
										className="flex h-full w-full items-center justify-center overflow-hidden rounded-lg bg-primary/10 text-primary"
									>
										<BannerIconFace source={source} />
									</motion.div>
								</AnimatePresence>
							</div>
						);
					})}

					<span className="absolute right-0 top-0 icon-[solar--star-fall-linear] h-3.5 w-3.5 text-primary/55" />
					<span className="absolute bottom-1 left-8 icon-[solar--star-fall-minimalistic-2-linear] h-3 w-3 text-primary/40" />
				</div>
			</div>
		</motion.div>
	);
}
