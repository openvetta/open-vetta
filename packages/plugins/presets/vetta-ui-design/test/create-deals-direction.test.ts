/**
 * vetd_create 建落地页 / App 设计时直接发方向。
 *
 * 复现的问题（2026-10-26 实测，flash 级模型）：发方向是建完设计后的另一个工具，模型
 * 读 skill 时看不见它，建完就照着 vetd_create 的返回值开画，整份设计没有方向，机检也
 * 因此一条不报。现在落地页不带发牌参数就建不出来，建出来的设计已经带着候选；App 建出来
 * 就带着提案说明，设计里存下一份等提案的方向，没提案之前每帧都报。
 */
import type {
	PluginAgentToolHandler,
	PluginAgentToolRegistration,
	PluginContext,
	PluginFsApi,
} from "@vetta-org/plugin-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerDesignTools } from "../src/tools";

type CreateInput = Record<string, unknown>;
const CWD = "C:/work";

let createHandler: PluginAgentToolHandler<CreateInput>;
let files: Map<string, string>;
let directories: string[];

const fs = {
	stat: async (path: string) =>
		files.has(path) || directories.some((dir) => dir === path || dir.startsWith(`${path}/`)) ? { isDirectory: true } : null,
	createDirectory: async (path: string) => {
		directories.push(path);
	},
	writeFile: async (path: string, content: string) => {
		files.set(path, content);
	},
	readFile: async (path: string) => {
		const content = files.get(path);
		if (content === undefined) throw new Error(`missing: ${path}`);
		return { content, encoding: "utf8" as const };
	},
} as unknown as PluginFsApi;

const create = (input: CreateInput) =>
	createHandler({
		host: { fs },
		session: { cwd: CWD },
		trigger: { input },
		actions: { tools: { enable: vi.fn() } },
	} as never) as Promise<Record<string, unknown>>;

const savedDirection = (name: string) => JSON.parse(files.get(`${CWD}/${name}.vetd/direction.json`) ?? "null");

beforeEach(() => {
	files = new Map();
	directories = [];
	const ctx = {
		agent: {
			registerTool: (registration: PluginAgentToolRegistration) => {
				if (registration.name === "vetd_create") createHandler = registration.handler as PluginAgentToolHandler<CreateInput>;
				return { dispose: () => {} };
			},
		},
		ui: { setActivityTabVisible: vi.fn(), openActivityTab: vi.fn() },
		storage: { readFile: async () => null, writeFile: async () => ({ revision: "1", changedPaths: [] }) },
	} as unknown as PluginContext;
	registerDesignTools(ctx);
});

describe("vetd_create 发方向", () => {
	it("手机 App：不要种类，结果里带提案说明与原料，设计里存下等提案的方向", async () => {
		const result = await create({ name: "emby-mobile", product: "mobile", brief: "self-hosted media library" });
		expect(result.ok).toBe(true);
		const direction = result.direction as { mode: string; propose: string; ingredients: { palettes: string[] } };
		expect(direction.mode).toBe("app");
		expect(direction.propose).toMatch(/action "propose"/);
		expect(direction.propose).toMatch(/nearest competitor/);
		expect(direction.ingredients.palettes.length).toBeGreaterThan(0);
		expect(result.note).toMatch(/^FIRST propose three directions/);
		expect(savedDirection("emby-mobile")).toMatchObject({ mode: "app", choice: null, options: [], proposals: [] });
	});

	it("用户说清楚的基调存进设计", async () => {
		const result = await create({
			name: "emby-clear",
			product: "mobile",
			brief: "self-hosted media library",
			intent: { mood: "像 Apple TV", colour: "深色", emphasis: "海报大图为主" },
		});
		expect(result.ok).toBe(true);
		expect(savedDirection("emby-clear").intent).toMatchObject({
			stated: { mood: "像 Apple TV", colour: "深色", emphasis: "海报大图为主" },
			questions: [],
		});
	});

	it("建之前已经问过用户的题：随 intent.preferences 存进设计", async () => {
		const result = await create({
			name: "coffee-app",
			product: "mobile",
			brief: "coffee ordering app",
			intent: { preferences: [{ question: "这个咖啡 App 主要做什么？", answer: "顾客点单取餐" }] },
		});
		expect(result.ok).toBe(true);
		expect(savedDirection("coffee-app").intent).toMatchObject({
			stated: { preferences: [{ question: "这个咖啡 App 主要做什么？", answer: "顾客点单取餐" }] },
		});
	});

	it("落地页缺行业就整个失败，不先建出一份没有方向的设计", async () => {
		const result = await create({ name: "bakery", product: "landing", brief: "a bakery" });
		expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/sector/) });
		expect(directories).toEqual([]);
	});

	it("点名的品牌保留配色，只发其余；项目里有风格包时配色字体都保留", async () => {
		await create({ name: "brand", product: "desktop", brief: "x", keep: ["palette"] });
		expect(savedDirection("brand").input.keep).toEqual(["palette"]);

		directories.push(`${CWD}/design-resources/acme`);
		await create({ name: "packed", product: "landing", sector: "saas", brief: "x" });
		expect(savedDirection("packed").input.keep).toEqual(["palette", "type"]);
	});

	it("幻灯片、海报和自定义尺寸不发", async () => {
		const result = await create({ name: "deck", product: "slide" });
		expect(result.ok).toBe(true);
		expect(result.direction).toBeUndefined();
		expect(savedDirection("deck")).toBeNull();
	});
});
