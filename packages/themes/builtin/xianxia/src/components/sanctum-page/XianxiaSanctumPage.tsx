import type { ThemePageProps } from "@vetta/theme-sdk";
import { HorizontalSliceImageFrame } from "@vetta/theme-ui";
import { cn } from "@vetta/ui";
import { motion } from "motion/react";
import type { CSSProperties, JSX } from "react";
import { xianxiaAssets } from "../../assets";
import { sanctumAchievements, type SanctumAchievement } from "./achievements";
import { sanctumPageAssets } from "./assets";

const achievementsPerRow = 5;
const currentAchievement = sanctumAchievements[1] ?? sanctumAchievements[0];
const achievementLayoutStyle: CSSProperties & {
	readonly "--sanctum-achievement-connector-size": string;
	readonly "--sanctum-achievement-size": string;
} = {
	"--sanctum-achievement-connector-size": "calc(var(--sanctum-achievement-size) * 0.16)",
	"--sanctum-achievement-size": "7.5rem",
};
const statusLabelDecoration = {
	height: "1.25rem",
	leftSlice: 60,
	leftWidth: "0.75rem",
	repeat: "stretch",
	rightSlice: 60,
	rightWidth: "0.75rem",
} as const;

function chunkAchievements(items: readonly SanctumAchievement[]): readonly (readonly SanctumAchievement[])[] {
	const rows: SanctumAchievement[][] = [];
	for (let index = 0; index < items.length; index += achievementsPerRow) {
		rows.push(items.slice(index, index + achievementsPerRow));
	}
	return rows;
}

export function XianxiaSanctumPage({ layout }: ThemePageProps): JSX.Element {
	return (
		<main
			className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[22px] border border-white/35 bg-slate-950"
			data-theme-page-layout={layout}
		>
			<img alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover opacity-95" src={xianxiaAssets.appBackground} />
			<motion.div
				animate={{ opacity: 1 }}
				className="absolute inset-0 bg-[radial-gradient(circle_at_12%_22%,rgba(255,255,255,0.32),transparent_16%),linear-gradient(90deg,rgba(11,18,32,0.3),rgba(235,239,248,0.12)_54%,rgba(11,18,32,0.24))]"
				initial={{ opacity: 0 }}
				transition={{ duration: 0.8, ease: "easeOut" }}
			/>
			<motion.div
				animate={{ opacity: 1, scale: 1 }}
				className="relative h-[850px] w-[1360px] flex-none"
				initial={{ opacity: 0, scale: 0.985 }}
				transition={{ duration: 0.55, ease: "easeOut" }}
			>
				<XianxiaPageHeader />
				<div className="grid grid-cols-[470px_820px] gap-[34px] px-8 pt-[88px]">
					<XianxiaProfileColumn />
					<XianxiaAchievementPanel />
				</div>
				<XianxiaBottomBar />
			</motion.div>
		</main>
	);
}

function XianxiaPageHeader(): JSX.Element {
	return (
		<motion.header
			animate={{ opacity: 1, y: 0 }}
			className="absolute inset-x-0 top-0 z-20 flex h-20 items-start justify-between px-8 pt-7 text-white drop-shadow-[0_2px_5px_rgba(15,23,42,0.7)]"
			initial={{ opacity: 0, y: -14 }}
			transition={{ duration: 0.45, ease: "easeOut" }}
		>
			<div className="flex items-start gap-3">
				<button
					type="button"
					aria-label="Back"
					title="Back"
					onClick={() => window.history.back()}
					className="mt-0.5 h-10 w-10 transition-transform hover:-translate-x-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
				>
					<img alt="" aria-hidden="true" className="h-full w-full object-contain" src={sanctumPageAssets.backButton} />
				</button>
				<div>
					<div className="flex items-center gap-4">
						<h1 className="text-[31px] font-semibold leading-8">Cultivation Achievements</h1>
						<span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/65 text-lg leading-none text-white/90">
							i
						</span>
					</div>
					<p className="mt-1 text-[19px] leading-none text-white/90">修仙成就</p>
				</div>
			</div>
			<p className="absolute left-1/2 top-[78px] -translate-x-1/2 text-[17px] text-white/90">
				15 Realms of Cultivation · Forge your path, ascend to immortality
			</p>
			<div className="flex items-center gap-4">
				<span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/55 text-2xl text-white/90">?</span>
				<div className="flex items-center gap-2 rounded-full bg-slate-900/25 px-2 py-1.5">
					<motion.img
						animate={{ boxShadow: "0 0 12px rgba(255,255,255,0.52)" }}
						alt=""
						aria-hidden="true"
						className="h-11 w-11 rounded-full object-cover ring-2 ring-white/65"
						initial={{ boxShadow: "0 0 0 rgba(255,255,255,0)" }}
						src={sanctumPageAssets.achievements.unlocked[1]}
						transition={{ duration: 1.8, repeat: Infinity, repeatType: "reverse" }}
					/>
					<span className="text-[17px]">Barefoot Beech</span>
					<span className="icon-[solar--alt-arrow-down-linear] h-4 w-4" />
				</div>
			</div>
		</motion.header>
	);
}

function XianxiaProfileColumn(): JSX.Element {
	return (
		<section className="relative flex h-[650px] min-h-0 flex-col items-center justify-start">
			<div className="absolute left-1/2 top-[70px] z-20 -translate-x-1/2 rounded-full bg-slate-800/65 px-6 py-1.5 text-[15px] font-semibold text-white shadow-[0_0_8px_rgba(255,255,255,0.35)]">
				当前境界 · Current Realm
			</div>
			<motion.img
				animate={{ opacity: 1, y: 0 }}
				alt=""
				aria-hidden="true"
				className="relative h-[520px] w-[470px] object-contain drop-shadow-[0_0_16px_rgba(255,255,255,0.68)]"
				initial={{ opacity: 0, y: 10 }}
				src={sanctumPageAssets.character}
				transition={{ duration: 0.5, ease: "easeOut" }}
			/>
			<motion.div
				animate={{ opacity: 1, y: 0 }}
				className="relative -mt-[220px] aspect-[1131/1035] w-[440px]"
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
					<div className="relative mx-auto -mt-11 flex h-16 w-16 items-center justify-center text-[34px] font-semibold text-white drop-shadow-[0_1px_4px_rgba(15,23,42,0.8)]">
						<img
							alt=""
							aria-hidden="true"
							className="absolute inset-0 h-full w-full object-contain"
							src={sanctumPageAssets.realmNumberFrame}
						/>
						<span className="relative z-10">2</span>
					</div>
					<h2 className="mt-2 text-[30px] font-semibold leading-8 text-slate-900">Foundation Establishment</h2>
					<p className="mt-1 text-[21px] font-semibold tracking-[0.24em] text-slate-700">筑 基 境</p>
					<p className="mx-auto mt-4 w-[300px] text-[14px] leading-5 text-slate-600">
						The foundation is laid, the core is steady. The path of immortality has truly begun.
					</p>
				</div>
				<div className="absolute inset-x-14 bottom-7">
					<div className="mb-2 flex items-center justify-center gap-2 text-[13px] text-slate-600">
						<span className="h-px w-16 bg-slate-300" />
						<span>Realm Perks</span>
						<span className="h-px w-16 bg-slate-300" />
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
									className="mx-auto h-11 w-11 object-contain drop-shadow-[0_0_7px_rgba(255,255,255,0.72)]"
									src={icon}
								/>
								<span className="mt-1 block text-[11px] leading-tight text-slate-600">+10%</span>
							</motion.div>
						))}
					</div>
				</div>
			</motion.div>
		</section>
	);
}

function XianxiaAchievementPanel(): JSX.Element {
	const rows = chunkAchievements(sanctumAchievements);

	return (
		<motion.section
			animate={{ opacity: 1, x: 0 }}
			className="relative flex aspect-[1188/963] w-[820px] items-center justify-center self-start"
			initial={{ opacity: 0, x: 18 }}
			transition={{ delay: 0.1, duration: 0.5, ease: "easeOut" }}
		>
			<img
				alt=""
				aria-hidden="true"
				className="absolute inset-0 h-full w-full object-contain"
				src={sanctumPageAssets.achievementPanel}
			/>
			<div className="relative z-10 flex w-full flex-col px-8 py-8" style={achievementLayoutStyle}>
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
				<div className="flex flex-col gap-1">
					{rows.map((row, rowIndex) => (
						<div
							key={`row-${rowIndex}`}
							className="grid grid-cols-[var(--sanctum-achievement-size)_var(--sanctum-achievement-connector-size)_var(--sanctum-achievement-size)_var(--sanctum-achievement-connector-size)_var(--sanctum-achievement-size)_var(--sanctum-achievement-connector-size)_var(--sanctum-achievement-size)_var(--sanctum-achievement-connector-size)_var(--sanctum-achievement-size)] items-start"
						>
							{row.map((achievement, index) => (
								<XianxiaAchievementCell
									key={achievement.id}
									achievement={achievement}
									assetIndex={rowIndex * achievementsPerRow + index}
									current={achievement.id === currentAchievement?.id}
									showConnector={index < row.length - 1}
								/>
							))}
						</div>
					))}
				</div>
			</div>
		</motion.section>
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
				className="relative flex min-w-0 flex-col items-center rounded-[18px] px-1 pb-2 pt-1 text-center"
				initial={{ opacity: 0, scale: 0.92, y: 10 }}
				transition={{ delay: 0.18 + assetIndex * 0.035, duration: 0.28, ease: "easeOut" }}
			>
				{current && (
					<img
						alt=""
						aria-hidden="true"
						className="pointer-events-none absolute left-1/2 top-[39px] z-0 h-auto w-[70%] max-w-none -translate-x-1/2"
						src={sanctumPageAssets.currentAchievementBackground}
					/>
				)}
				<img
					alt=""
					aria-hidden="true"
					className={cn(
						"relative z-10 w-auto max-w-none",
						current ? "h-[calc(var(--sanctum-achievement-size)*1.08)]" : "h-[var(--sanctum-achievement-size)]",
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
			</motion.figure>
			{showConnector && (
				<motion.div
					animate={{ opacity: 1, scaleX: 1 }}
					className="flex h-[var(--sanctum-achievement-size)] items-center justify-center"
					initial={{ opacity: 0, scaleX: 0.65 }}
					transition={{ delay: 0.24 + assetIndex * 0.035, duration: 0.3, ease: "easeOut" }}
				>
					<img
						alt=""
						aria-hidden="true"
						className="w-[var(--sanctum-achievement-connector-size)] object-contain opacity-[0.82] drop-shadow-[0_0_4px_rgba(255,255,255,0.5)]"
						src={sanctumPageAssets.achievementConnector}
					/>
				</motion.div>
			)}
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
			className="absolute inset-x-8 bottom-5 flex h-16 items-center justify-between rounded-2xl border border-white/35 bg-slate-200/45 px-8 text-slate-700 shadow-[inset_0_0_12px_rgba(255,255,255,0.55),0_0_12px_rgba(15,23,42,0.28)]"
			initial={{ opacity: 0, y: 18 }}
			transition={{ delay: 0.25, duration: 0.45, ease: "easeOut" }}
		>
			<div className="flex items-center gap-5">
				<span className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-400/60 bg-slate-900/10">
					<span className="icon-[solar--compass-big-linear] h-7 w-7 text-slate-600" />
				</span>
				<p className="w-[360px] text-[14px] leading-5">Each realm breakthrough unlocks new abilities, boosts attributes, and opens the path to higher cultivation.</p>
			</div>
			<div className="h-11 w-px bg-slate-400/45" />
			<div className="flex items-center gap-5">
				<span className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-400/60 bg-slate-900/10">
					<span className="icon-[solar--book-2-linear] h-7 w-7 text-slate-600" />
				</span>
				<p className="w-[310px] text-[14px] leading-5">Complete tasks, accumulate cultivation, and transcend to higher realms.</p>
			</div>
			<button
				type="button"
				className="flex h-11 items-center gap-3 rounded-2xl border border-amber-200/80 bg-slate-700 px-7 text-[18px] font-semibold text-white shadow-[0_0_8px_rgba(255,255,255,0.42)]"
			>
				<span className="icon-[solar--book-bookmark-linear] h-6 w-6" />
				<span>View Cultivation Record</span>
				<span className="icon-[solar--arrow-right-linear] h-5 w-5" />
			</button>
		</motion.footer>
	);
}
