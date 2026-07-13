import { useThemeStorage, type ThemePageProps, type ThemeStorageValue } from "@vetta/theme-sdk";
import { CenterSliceImageDecoration, HorizontalSliceImageDecoration, HorizontalSliceImageFrame, NineSliceImageFrame } from "@vetta/theme-ui";
import { cn } from "@vetta/ui";
import { motion } from "motion/react";
import { useEffect, useSyncExternalStore, type CSSProperties, type JSX } from "react";
import { CULTIVATION_REALMS, CULTIVATION_STORAGE_KEY, type CultivationSnapshot } from "../../cultivation";
import { sanctumAchievements, type SanctumAchievement } from "./achievements";
import { sanctumPageAssets } from "./assets";
import { XianxiaSanctumPageHeader } from "./XianxiaSanctumPageHeader";

const fallbackRealm = CULTIVATION_REALMS[0];
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
const cultivationDataSources = [
	{ icon: "icon-[solar--checklist-minimalistic-bold]", label: "完成任务" },
	{ icon: "icon-[solar--document-text-bold]", label: "引用知识库" },
	{ icon: "icon-[solar--magic-stick-3-bold]", label: "生成有效结果" },
	{ icon: "icon-[solar--settings-bold]", label: "建立自动化" },
] as const;

interface SanctumCultivationView {
	readonly achievedRealmIds: readonly string[];
	readonly currentPower: number;
	readonly englishName: string;
	readonly growth: readonly {
		readonly label: string;
		readonly value: number;
	}[];
	readonly level: number;
	readonly maxPower: number;
	readonly name: string;
	readonly progressPercent: string;
	readonly realmId: string;
}

const fallbackCultivationView: SanctumCultivationView = {
	achievedRealmIds: [fallbackRealm.id],
	currentPower: 0,
	englishName: fallbackRealm.englishName,
	growth: [
		{ label: "今日", value: 0 },
		{ label: "本周", value: 0 },
		{ label: "近30天", value: 0 },
	],
	level: fallbackRealm.level,
	maxPower: CULTIVATION_REALMS[1]?.targetScore ?? 0,
	name: fallbackRealm.name,
	progressPercent: "0%",
	realmId: fallbackRealm.id,
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readCultivationSnapshot(value: ThemeStorageValue | undefined): CultivationSnapshot | null {
	if (!isRecord(value)) return null;
	if (value.version !== 3) return null;
	if (typeof value.realmId !== "string") return null;
	if (typeof value.level !== "number") return null;
	if (typeof value.name !== "string") return null;
	if (typeof value.englishName !== "string") return null;
	if (typeof value.cultivationPower !== "number") return null;
	if (typeof value.cultivationPowerTarget !== "number") return null;
	if (typeof value.progressToNext !== "number") return null;
	if (!Array.isArray(value.achievedRealmIds)) return null;
	if (!isRecord(value.growth)) return null;

	return value as unknown as CultivationSnapshot;
}

function useCultivationSnapshot(): CultivationSnapshot | null {
	const storage = useThemeStorage();

	useSyncExternalStore(
		storage.subscribe,
		() => `${storage.status}:${JSON.stringify(storage.get(CULTIVATION_STORAGE_KEY))}`,
		() => "loading:",
	);

	if (storage.status !== "ready") return null;
	return readCultivationSnapshot(storage.get(CULTIVATION_STORAGE_KEY));
}

function toCultivationView(snapshot: CultivationSnapshot | null): SanctumCultivationView {
	if (!snapshot) return fallbackCultivationView;
	const maxPower =
		snapshot.cultivationPowerTarget > 0
			? snapshot.cultivationPowerTarget
			: Math.max(snapshot.cultivationPower, 1);

	return {
		achievedRealmIds: snapshot.achievedRealmIds,
		currentPower: snapshot.cultivationPower,
		englishName: snapshot.englishName,
		growth: [
			{ label: "今日", value: snapshot.growth.today },
			{ label: "本周", value: snapshot.growth.thisWeek },
			{ label: "近30天", value: snapshot.growth.last30Days },
		],
		level: snapshot.level,
		maxPower,
		name: snapshot.name,
		progressPercent: `${Math.round(snapshot.progressToNext * 100)}%`,
		realmId: snapshot.realmId,
	};
}

function formatCultivationNumber(value: number): string {
	return Math.floor(value).toLocaleString("en-US");
}

function formatSignedCultivationNumber(value: number): string {
	return `+${formatCultivationNumber(value)}`;
}

function getCultivationNumberGlyphs(value: number): readonly string[] {
	return formatCultivationNumber(value).split("");
}

function formatRealmTitle(name: string): string {
	return name.split("").join(" ");
}

function XianxiaCultivationNumber({
	className,
	digitClassName,
	prefix,
	value,
}: {
	readonly className?: string;
	readonly digitClassName: string;
	readonly prefix?: string;
	readonly value: number;
}): JSX.Element {
	return (
		<span className={cn("inline-flex items-end", className)}>
			{prefix && <span className="mr-1 font-semibold leading-none text-amber-50">{prefix}</span>}
			{getCultivationNumberGlyphs(value).map((glyph, index) =>
				glyph === "," ? (
					<span
						aria-hidden="true"
						className="mx-0.5 translate-y-[-0.06em] font-semibold leading-none text-amber-50"
						key={`${glyph}-${index}`}
					>
						,
					</span>
				) : (
					<img
						alt={glyph}
						className={cn("w-auto max-w-none object-contain", digitClassName)}
						key={`${glyph}-${index}`}
						src={sanctumPageAssets.cultivationDigits[Number(glyph)]}
					/>
				),
			)}
		</span>
	);
}

export function XianxiaSanctumPage({ layout }: ThemePageProps): JSX.Element {
	const cultivation = toCultivationView(useCultivationSnapshot());

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
					<XianxiaProfileColumn cultivation={cultivation} />
					<XianxiaSanctumContentColumn cultivation={cultivation} />
				</div>
				<XianxiaBottomBar />
			</motion.div>
		</main>
	);
}

function XianxiaProfileColumn({
	cultivation,
}: {
	readonly cultivation: SanctumCultivationView;
}): JSX.Element {
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
					<XianxiaCultivationNumber
						className="absolute left-1/2 top-[-35px] z-10 -translate-x-1/2 drop-shadow-[0_1px_4px_rgba(15,23,42,0.8)]"
						digitClassName="h-[30px]"
						value={cultivation.level}
					/>
					<h2 className="mt-[28px] whitespace-nowrap text-[29px] font-semibold leading-8 text-slate-900">{cultivation.englishName}</h2>
					<p className="mt-[28px] text-[20px] font-semibold tracking-[0.24em] text-slate-700">{formatRealmTitle(cultivation.name)}</p>
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

function XianxiaSanctumContentColumn({
	cultivation,
}: {
	readonly cultivation: SanctumCultivationView;
}): JSX.Element {
	return (
		<motion.section
			animate={{ opacity: 1, x: 0 }}
			className="relative flex w-[530px] min-w-0 flex-col gap-5 self-start justify-self-center min-[1060px]:w-full"
			initial={{ opacity: 0, x: 18 }}
			transition={{ delay: 0.1, duration: 0.5, ease: "easeOut" }}
		>
			<XianxiaCultivationPowerPanel cultivation={cultivation} />
			<XianxiaAchievementPanel cultivation={cultivation} />
		</motion.section>
	);
}

function XianxiaCultivationPowerPanel({
	cultivation,
}: {
	readonly cultivation: SanctumCultivationView;
}): JSX.Element {
	return (
		<section className="relative aspect-[2172/724] min-h-[236px] w-full min-w-0 overflow-visible px-[31px] py-[17px] text-white">
			<img
				alt=""
				aria-hidden="true"
				className="absolute inset-0 h-full w-full object-fill drop-shadow-[0_0_10px_rgba(255,246,210,0.5)]"
				src={sanctumPageAssets.cultivationPowerPanel}
			/>
			<div className="relative z-10 grid h-full min-w-0 grid-cols-[minmax(0,1fr)_9.5rem] gap-4 min-[1280px]:grid-cols-[minmax(0,1fr)_10.5rem] min-[1280px]:gap-6">
				<div className="flex min-w-0 flex-col">
					<div className="flex items-center gap-3">
						<span className="text-[18px] text-amber-100 drop-shadow-[0_0_5px_rgba(255,245,205,0.8)]">✧</span>
						<h2 className="text-[22px] font-semibold leading-7 text-amber-50 drop-shadow-[0_1px_3px_rgba(15,23,42,0.65)] min-[1280px]:text-[24px] min-[1280px]:leading-8">
							修为值
						</h2>
						<span className="text-[16px] text-slate-200/90 min-[1280px]:text-[18px]">Cultivation Power</span>
						<span className="icon-[solar--info-circle-linear] h-5 w-5 flex-none text-slate-200/75" />
					</div>
					<div className="ml-4 min-[1280px]:ml-6">
						<div className="mt-2 flex min-w-0 items-end gap-3">
							<XianxiaCultivationNumber
								className="drop-shadow-[0_1px_4px_rgba(15,23,42,0.75)]"
								digitClassName="h-[48px] min-[1280px]:h-[58px]"
								value={cultivation.currentPower}
							/>
							<span className="pb-1.5 text-[25px] font-semibold leading-none text-slate-100/95 min-[1280px]:pb-2 min-[1280px]:text-[30px]">/ {formatCultivationNumber(cultivation.maxPower)}</span>
						</div>
						<div className="mt-2 h-3 w-[82%] shrink-0 overflow-hidden rounded-full border border-amber-100/45 bg-slate-950/35 shadow-inner">
							<motion.div
								animate={{ width: cultivation.progressPercent }}
								className="h-full rounded-full bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-300 shadow-[0_0_7px_rgba(255,240,190,0.75)]"
								initial={{ width: "0%" }}
								transition={{ delay: 0.38, duration: 0.75, ease: "easeOut" }}
							/>
						</div>
						<p className="mt-2 text-[13px] font-semibold tracking-[0.08em] text-slate-200/70">
							数据来自真实使用行为
						</p>
					</div>
					<div className="mt-auto grid min-h-[4.65rem] shrink-0 grid-cols-[1.1fr_repeat(3,1fr)] overflow-hidden rounded-[10px] border border-white/18 bg-slate-900/18">
						<div className="flex min-w-0 items-start px-3 pt-3 text-[15px] font-semibold tracking-[0.08em] text-slate-200/90 min-[1280px]:px-4 min-[1280px]:text-[17px]">
							最近增长
						</div>
						{cultivation.growth.map((item, index) => (
							<div
								className="relative flex min-w-0 flex-col items-center justify-center px-2 py-1.5 text-center"
								key={item.label}
							>
								{index > 0 && <span className="absolute bottom-3 left-0 top-3 w-px bg-white/16" />}
								<div className="truncate text-[13px] leading-5 text-slate-200/85">{item.label}</div>
								<XianxiaCultivationNumber
									className="mt-0.5 drop-shadow-[0_1px_3px_rgba(15,23,42,0.62)]"
									digitClassName="h-[24px] min-[1280px]:h-[28px]"
									prefix="+"
									value={item.value}
								/>
							</div>
						))}
					</div>
				</div>
				<div className="mt-[26px] flex min-h-0 flex-col rounded-[10px] border border-slate-300/60 bg-slate-50/82 px-3 py-3 text-slate-700 shadow-[inset_0_0_12px_rgba(255,255,255,0.65)]">
					<div className="mb-2 text-[14px] font-semibold leading-5 tracking-[0.08em] text-slate-700 min-[1280px]:text-[15px]">
						数据来源:
					</div>
					<div className="flex min-h-0 flex-1 flex-col justify-between gap-1.5">
						{cultivationDataSources.map((source) => (
							<div className="flex min-w-0 items-center gap-2" key={source.label}>
								<span className="flex h-6 w-6 flex-none items-center justify-center rounded-full border border-slate-400/55 bg-slate-700 text-amber-100 shadow-[0_1px_3px_rgba(15,23,42,0.28)]">
									<span className={cn(source.icon, "h-3.5 w-3.5")} />
								</span>
								<span className="truncate text-[13px] font-semibold leading-5 min-[1280px]:text-[14px]">{source.label}</span>
							</div>
						))}
					</div>
				</div>
			</div>
		</section>
	);
}

function XianxiaAchievementPanel({
	cultivation,
}: {
	readonly cultivation: SanctumCultivationView;
}): JSX.Element {
	const unlockedCount = cultivation.achievedRealmIds.length;
	const unlockedPercent = `${Math.round((unlockedCount / sanctumAchievements.length) * 100)}%`;

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
							<span>{unlockedCount} / {sanctumAchievements.length} Unlocked</span>
						</div>
						<div className="mt-2 h-1.5 w-56 rounded-full bg-slate-300/70">
							<motion.div
								animate={{ width: unlockedPercent }}
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
							achieved={cultivation.achievedRealmIds.includes(achievement.id)}
							assetIndex={index}
							current={achievement.id === cultivation.realmId}
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
	achieved,
	assetIndex,
	current,
	showConnector,
}: {
	readonly achievement: SanctumAchievement;
	readonly achieved: boolean;
	readonly assetIndex: number;
	readonly current: boolean;
	readonly showConnector: boolean;
}): JSX.Element {
	const icon = achieved
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
						achieved
							? "drop-shadow-[0_0_9px_rgba(202,255,240,0.56)]"
							: "opacity-80 saturate-[0.72] drop-shadow-[0_0_5px_rgba(255,255,255,0.38)]",
					)}
					src={icon}
				/>
				<figcaption className="relative z-10 mt-1.5 min-w-0 text-xs font-semibold leading-tight text-slate-700 drop-shadow-[0_1px_0_rgba(255,255,255,0.85)]">
					<span className="block truncate">{achievement.englishName}</span>
					<span className="mt-0.5 block text-[13px] text-slate-600">{achievement.name}</span>
					<AchievementStatusLabel achieved={achieved} current={current} />
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
