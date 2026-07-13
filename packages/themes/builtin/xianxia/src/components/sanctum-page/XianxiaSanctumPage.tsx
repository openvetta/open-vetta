import type { ThemePageProps } from "@vetta/theme-sdk";
import { CenterSliceImageDecoration, HorizontalSliceImageDecoration, HorizontalSliceImageFrame, NineSliceImageFrame } from "@vetta/theme-ui";
import { cn } from "@vetta/ui";
import { motion } from "motion/react";
import { useEffect, type CSSProperties, type JSX } from "react";
import { sanctumAchievements, type SanctumAchievement } from "./achievements";
import { sanctumPageAssets } from "./assets";
import { XianxiaSanctumPageHeader } from "./XianxiaSanctumPageHeader";

const currentAchievement = sanctumAchievements[1] ?? sanctumAchievements[0];
const achievementLayoutStyle: CSSProperties & {
	readonly "--sanctum-achievement-connector-width": string;
	readonly "--sanctum-achievement-gap-size": string;
	readonly "--sanctum-achievement-size": string;
} = {
	"--sanctum-achievement-connector-width": "calc(var(--sanctum-achievement-gap-size) + var(--sanctum-achievement-size) * 0.32)",
	"--sanctum-achievement-gap-size": "calc(var(--sanctum-achievement-size) * 0.11)",
	"--sanctum-achievement-size": "8.75rem",
};
const achievementConnectorDecoration = {
	centerWidth: "1rem",
	height: "1.7rem",
} as const;
const statusLabelDecoration = {
	height: "1.25rem",
	leftSlice: 60,
	leftWidth: "0.75rem",
	repeat: "stretch",
	rightSlice: 60,
	rightWidth: "0.75rem",
} as const;
const achievementPanelDecoration = {
	borderWidth: "3.5rem",
	repeat: "stretch",
	slice: 132,
} as const;
const bottomBarFrameDecoration = {
	height: "100%",
	leftSlice: 150,
	leftWidth: "9rem",
	repeat: "stretch",
	rightSlice: 150,
	rightWidth: "9rem",
} as const;
const bottomBarButtonDecoration = {
	height: "100%",
	leftSlice: 168,
	leftWidth: "4.25rem",
	repeat: "stretch",
	rightSlice: 168,
	rightWidth: "4.25rem",
} as const;
const skillPerks = [
	{ bonus: "+10%", name: "Qi Gathering" },
	{ bonus: "+15%", name: "Cultivation Speed" },
	{ bonus: "+10%", name: "Defense Boost" },
	{ bonus: "+200", name: "Max Qi Increase" },
] as const;
const cultivationPower = {
	current: 680,
	max: 1000,
	recentGrowth: [
		{ label: "Today", value: "+18" },
		{ label: "This Week", value: "+96" },
		{ label: "Last 30 Days", value: "+280" },
	],
} as const;
const cultivationPowerPercent = `${Math.round((cultivationPower.current / cultivationPower.max) * 100)}%`;

export function XianxiaSanctumPage({ layout }: ThemePageProps): JSX.Element {
	useEffect(() => {
		document.body.classList.add("xianxia-sanctum-page-active");
		return () => {
			document.body.classList.remove("xianxia-sanctum-page-active");
		};
	}, []);

	return (
		<main
			className="relative flex min-h-0 flex-1 items-start justify-center overflow-auto rounded-[22px] border border-white/35 bg-transparent"
			data-theme-page-layout={layout}
		>
			<motion.div
				animate={{ opacity: 1 }}
				className="relative flex min-h-full w-full max-w-[1440px] flex-none flex-col overflow-visible"
				initial={{ opacity: 0 }}
				transition={{ duration: 0.45, ease: "easeOut" }}
			>
				<XianxiaSanctumPageHeader />
				<div className="grid min-h-0 grid-cols-1 gap-7 px-8 pb-5 pt-2 min-[1060px]:grid-cols-[430px_minmax(410px,1fr)] xl:grid-cols-[470px_minmax(0,1fr)]">
					<XianxiaProfileColumn />
					<XianxiaSanctumContentColumn />
				</div>
				<XianxiaBottomBar />
			</motion.div>
		</main>
	);
}

function XianxiaProfileColumn(): JSX.Element {
	return (
		<section className="relative flex min-h-[650px] w-[430px] min-w-[430px] flex-none flex-col items-center justify-start self-start justify-self-center min-[1060px]:!sticky min-[1060px]:top-[90px] xl:w-[470px] xl:min-w-[470px]">
			<div className="absolute left-1/2 top-[70px] z-20 -translate-x-1/2 rounded-full bg-slate-800/65 px-6 py-1.5 text-[15px] font-semibold text-white shadow-[0_0_8px_rgba(255,255,255,0.35)]">
				当前境界 · Current Realm
			</div>
			<motion.img
				animate={{ opacity: 1, y: 0 }}
				alt=""
				aria-hidden="true"
				className="relative h-auto w-[500px] max-w-none flex-none object-contain drop-shadow-[0_0_16px_rgba(255,255,255,0.68)]"
				initial={{ opacity: 0, y: 10 }}
				src={sanctumPageAssets.character}
				transition={{ duration: 0.5, ease: "easeOut" }}
			/>
			<motion.div
				animate={{ opacity: 1, y: 0 }}
				className="relative -mt-[220px] aspect-[1131/1035] w-[440px] max-w-none flex-none"
				initial={{ opacity: 0, y: 18 }}
				transition={{ delay: 0.12, duration: 0.45, ease: "easeOut" }}
			>
				<img
					alt=""
					aria-hidden="true"
					className="absolute inset-0 h-full w-full object-contain"
					src={sanctumPageAssets.profilePanel}
				/>
				<div className="absolute inset-x-10 top-16 text-center">
					<span className="absolute left-1/2 top-[-38px] z-10 -translate-x-1/2 text-[34px] font-semibold leading-none text-white drop-shadow-[0_1px_4px_rgba(15,23,42,0.8)]">
						2
					</span>
					<h2 className="mt-[28px] whitespace-nowrap text-[29px] font-semibold leading-8 text-slate-900">Foundation Establishment</h2>
					<p className="mt-[28px] text-[20px] font-semibold tracking-[0.24em] text-slate-700">筑 基 境</p>
					<p className="mx-auto mt-5 w-[300px] text-[13px] leading-5 text-slate-600">
						The foundation is laid, the core is steady. The path of immortality has truly begun.
					</p>
				</div>
				<div className="absolute inset-x-14 bottom-9">
					<div className="mb-2 text-center text-[13px] text-slate-600">
						Realm Perks
					</div>
					<div className="grid grid-cols-4 gap-2 overflow-hidden">
						{sanctumPageAssets.skills.map((icon, index) => (
							<motion.div
								animate={{ opacity: 1, y: 0 }}
								className="min-w-0 text-center"
								initial={{ opacity: 0, y: 8 }}
								key={icon}
								transition={{ delay: 0.35 + index * 0.08, duration: 0.32, ease: "easeOut" }}
							>
								<img
									alt=""
									aria-hidden="true"
									className="mx-auto h-12 w-auto max-w-none drop-shadow-[0_0_7px_rgba(255,255,255,0.72)]"
									src={icon}
								/>
								<span className="mt-1 block truncate text-[10px] leading-tight text-slate-600">{skillPerks[index]?.name}</span>
								<span className="mt-0.5 block text-[12px] font-semibold leading-tight text-slate-700">{skillPerks[index]?.bonus}</span>
							</motion.div>
						))}
					</div>
				</div>
			</motion.div>
		</section>
	);
}

function XianxiaSanctumContentColumn(): JSX.Element {
	return (
		<motion.section
			animate={{ opacity: 1, x: 0 }}
			className="relative flex w-[530px] min-w-0 flex-col gap-5 self-start justify-self-center min-[1060px]:w-full"
			initial={{ opacity: 0, x: 18 }}
			transition={{ delay: 0.1, duration: 0.5, ease: "easeOut" }}
		>
			<XianxiaCultivationPowerPanel />
			<XianxiaAchievementPanel />
		</motion.section>
	);
}

function XianxiaCultivationPowerPanel(): JSX.Element {
	return (
		<section className="relative aspect-[2172/724] min-h-[236px] w-full min-w-0 overflow-visible px-[7.5%] py-[5.8%] text-white">
			<img
				alt=""
				aria-hidden="true"
				className="absolute inset-0 h-full w-full object-fill drop-shadow-[0_0_10px_rgba(255,246,210,0.5)]"
				src={sanctumPageAssets.cultivationPowerPanel}
			/>
			<div className="relative z-10 flex h-full min-w-0 flex-col">
				<div className="flex items-center gap-3">
					<span className="text-[20px] text-amber-100 drop-shadow-[0_0_5px_rgba(255,245,205,0.8)]">✧</span>
					<h2 className="text-[22px] font-semibold leading-7 text-amber-50 drop-shadow-[0_1px_3px_rgba(15,23,42,0.65)] min-[1280px]:text-[24px] min-[1280px]:leading-8">
						修为值
					</h2>
					<span className="text-[16px] text-slate-200/90 min-[1280px]:text-[18px]">Cultivation Power</span>
				</div>
				<div className="mt-3 flex min-w-0 items-end gap-3">
					<span className="text-[48px] font-semibold leading-none text-amber-50 drop-shadow-[0_1px_4px_rgba(15,23,42,0.75)] min-[1280px]:text-[58px]">
						{cultivationPower.current}
					</span>
					<span className="pb-1.5 text-[25px] font-semibold leading-none text-slate-100/95 min-[1280px]:pb-2 min-[1280px]:text-[30px]">/ {cultivationPower.max}</span>
				</div>
				<div className="mt-3 h-3 w-[70%] overflow-hidden rounded-full border border-amber-100/45 bg-slate-950/35 shadow-inner">
					<motion.div
						animate={{ width: cultivationPowerPercent }}
						className="h-full rounded-full bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-300 shadow-[0_0_7px_rgba(255,240,190,0.75)]"
						initial={{ width: "0%" }}
						transition={{ delay: 0.38, duration: 0.75, ease: "easeOut" }}
					/>
				</div>
				<div className="mt-auto grid grid-cols-3 overflow-hidden rounded-[10px] border border-white/18 bg-slate-900/18">
					{cultivationPower.recentGrowth.map((item, index) => (
						<div
							className={cn(
								"min-w-0 px-4 py-2.5 text-center",
								index > 0 ? "border-l border-white/16" : undefined,
							)}
							key={item.label}
						>
							<div className="truncate text-[13px] leading-5 text-slate-200/85">{item.label}</div>
							<div className="text-[23px] font-semibold leading-7 text-amber-50 min-[1280px]:text-[26px] min-[1280px]:leading-8">{item.value}</div>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}

function XianxiaAchievementPanel(): JSX.Element {
	return (
		<section className="relative w-full min-w-0">
			<NineSliceImageFrame
				className="w-full"
				contentClassName="xianxia-achievement-panel-content relative z-10 flex w-full min-w-0 flex-col px-4 py-7 md:px-8 md:py-9"
				decoration={achievementPanelDecoration}
				imageUrl={sanctumPageAssets.achievementDisplayPanel}
				style={achievementLayoutStyle}
			>
				<div className="mb-4 flex items-center justify-between px-6 text-slate-700">
					<div>
						<div className="flex items-center gap-3 text-[18px] font-semibold">
							<span className="text-slate-400">✧</span>
							<span>2 / 15 Unlocked</span>
						</div>
						<div className="mt-2 h-1.5 w-56 rounded-full bg-slate-300/70">
							<motion.div
								animate={{ width: "13.33%" }}
								className="h-full rounded-full bg-amber-300 shadow-[0_0_5px_rgba(252,211,77,0.65)]"
								initial={{ width: "0%" }}
								transition={{ delay: 0.45, duration: 0.75, ease: "easeOut" }}
							/>
						</div>
					</div>
					<button
						type="button"
						className="flex h-10 w-40 items-center justify-between rounded-2xl border border-slate-300/70 bg-slate-100/55 px-4 text-[15px] text-slate-700 shadow-inner"
					>
						<span>All Realms</span>
						<span className="icon-[solar--alt-arrow-down-linear] h-4 w-4" />
					</button>
				</div>
				<div className="xianxia-achievement-grid">
					{sanctumAchievements.map((achievement, index) => (
						<XianxiaAchievementCell
							key={achievement.id}
							achievement={achievement}
							assetIndex={index}
							current={achievement.id === currentAchievement?.id}
							showConnector={index < sanctumAchievements.length - 1}
						/>
					))}
				</div>
			</NineSliceImageFrame>
		</section>
	);
}

function XianxiaAchievementCell({
	achievement,
	assetIndex,
	current,
	showConnector,
}: {
	readonly achievement: SanctumAchievement;
	readonly assetIndex: number;
	readonly current: boolean;
	readonly showConnector: boolean;
}): JSX.Element {
	const icon = achievement.achieved
		? sanctumPageAssets.achievements.unlocked[assetIndex]
		: sanctumPageAssets.achievements.locked[assetIndex];

	return (
		<>
			<motion.figure
				animate={{ opacity: 1, scale: 1, y: 0 }}
				className="xianxia-achievement-cell relative flex min-w-0 flex-col items-center justify-center rounded-[18px] px-1 pb-2 pt-1 text-center"
				initial={{ opacity: 0, scale: 0.92, y: 10 }}
				transition={{ delay: 0.18 + assetIndex * 0.035, duration: 0.28, ease: "easeOut" }}
			>
				{current && (
					<img
						alt=""
						aria-hidden="true"
						className="pointer-events-none absolute left-1/2 top-[35px] z-0 h-auto w-[82%] max-w-none -translate-x-1/2"
						src={sanctumPageAssets.currentAchievementBackground}
					/>
				)}
				<img
					alt=""
					aria-hidden="true"
					className={cn(
						"relative z-10 w-auto max-w-none",
						current ? "h-[calc(var(--sanctum-achievement-size)*1.2)]" : "h-[var(--sanctum-achievement-size)]",
						achievement.achieved
							? "drop-shadow-[0_0_9px_rgba(202,255,240,0.56)]"
							: "opacity-80 saturate-[0.72] drop-shadow-[0_0_5px_rgba(255,255,255,0.38)]",
					)}
					src={icon}
				/>
				<figcaption className="relative z-10 mt-1.5 min-w-0 text-xs font-semibold leading-tight text-slate-700 drop-shadow-[0_1px_0_rgba(255,255,255,0.85)]">
					<span className="block truncate">{achievement.englishName}</span>
					<span className="mt-0.5 block text-[13px] text-slate-600">{achievement.name}</span>
					<AchievementStatusLabel achieved={achievement.achieved} current={current} />
				</figcaption>
				{showConnector && (
					<motion.div
						animate={{ opacity: 1, scaleX: 1 }}
						className="sanctum-achievement-connector pointer-events-none absolute right-[calc(var(--sanctum-achievement-connector-width)*-0.6)] h-[1.7rem] w-[var(--sanctum-achievement-connector-width)]"
						initial={{ opacity: 0, scaleX: 0.65 }}
						transition={{ delay: 0.24 + assetIndex * 0.035, duration: 0.3, ease: "easeOut" }}
					>
						<CenterSliceImageDecoration
							className="opacity-[0.86] drop-shadow-[0_0_4px_rgba(255,255,255,0.5)]"
							decoration={achievementConnectorDecoration}
							imageUrl={sanctumPageAssets.achievementConnector}
						/>
					</motion.div>
				)}
			</motion.figure>
		</>
	);
}

function AchievementStatusLabel({
	achieved,
	current,
}: {
	readonly achieved: boolean;
	readonly current: boolean;
}): JSX.Element {
	const frame = current
		? sanctumPageAssets.statusLabels.current
		: achieved
			? sanctumPageAssets.statusLabels.completed
			: sanctumPageAssets.statusLabels.locked;

	return (
		<HorizontalSliceImageFrame
			className={cn(
				"mx-auto mt-1.5 inline-flex h-5 w-fit items-center justify-center px-2.5 text-[11px] leading-4",
				current || achieved ? "text-white" : "text-slate-600",
			)}
			contentClassName="relative z-10 flex h-full items-center justify-center"
			decoration={statusLabelDecoration}
			imageUrl={frame}
		>
			<span className="whitespace-nowrap font-semibold">{current ? "Current" : achieved ? "Completed" : "Locked"}</span>
		</HorizontalSliceImageFrame>
	);
}

function XianxiaBottomBar(): JSX.Element {
	return (
		<motion.footer
			animate={{ opacity: 1, y: 0 }}
			className="mx-8 mb-5 mt-auto text-slate-700"
			initial={{ opacity: 0, y: 18 }}
			transition={{ delay: 0.25, duration: 0.45, ease: "easeOut" }}
		>
			<HorizontalSliceImageFrame
				className="w-full"
				contentClassName="relative z-10 flex min-h-[7.25rem] items-center justify-between gap-5 px-12 py-8"
				decoration={bottomBarFrameDecoration}
				imageUrl={sanctumPageAssets.bottomBar.background}
			>
				<div className="flex items-center gap-5">
					<img alt="" aria-hidden="true" className="h-14 w-auto max-w-none flex-none object-contain" src={sanctumPageAssets.bottomBar.compass} />
					<p className="w-[360px] text-[14px] leading-5">Each realm breakthrough unlocks new abilities, boosts attributes, and opens the path to higher cultivation.</p>
				</div>
				<div className="h-11 w-px bg-slate-400/45" />
				<div className="flex items-center gap-5">
					<img alt="" aria-hidden="true" className="h-14 w-auto max-w-none flex-none object-contain" src={sanctumPageAssets.bottomBar.scroll} />
					<p className="w-[310px] text-[14px] leading-5">Complete tasks, accumulate cultivation, and transcend to higher realms.</p>
				</div>
				<button
					type="button"
					className="relative flex h-14 flex-none items-center justify-center px-9 text-[18px] font-semibold text-white"
				>
					<HorizontalSliceImageDecoration
						decoration={bottomBarButtonDecoration}
						imageUrl={sanctumPageAssets.bottomBar.button}
					/>
					<span className="relative z-10 flex items-center gap-3">
						<img alt="" aria-hidden="true" className="h-7 w-auto max-w-none object-contain" src={sanctumPageAssets.bottomBar.book} />
						<span>View Cultivation Record</span>
						<span className="icon-[solar--arrow-right-linear] h-5 w-5" />
					</span>
				</button>
			</HorizontalSliceImageFrame>
		</motion.footer>
	);
}
