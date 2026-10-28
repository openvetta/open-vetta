import designer from "../agent/agents/designer.md?raw";

/**
 * 「八荣八耻」的短版。完整版（每条带截图里的自检方法）在 agents/designer.md 里，
 * 这里的短版在工作周期的几个节点由工具送到 agent 眼前：建稿、方向表、每次截图。
 * 提示词写一遍只在开头读到一次，agent 做到后半程就忘了；工具返回值每一步都会看。
 */
export const CREED_ITEMS = [
	"one thing seen first",
	"space and alignment, not lines and boxes",
	"held objects with light, grain and an edge",
	"built from what only this product has",
	"real data, pictures and words",
	"one bold move, the rest quiet",
	"type with character and a real size step",
	"colour with a source",
] as const;

/** 优先级与例外一并写在这里：只有用户的话能压过它。 */
export const CREED_LINE = `Core principles — they outrank the style defaults; only the user's words outrank them (if the user asks for or clearly implies the opposite, follow the user and say in one line which one you broke): ${CREED_ITEMS.map((item, index) => `${index + 1} ${item}`).join(" · ")}.`;

/** 截图之后的自检：问句形式，agent 对着图回答。 */
export const CREED_CHECK = "Then ask of the image: is one thing seen first? does the structure survive without lines? does the hero object look held? is it this product's, not the category's? is every number real? can you name the one bold move? do heading and body sound different? can you say where each colour comes from? Fix what fails, unless the user asked for it.";

/**
 * 完整版从 designer.md 取，只有一份正文：设计师 agent 靠 systemPromptPath 读到它，其余 agent
 * 靠这一段注入系统提示读到它。大多数人用默认 agent，不能让优化只对"设计师"生效。
 */
export function corePrinciplesBlock(): string {
	const start = designer.indexOf("## Core principles");
	const end = designer.indexOf("\n\nYou are the visual design specialist");
	return start >= 0 && end > start ? designer.slice(start, end).trim() : CREED_LINE;
}
