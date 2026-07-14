import type { ThemeUsageStats } from "@vetta/theme-sdk";
import { sanctumAchievements } from "./achievements";
import { sanctumPageAssets } from "./assets";
import { getCultivationCompositionItems } from "./cultivationComposition";
import { formatCultivationNumber } from "./cultivationView";
import type { SanctumCultivationView } from "./types";

/** Ability XP floors for Lv.1–5 (composition power contribution). */
export const ABILITY_LEVEL_XP_THRESHOLDS = [0, 50, 150, 350, 700] as const;

/**
 * Estimated minutes saved per action (manual work avoided).
 * Tunable product constants — not app-monitor fields.
 */
export const SAVED_TIME_MINUTES = {
	automationRun: 15,
	batchRun: 20,
	knowledgeOp: 3,
	toolCompleted: 5,
} as const;

export type GrowthReportPeriodMode = "month" | "week";

export interface GrowthReportPeriodQuery {
	readonly mode: GrowthReportPeriodMode;
	/** 0 = current period; negative = past periods. */
	readonly offset: number;
}

export interface GrowthReportMetric {
	readonly iconUrl: string;
	readonly label: string;
	readonly unit: string;
	readonly value: string;
}

export interface GrowthReportAbility {
	readonly description: string;
	readonly iconUrl: string;
	readonly label: string;
	readonly level: number;
	readonly progress: number;
}

export interface GrowthReportBadge {
	readonly date: string;
	readonly description: string;
	readonly iconUrl: string;
	readonly title: string;
}

export interface GrowthReportNextStep {
	readonly iconUrl: string;
	readonly label: string;
}

export interface GrowthReportRealmNode {
	readonly date: string;
	readonly iconUrl: string;
	readonly id: string;
	readonly name: string;
}

export interface GrowthReportView {
	readonly abilities: readonly GrowthReportAbility[];
	readonly badges: readonly GrowthReportBadge[];
	readonly historyEndLabel: string;
	readonly historyPoints: readonly number[];
	readonly historyStartLabel: string;
	readonly metrics: readonly GrowthReportMetric[];
	readonly monthLabel: string;
	readonly nextStepSummary: string;
	readonly nextSteps: readonly GrowthReportNextStep[];
	readonly periodLabel: string;
	readonly realmTimeline: readonly GrowthReportRealmNode[];
}

/**
 * Map sanctum cultivation snapshot fields → 修行履历 panel view-model.
 * UI labels stay fixed; values come from real metrics / composition / trend.
 */
export function getGrowthReportView(
	cultivation: SanctumCultivationView,
	period: GrowthReportPeriodQuery = { mode: "month", offset: 0 },
): GrowthReportView {
	const metrics = cultivation.metrics;
	const compositionItems = getCultivationCompositionItems(cultivation);
	const range = resolvePeriodRange(period);
	const history = buildHistorySeries(cultivation, range);

	const compositionTotal = compositionItems.reduce((sum, item) => sum + item.value, 0);
	const knowledgeShare = cultivation.score > 0 ? cultivation.scoreBreakdown.knowledge / cultivation.score : 0;
	const knowledgeValue = Math.max(
		0,
		Math.floor(knowledgeShare * Math.max(compositionTotal, cultivation.currentPower)),
	);

	const abilitySource = [
		{
			description: "公文/方案等结构化文档生成能力",
			iconUrl: sanctumPageAssets.cultivationCompositionIcons.document,
			label: "文稿生成",
			value: compositionItems[0]?.value ?? 0,
		},
		{
			description: "数据处理与洞察分析能力",
			iconUrl: sanctumPageAssets.cultivationCompositionIcons.data,
			label: "数据分析",
			value: compositionItems[1]?.value ?? 0,
		},
		{
			description: "风险发现与审查判断能力",
			iconUrl: sanctumPageAssets.cultivationCompositionIcons.risk,
			label: "风险识别",
			value: compositionItems[2]?.value ?? 0,
		},
		{
			description: "流程自动化与任务编排能力",
			iconUrl: sanctumPageAssets.cultivationCompositionIcons.automation,
			label: "自动化执行",
			value: compositionItems[3]?.value ?? 0,
		},
		{
			description: "知识检索、引用与复用能力",
			iconUrl: sanctumPageAssets.cultivationCompositionIcons.knowledge,
			label: "知识应用",
			value: knowledgeValue,
		},
	];

	const nextSteps = buildNextSteps(cultivation, compositionItems);

	return {
		abilities: abilitySource.map((item) => {
			const { level, progress } = levelFromXp(item.value);
			return {
				description: item.description,
				iconUrl: item.iconUrl,
				label: item.label,
				level,
				progress,
			};
		}),
		badges: buildBadges(cultivation, metrics),
		historyEndLabel: history.endLabel,
		historyPoints: history.points,
		historyStartLabel: history.startLabel,
		metrics: [
			{
				iconUrl: sanctumPageAssets.cultivationCompositionIcons.toolCheck,
				label: "完成任务",
				unit: "次",
				value: formatCultivationNumber(metrics.toolsCompleted),
			},
			{
				iconUrl: sanctumPageAssets.cultivationCompositionIcons.document,
				label: "生成文稿",
				unit: "篇",
				// No dedicated document counter — dialogue volume is the closest real proxy.
				value: formatCultivationNumber(metrics.messages),
			},
			{
				iconUrl: sanctumPageAssets.cultivationCompositionIcons.data,
				label: "数据分析",
				unit: "次",
				value: formatCultivationNumber(metrics.projectsCreated),
			},
			{
				iconUrl: sanctumPageAssets.cultivationCompositionIcons.risk,
				label: "风险识别",
				unit: "次",
				value: formatCultivationNumber(
					metrics.knowledgeBaseFileOperations + metrics.knowledgeBaseCount,
				),
			},
			{
				iconUrl: sanctumPageAssets.cultivationCompositionIcons.automation,
				label: "自动化执行",
				unit: "次",
				value: formatCultivationNumber(metrics.batchRuns + metrics.automationRuns),
			},
			{
				iconUrl: sanctumPageAssets.cultivationCompositionIcons.time,
				label: "节省时间",
				unit: "h",
				value: formatSavedHours(metrics),
			},
		],
		monthLabel: range.label,
		nextStepSummary: nextSteps.summary,
		nextSteps: nextSteps.items,
		periodLabel: range.periodLabel,
		realmTimeline: buildRealmTimeline(cultivation),
	};
}

interface PeriodRange {
	readonly endKey: string;
	readonly label: string;
	readonly periodLabel: string;
	readonly startKey: string;
}

function resolvePeriodRange(period: GrowthReportPeriodQuery, now = new Date()): PeriodRange {
	const offset = Math.min(0, period.offset);

	if (period.mode === "week") {
		const { end, start } = getWeekBounds(now, offset);
		return {
			endKey: toDateKey(end),
			label: formatWeekLabel(start, end),
			periodLabel: `${formatDate(start)} - ${formatDate(end)}`,
			startKey: toDateKey(start),
		};
	}

	const { end, start } = getMonthBounds(now, offset);
	return {
		endKey: toDateKey(end),
		label: `${start.getFullYear()}年${start.getMonth() + 1}月`,
		periodLabel: `${formatDate(start)} - ${formatDate(end)}`,
		startKey: toDateKey(start),
	};
}

function getMonthBounds(now: Date, offset: number): { readonly end: Date; readonly start: Date } {
	const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
	const end =
		offset === 0
			? new Date(now.getFullYear(), now.getMonth(), now.getDate())
			: new Date(start.getFullYear(), start.getMonth() + 1, 0);
	return { end, start };
}

function getWeekBounds(now: Date, offset: number): { readonly end: Date; readonly start: Date } {
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const day = today.getDay();
	// Monday-start week
	const mondayOffset = day === 0 ? -6 : 1 - day;
	const thisMonday = new Date(today);
	thisMonday.setDate(today.getDate() + mondayOffset + offset * 7);
	const weekEnd = new Date(thisMonday);
	weekEnd.setDate(thisMonday.getDate() + 6);
	const end = offset === 0 && weekEnd > today ? today : weekEnd;
	return { end, start: thisMonday };
}

function formatWeekLabel(start: Date, end: Date): string {
	return `${start.getMonth() + 1}/${start.getDate()} - ${end.getMonth() + 1}/${end.getDate()}`;
}

function buildHistorySeries(
	cultivation: SanctumCultivationView,
	range: PeriodRange,
): {
	readonly endLabel: string;
	readonly points: readonly number[];
	readonly startLabel: string;
} {
	const inRange = cultivation.trend.filter(
		(point) => point.date >= range.startKey && point.date <= range.endKey,
	);

	// Prefer total score for cross-realm readable growth; fall back to realm power.
	const points =
		inRange.length > 0
			? inRange.map((point) => point.score)
			: cultivation.trend.length > 0
				? [cultivation.trend[cultivation.trend.length - 1].score]
				: [cultivation.score];

	const series =
		points.length === 1 ? [Math.max(0, points[0] - Math.max(1, Math.round(points[0] * 0.05))), points[0]] : points;

	const startLabel = inRange[0]?.label ?? range.startKey.slice(5).replace("-", "/");
	const endLabel = inRange[inRange.length - 1]?.label ?? range.endKey.slice(5).replace("-", "/");

	return {
		endLabel,
		points: series,
		startLabel,
	};
}

function buildRealmTimeline(cultivation: SanctumCultivationView): readonly GrowthReportRealmNode[] {
	const currentIndex = Math.max(
		0,
		sanctumAchievements.findIndex((achievement) => achievement.id === cultivation.realmId),
	);
	const prevIndex = Math.max(0, currentIndex - 1);
	const nextIndex = Math.min(sanctumAchievements.length - 1, currentIndex + 1);

	const slots: readonly { readonly date: string; readonly index: number; readonly role: string }[] = [
		{
			date: prevIndex === currentIndex ? "起点" : "已达成",
			index: prevIndex,
			role: "prev",
		},
		{
			date: "当前",
			index: currentIndex,
			role: "current",
		},
		{
			date: nextIndex === currentIndex ? "圆满" : "目标",
			index: nextIndex,
			role: "next",
		},
	];

	return slots.map(({ date, index, role }) => {
		const achievement = sanctumAchievements[index] ?? sanctumAchievements[0];
		const unlocked =
			cultivation.achievedRealmIds.includes(achievement.id) || achievement.id === cultivation.realmId;
		return {
			date,
			iconUrl: unlocked
				? sanctumPageAssets.achievements.unlocked[achievement.level - 1]
				: sanctumPageAssets.achievements.locked[achievement.level - 1],
			id: `${achievement.id}-${role}`,
			name: achievement.name,
		};
	});
}

function buildBadges(
	cultivation: SanctumCultivationView,
	metrics: ThemeUsageStats,
): readonly GrowthReportBadge[] {
	const candidates: Array<GrowthReportBadge & { readonly unlocked: boolean }> = [
		{
			date: "累计",
			description: `${cultivation.name}阶段成长徽章`,
			iconUrl: sanctumPageAssets.achievements.unlocked[Math.max(0, cultivation.level - 1)],
			title: `${cultivation.name}行者`,
			unlocked: true,
		},
		{
			date: "累计",
			description: `累计完成 ${formatCultivationNumber(metrics.interactiveSessions)} 次会话沉淀`,
			iconUrl: sanctumPageAssets.cultivationCompositionIcons.chat,
			title: "洞察之眼",
			unlocked: metrics.interactiveSessions >= 1,
		},
		{
			date: "累计",
			description: `工具调用完成 ${formatCultivationNumber(metrics.toolsCompleted)} 次`,
			iconUrl: sanctumPageAssets.cultivationCompositionIcons.toolCheck,
			title: "百炼巧手",
			unlocked: metrics.toolsCompleted >= 1,
		},
		{
			date: "累计",
			description: `知识库 ${formatCultivationNumber(metrics.knowledgeBaseCount)} 个 · 操作 ${formatCultivationNumber(metrics.knowledgeBaseFileOperations)} 次`,
			iconUrl: sanctumPageAssets.cultivationCompositionIcons.knowledge,
			title: "文思泉涌",
			unlocked: metrics.knowledgeBaseCount + metrics.knowledgeBaseFileOperations >= 1,
		},
		{
			date: "累计",
			description: `自动化 / 批处理 ${formatCultivationNumber(metrics.batchRuns + metrics.automationRuns)} 次`,
			iconUrl: sanctumPageAssets.cultivationCompositionIcons.automation,
			title: "天工开物",
			unlocked: metrics.batchRuns + metrics.automationRuns >= 1,
		},
		{
			date: "累计",
			description: `连续活跃 ${formatCultivationNumber(metrics.activeDayStreak)} 日`,
			iconUrl: sanctumPageAssets.cultivationCompositionIcons.calendar,
			title: "持之以恒",
			unlocked: metrics.activeDayStreak >= 3,
		},
	];

	const unlocked = candidates.filter((item) => item.unlocked).slice(0, 4);
	const locked = candidates.filter((item) => !item.unlocked);
	const filled = [...unlocked, ...locked].slice(0, 4);

	return filled.map(({ date, description, iconUrl, title, unlocked: isUnlocked }) => ({
		date: isUnlocked ? date : "未解锁",
		description,
		iconUrl,
		title,
	}));
}

function buildNextSteps(
	cultivation: SanctumCultivationView,
	compositionItems: ReturnType<typeof getCultivationCompositionItems>,
): { readonly items: readonly GrowthReportNextStep[]; readonly summary: string } {
	const ranked = [...compositionItems].sort((left, right) => left.value - right.value);
	const weakest = ranked[0];
	const second = ranked[1] ?? ranked[0];

	const stepByLabel: Record<string, GrowthReportNextStep> = {
		文稿生成: {
			iconUrl: sanctumPageAssets.cultivationCompositionIcons.document,
			label: "完成 1 次文稿相关对话",
		},
		数据洞察: {
			iconUrl: sanctumPageAssets.cultivationCompositionIcons.data,
			label: "完成 1 次数据分析",
		},
		风险审查: {
			iconUrl: sanctumPageAssets.cultivationCompositionIcons.risk,
			label: "完成 1 次工具 / 知识审查",
		},
		自动化任务: {
			iconUrl: sanctumPageAssets.cultivationCompositionIcons.automation,
			label: "创建 1 个自动化任务",
		},
	};

	const items: GrowthReportNextStep[] = [];
	if (weakest) {
		items.push(
			stepByLabel[weakest.label] ?? {
				iconUrl: sanctumPageAssets.cultivationCompositionIcons.power,
				label: `提升「${weakest.label}」修为`,
			},
		);
	}
	if (second && second.label !== weakest?.label) {
		items.push(
			stepByLabel[second.label] ?? {
				iconUrl: sanctumPageAssets.cultivationCompositionIcons.power,
				label: `提升「${second.label}」修为`,
			},
		);
	}

	if (cultivation.nextRealmId && cultivation.progressToNext >= 0.75 && items.length < 2) {
		items.push({
			iconUrl: sanctumPageAssets.cultivationCompositionIcons.power,
			label: `再积累修为以突破下一境界（${cultivation.progressPercent}）`,
		});
	}

	while (items.length < 2) {
		items.push({
			iconUrl: sanctumPageAssets.cultivationCompositionIcons.chat,
			label: "开启 1 次修炼会话",
		});
	}

	const summary = items
		.slice(0, 2)
		.map((item) => item.label)
		.join("，");

	return { items: items.slice(0, 2), summary };
}

/** Estimated hours saved from tool / automation usage. */
export function computeSavedMinutes(metrics: ThemeUsageStats): number {
	return (
		Math.max(0, metrics.toolsCompleted) * SAVED_TIME_MINUTES.toolCompleted +
		Math.max(0, metrics.automationRuns) * SAVED_TIME_MINUTES.automationRun +
		Math.max(0, metrics.batchRuns) * SAVED_TIME_MINUTES.batchRun +
		Math.max(0, metrics.knowledgeBaseFileOperations) * SAVED_TIME_MINUTES.knowledgeOp
	);
}

function formatSavedHours(metrics: ThemeUsageStats): string {
	const hours = computeSavedMinutes(metrics) / 60;
	if (hours <= 0) return "0";
	if (hours < 0.1) return "0.1";
	return (Math.round(hours * 10) / 10).toString();
}

function formatDate(date: Date): string {
	const year = date.getFullYear();
	const month = `${date.getMonth() + 1}`.padStart(2, "0");
	const day = `${date.getDate()}`.padStart(2, "0");
	return `${year}/${month}/${day}`;
}

function toDateKey(date: Date): string {
	return formatDate(date).replaceAll("/", "-");
}

/**
 * Absolute XP ladder: thresholds are min XP to be at that level.
 * Progress is distance to the next level (Lv.5 = 100%).
 */
export function levelFromXp(xp: number): { readonly level: number; readonly progress: number } {
	const value = Math.max(0, xp);
	const thresholds = ABILITY_LEVEL_XP_THRESHOLDS;
	let level = 1;
	for (let index = thresholds.length - 1; index >= 0; index--) {
		if (value >= thresholds[index]) {
			level = index + 1;
			break;
		}
	}
	if (level >= thresholds.length) {
		return { level: thresholds.length, progress: 100 };
	}
	const floor = thresholds[level - 1];
	const next = thresholds[level];
	const progress = Math.round(((value - floor) / Math.max(1, next - floor)) * 100);
	return {
		level,
		progress: Math.max(8, Math.min(99, progress)),
	};
}
