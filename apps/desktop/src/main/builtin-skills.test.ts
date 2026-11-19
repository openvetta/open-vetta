import { beforeEach, describe, expect, it, vi } from "vitest";

const files = vi.hoisted(() => ({ manifest: "{}" }));
const catalog = vi.hoisted(() => ({ entries: {} as Record<string, string> }));

vi.mock("electron", () => ({
	app: { isPackaged: false, getAppPath: () => "/repo/apps/desktop" },
}));

// 复刻 i18next 行为：缺 key 时回吐的是去掉 ns 前缀的 key。
vi.mock("./i18n/index.js", () => ({
	mainT: (key: string) => catalog.entries[key] ?? key.replace(/^[^:]+:/, ""),
}));

vi.mock("node:fs", () => ({
	existsSync: () => true,
	readFileSync: () => files.manifest,
}));

import { builtinSkillText, readBuiltinSkillsManifest } from "./builtin-skills.js";

const MANIFEST = {
	"create-skill": {
		name: "create-skill",
		version: "1.0.0",
		source: "builtin",
		enabled: true,
		type: "skill",
	},
	"install-ability": {
		name: "install-ability",
		version: "1.0.0",
		source: "builtin",
		enabled: true,
		type: "skill",
	},
};

describe("readBuiltinSkillsManifest", () => {
	beforeEach(() => {
		files.manifest = JSON.stringify(MANIFEST);
	});

	it("返回清单里的全部内置技能", () => {
		expect(Object.keys(readBuiltinSkillsManifest())).toEqual(["create-skill", "install-ability"]);
	});
});

describe("builtinSkillText", () => {
	beforeEach(() => {
		catalog.entries = {};
	});

	it("命中 catalog 时返回译文", () => {
		catalog.entries["skills:builtin.install-ability.name"] = "安装能力";
		expect(builtinSkillText("install-ability", "name", "fallback")).toBe("安装能力");
	});

	it("缺译时回退清单文案，而不是把 key 当文案吐给 UI", () => {
		expect(builtinSkillText("install-ability", "name", "安装能力")).toBe("安装能力");
		expect(builtinSkillText("install-ability", "description")).toBeUndefined();
	});
});
