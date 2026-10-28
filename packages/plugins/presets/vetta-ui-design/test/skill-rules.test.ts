/**
 * 提示词压缩时最怕的是静默丢规则：丢了不会有任何报错，只会在某次出图里表现成「模型
 * 又犯了那个老毛病」。这里把每条硬规则的关键表述钉在它该在的文件里，压缩、搬迁、
 * 改写都得先过这一关；确实要删某条规则，就连这里的断言一起删，让删除在 diff 里可见。
 *
 * 断言取的是规则的骨架（工具名、约定名、禁令的核心短语），不钉整句措辞。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const AGENT_DIR = join(__dirname, "../agent");
// 折行位置不属于规则：把空白折成单个空格再比，重新排版不会误报。
const read = (relative: string): string => readFileSync(join(AGENT_DIR, relative), "utf8").replace(/\s+/g, " ");

/** 正文里必须一直出现的表述，按所属的规则分组。 */
const SKILL_RULES: Record<string, (string | RegExp)[]> = {
	"frame meta is the first statement": ["export const frame", /FIRST statement/],
	"frame fills its canvas": ["`h-full`", "`h-screen`"],
	"icons are Iconify classes from offline sets": ["icon-[lucide--", "`lucide`", "`tabler`", "`mdi`", "`simple-icons`"],
	"internal navigation uses react-router": ["`<Link to>`", "react-router"],
	"no remote images": [/No remote image URLs/, "`vetd_assets`"],
	"theme tokens must exist before use": ["`theme.css`", "`@theme`", /token must exist/],
	"dependencies go through vetd_install": ["`vetd_install`", "Never install an icon package"],
	"typefaces are installed packages": ["@fontsource-variable", "No remote font links"],
	"shared chrome is written once": ["`_layout.tsx`", "<Outlet />", "`components/`"],
	"product type comes first": ["`product`", "`frameSize`", "390x844", "1440x900"],
	"landing looks are dealt, app looks proposed": [
		"`vetd_direction`",
		'`action: "propose"`',
		'`action: "choose"`',
		'`action: "show"`',
		"`direction.ask`",
	],
	"app directions depart from the obvious version": ["`obvious`", /nearest competitor/, /differ\s+in light\/dark, accent colour family and display type class/],
	"learn preferences without pestering": ["without pestering", "`preferences`", "`direction.ask`", "`intent.mood`"],
	"house rules table": ["### House rules", "eyebrow", "Monospace", "Gradients", "01 / 02 / 03", "13px", "terracotta"],
	"expressive devices are a start, named in devices to use": [/expressive devices/, "`devices`", "Name it in `devices` to use it"],
	"existing design starts from vetd_status": ["`vetd_status` ONCE", "`sharedShell`"],
	"history goes through vetd_history / vetd_restore": ["`vetd_history`", "`vetd_restore`"],
	"verify with one screenshot batch and read it": ["`vetd_screenshot`", "`frames: [...]`", "`all: true`", "`stalled: true`", "`renderVerification`"],
	"structure checks for multi-screen products": ["Chrome defined once?", "Shell survives navigation?", "Props actually match?"],
	"notes are handled one at a time through vetd_notes": [
		"`vetd_notes`",
		"`resolve`",
		"`pendingRemaining`",
		"`pendingNotes`",
		"`.notes.json`",
		"`anchorStale`",
		"`element.source`",
		/hits every frame using it/,
	],
	"final vetd_notes call happens only after touching a .vetd design": [
		/one more `vetd_notes` call/,
		/a turn in which you wrote or edited no file inside a `\.vetd\/` directory ends with no `vetd_notes` call at all/,
		/none of them apply to work outside a `\.vetd`/,
	],
	"done definition and stop rule": [/\*\*Done\*\* means/, "`references/quality.md`", /already revised it twice/],
	"export one requested format only": ["`vetd_export`", '`format: "pdf"`', '`format: "images"`', /One format per request/, /Export is not verification/],
	"no rework": ["Never re-read a file you just wrote", "never by rewriting the whole file"],
};

const DESIGNER_RULES: (string | RegExp)[] = [
	"vetd_create",
	"vetd_direction",
	"propose three directions of your own",
	"vetd_screenshot",
	"replace the scaffold palette before the first frame",
	"declare the frame meta as the first statement",
	"Iconify",
	"theme.css",
	"_layout.tsx",
	"production specialist",
	"the eight prides and shames",
	"references/taste/texture.md",
];

const QUALITY_RULES: (string | RegExp)[] = [
	"**1. Misalignment**",
	"**2. Unintended text wrapping**",
	"**3. Classes that resolve to nothing**",
	"**5. Generated-UI tells**",
	"## Why remote image URLs are banned",
	"## When a frame fails to build",
];

const missing = (text: string, needles: readonly (string | RegExp)[]): string[] =>
	needles
		.filter((needle) => (typeof needle === "string" ? !text.includes(needle) : !needle.test(text)))
		.map(String);

describe("vetta-ui-design prompt rules survive edits", () => {
	const skill = read("skills/vetta-ui-design/SKILL.md");

	for (const [rule, needles] of Object.entries(SKILL_RULES)) {
		it(`SKILL.md keeps: ${rule}`, () => {
			expect(missing(skill, needles)).toEqual([]);
		});
	}

	it("designer.md keeps all eight prides and shames, each with its test", () => {
		// read() 把空白压成一个空格，按行匹配要读原文。
		const creed = readFileSync(join(AGENT_DIR, "agents/designer.md"), "utf8").split("## Core principles: the eight prides and shames")[1] ?? "";
		const items = creed.match(/^\d\. Take pride in .+; be ashamed of .+\. \*.+\*$/gm) ?? [];
		expect(items).toHaveLength(8);
	});

	it("designer.md keeps its routing and its non-negotiable reminders", () => {
		expect(missing(read("agents/designer.md"), DESIGNER_RULES)).toEqual([]);
	});

	it("quality.md keeps the screenshot checklist and the tells section", () => {
		expect(missing(read("skills/vetta-ui-design/references/quality.md"), QUALITY_RULES)).toEqual([]);
	});
});
