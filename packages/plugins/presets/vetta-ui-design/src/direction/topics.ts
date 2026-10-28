/**
 * App 屏幕的参考资料按「话题」切开，由方向表随表送出。
 *
 * 为什么不让 agent 自己读：SKILL.md 只能要求「开工前读完」，弱模型会跳过，而且跳过
 * 没有任何报错。方向表是工具返回值，agent 一定会看到，又恰好在它开始规划屏幕之前。
 *
 * 耦合只有一处契约——话题 id（`references/taste/app/<id>.md` 的文件名）；本文件把 id
 * 换成文字。核心（`app-screens.md`）不依赖这里：方向表漏送任何一段，agent 手里仍有
 * 一份自成一体的核心，只是少了部件细节。
 */
import charts from "../../agent/skills/vetta-ui-design/references/taste/app/charts.md?raw";
import forms from "../../agent/skills/vetta-ui-design/references/taste/app/forms.md?raw";
import kpis from "../../agent/skills/vetta-ui-design/references/taste/app/kpis.md?raw";
import navigation from "../../agent/skills/vetta-ui-design/references/taste/app/navigation.md?raw";
import phone from "../../agent/skills/vetta-ui-design/references/taste/app/phone.md?raw";
import shell from "../../agent/skills/vetta-ui-design/references/taste/app/shell.md?raw";
import tables from "../../agent/skills/vetta-ui-design/references/taste/app/tables.md?raw";
import values from "../../agent/skills/vetta-ui-design/references/taste/app/values.md?raw";

/** 送出顺序即阅读顺序：外壳 → 内容部件 → 数值 → 手机。 */
export const APP_TOPICS = { shell, kpis, charts, tables, forms, values, phone, navigation } as const;
export type AppTopic = keyof typeof APP_TOPICS;

const TOPIC_ORDER = Object.keys(APP_TOPICS) as AppTopic[];

/** 屏幕里承载内容的部件。agent 自己编排屏幕，事先不知道用到哪几样，所以全部送上。 */
const CONTENT_TOPICS: readonly AppTopic[] = ["kpis", "charts", "tables", "forms"];

export interface SheetTopicOptions {
	/** 手机宽度：折叠外壳的做法在 phone 里，桌面外壳那一段不送。 */
	phone: boolean;
}

/**
 * 整张方向表要送的话题，按阅读顺序排好。数值（values）总是送：配色字体是 agent 自己定的，
 * 对比度、字号台阶、圆角这些底线没有别处替它把关。
 */
export function sheetTopics(options: SheetTopicOptions): AppTopic[] {
	const wanted = new Set<AppTopic>([...CONTENT_TOPICS, "values", ...(options.phone ? ["phone", "navigation"] as const : (["shell"] as const))]);
	return TOPIC_ORDER.filter((topic) => wanted.has(topic));
}

/** 话题正文。方向表里它们是最后一节的子段，标题降一级。 */
export function renderTopic(topic: AppTopic): string {
	return APP_TOPICS[topic].trimEnd().replace(/^## /, "### ");
}
