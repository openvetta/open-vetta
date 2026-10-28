/**
 * App 屏幕的参考部件随方向表送出。这里守两件事：部件文件都在、方向表按画框宽度带上
 * 手机或桌面外壳那一段。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_TOPICS, renderTopic, sheetTopics } from "../src/direction/topics";

describe("参考部件", () => {
	it("部件都有正文，且以二级标题开头（送出时降一级）", () => {
		for (const [topic, text] of Object.entries(APP_TOPICS)) {
			expect(text.startsWith("## "), topic).toBe(true);
			expect(text.length, topic).toBeGreaterThan(300);
		}
	});

	it("核心文件点名的部件和 app/ 目录里的文件一一对应", () => {
		const core = readFileSync(join(__dirname, "../agent/skills/vetta-ui-design/references/taste/app-screens.md"), "utf8");
		for (const topic of Object.keys(APP_TOPICS)) expect(core, topic).toContain(`\`${topic}\``);
	});

	it("按阅读顺序排：内容部件和数值总是带，桌面带外壳，手机带手机", () => {
		expect(sheetTopics({ phone: false })).toEqual(["shell", "kpis", "charts", "tables", "forms", "values"]);
		expect(sheetTopics({ phone: true })).toEqual(["kpis", "charts", "tables", "forms", "values", "phone", "navigation"]);
	});

	it("话题正文送出时标题降一级", () => {
		expect(renderTopic("charts").startsWith("### Charts")).toBe(true);
	});
});
