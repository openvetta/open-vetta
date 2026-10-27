/**
 * App 屏幕的参考资料按「话题」切开，由方向表按屏幕把用得上的几段随表送出。
 *
 * 为什么不让 agent 自己读：SKILL.md 只能要求「开工前读完」，弱模型会跳过，而且跳过
 * 没有任何报错。方向表是工具返回值，agent 一定会看到，又恰好在它开始规划屏幕之前。
 *
 * 耦合只有一处契约——话题 id（`references/taste/app/<id>.md` 的文件名）。谁知道屏幕里
 * 有什么，谁报话题 id；本文件把 id 换成文字。核心（`app-screens.md`）不依赖这里：
 * 方向表漏送任何一段，agent 手里仍有一份自成一体的核心，只是少了部件细节。
 */
import charts from "../../agent/skills/vetta-ui-design/references/taste/app/charts.md?raw";
import forms from "../../agent/skills/vetta-ui-design/references/taste/app/forms.md?raw";
import kpis from "../../agent/skills/vetta-ui-design/references/taste/app/kpis.md?raw";
import phone from "../../agent/skills/vetta-ui-design/references/taste/app/phone.md?raw";
import shell from "../../agent/skills/vetta-ui-design/references/taste/app/shell.md?raw";
import tables from "../../agent/skills/vetta-ui-design/references/taste/app/tables.md?raw";
import values from "../../agent/skills/vetta-ui-design/references/taste/app/values.md?raw";

/** 送出顺序即阅读顺序：外壳 → 内容部件 → 数值 → 手机。 */
export const APP_TOPICS = { shell, kpis, charts, tables, forms, values, phone } as const;
export type AppTopic = keyof typeof APP_TOPICS;

const TOPIC_ORDER = Object.keys(APP_TOPICS) as AppTopic[];

/** 屏幕里承载内容的部件：版式库里没有对应版式时，把它们全部送上。 */
const CONTENT_TOPICS: readonly AppTopic[] = ["kpis", "charts", "tables", "forms"];

/**
 * 版式 id → 它的屏幕里出现的内容部件。
 *
 * 版式库来自上游 vendor 的固定集合，这张表是编辑判断（读版式的 blueprint 定的），不是从
 * 文本里扫关键词推出来的——关键词会把「list」「line」这类泛词当信号。上游新增版式时，
 * `topics.test.ts` 会因为这里缺一行而失败，而不是让那张屏幕悄悄拿不到部件。
 */
export const PATTERN_TOPICS: Readonly<Record<string, readonly AppTopic[]>> = {
	"kpi-strip-chart-rail": ["kpis", "charts"],
	"kpi-tabs-chart": ["kpis", "charts"],
	"chart-pairs": ["charts"],
	"insights-share-tables": ["charts", "tables"],
	"table-filter-bar": ["tables"],
	"count-cards-filter": ["kpis", "tables"],
	"settings-two-column": ["forms"],
	"settings-with-usage": ["forms", "kpis"],
	"wallet-balance-actions-assets": ["kpis", "tables"],
	"finance-home-pinned-rail": ["kpis", "charts", "tables"],
	"builder-canvas": ["forms"],
	"inbox-triage": ["tables"],
	"workspace-home-greeting": ["kpis", "tables"],
	"object-detail-header-grid": ["kpis", "tables"],
	"generated-report": ["charts", "tables"],
	"tabbed-object-detail": ["tables", "forms"],
	"report-card-legend-table": ["charts", "tables"],
	"research-lists-table": ["tables"],
	"platform-overview-tray": ["kpis", "charts"],
	"bar-list-ranking": ["charts", "tables"],
	"deploy-health-lead": ["kpis", "charts"],
	"power-flow": ["charts"],
	"leave-timeline": ["charts"],
	"cover-matrix": ["charts", "tables"],
	"sell-out-strip": ["charts"],
};

/** 一张屏幕要用的内容部件；`null` 是版式库里没有的屏幕，按「自己编排」处理，全部送上。 */
export function screenTopics(patternId: string | null): AppTopic[] {
	if (patternId === null) return [...CONTENT_TOPICS];
	return [...(PATTERN_TOPICS[patternId] ?? CONTENT_TOPICS)];
}

export interface SheetTopicOptions {
	/** 手机宽度：折叠外壳的做法在 phone 里，桌面外壳那一段不送。 */
	phone: boolean;
	/** 品牌保留了配色或字体：方向表没定它们，数值那一段才有用。 */
	keepsStyle: boolean;
}

/** 整张方向表要送的话题，去重并按阅读顺序排好。 */
export function sheetTopics(patternIds: readonly (string | null)[], options: SheetTopicOptions): AppTopic[] {
	const wanted = new Set<AppTopic>(patternIds.flatMap(screenTopics));
	wanted.add(options.phone ? "phone" : "shell");
	if (options.keepsStyle) wanted.add("values");
	return TOPIC_ORDER.filter((topic) => wanted.has(topic));
}

/** 话题正文。方向表里它们是第 6 节的子段，标题降一级。 */
export function renderTopic(topic: AppTopic): string {
	return APP_TOPICS[topic].trimEnd().replace(/^## /, "### ");
}
