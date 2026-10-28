/**
 * 八荣八耻要贯穿整个工作周期：角色提示开头讲优先级与例外，工具在建稿、方向表、截图三个
 * 节点把它送到 agent 眼前。短版与角色提示里的完整版条数要一致，否则两边会慢慢走样。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CREED_CHECK, CREED_ITEMS, CREED_LINE } from "../src/creed";
import { renderAppSheet } from "../src/direction/sheet";
import { appInputFrom } from "../src/direction/record";
import { chosenApp } from "./proposal-fixture";

const designer = readFileSync(join(__dirname, "../agent/agents/designer.md"), "utf8");

describe("八荣八耻", () => {
	it("角色提示把它放在最前面，并写明只有用户的话能压过它", () => {
		const first = designer.indexOf("## Core principles: the eight prides and shames");
		expect(first).toBe(0);
		expect(designer.slice(0, 900)).toMatch(/Only the user's words outrank them/);
		expect(designer.slice(0, 900)).toMatch(/say in one line which principle you broke/);
	});

	it("短版与完整版同样是八条", () => {
		expect(CREED_ITEMS).toHaveLength(8);
		expect(CREED_LINE).toMatch(/only the user's words outrank them/);
		expect(CREED_LINE).toContain("8 colour with a source");
		expect(CREED_CHECK.match(/\?/g)).toHaveLength(8);
	});

	it("方向表开头带着它", () => {
		const input = appInputFrom({ brief: "bank card manager" });
		const { record, proposal } = chosenApp(input);
		const sheet = renderAppSheet(input, proposal, record.obvious ?? "", { frameWidth: 1440, seed: 1, redraws: [] });
		expect(sheet.text).toContain(CREED_LINE);
	});

	it("建稿与截图的工具返回值带着它", () => {
		const tools = readFileSync(join(__dirname, "../src/tools.ts"), "utf8");
		expect(tools).toContain("${CREED_LINE}");
		expect(tools.match(/\$\{CREED_CHECK\}/g)?.length).toBeGreaterThanOrEqual(2);
	});
});
