/**
 * vetd_create 建落地页 / App 设计时直接发方向。
 *
 * 复现的问题（2026-10-26 实测，flash 级模型）：发方向是建完设计后的另一个工具，模型
 * 读 skill 时看不见它，建完就照着 vetd_create 的返回值开画，整份设计没有方向，机检也
 * 因此一条不报。现在落地页与 App 不带发牌参数就建不出来，建出来的设计已经带着候选。
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
	it("手机 App：结果里带三个候选，设计里存下待选的方向", async () => {
		const result = await create({ name: "emby-mobile", product: "mobile", kind: "community", brief: "self-hosted media library" });
		expect(result.ok).toBe(true);
		const direction = result.direction as { mode: string; options: { id: string }[]; next: string };
		expect(direction.mode).toBe("app");
		expect(direction.options.length).toBeGreaterThanOrEqual(2);
		// 没给任何基调：先问气质（挑候选）和侧重，再选。
		expect(direction.next).toMatch(/ask_user_question/);
		expect((result.direction as { ask: { id: string }[] }).ask.map((q) => q.id)).toEqual(["direction", "emphasis"]);
		expect(result.note).toMatch(/^FIRST ask the user `direction\.ask`/);
		expect(savedDirection("emby-mobile")).toMatchObject({
			mode: "app",
			choice: null,
			options: direction.options.map((option) => option.id),
		});
	});

	it("用户说清楚了基调：不带问题，直接选；用户的话存进设计", async () => {
		const result = await create({
			name: "emby-clear",
			product: "mobile",
			kind: "community",
			brief: "self-hosted media library",
			intent: { mood: "像 Apple TV", colour: "深色", emphasis: "海报大图为主" },
		});
		const direction = result.direction as { ask?: unknown; next: string };
		expect(direction.ask).toBeUndefined();
		expect(result.note).toMatch(/^FIRST choose one of `direction\.options`/);
		expect(savedDirection("emby-clear").intent).toMatchObject({
			stated: { mood: "像 Apple TV", colour: "深色", emphasis: "海报大图为主" },
			questions: [],
		});
	});

	it("落地页缺行业就整个失败，不先建出一份没有方向的设计", async () => {
		const result = await create({ name: "bakery", product: "landing", brief: "a bakery" });
		expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/sector/) });
		expect(directories).toEqual([]);
	});

	it("点名的品牌保留配色，只发其余；项目里有风格包时配色字体都保留", async () => {
		await create({ name: "brand", product: "desktop", kind: "analytics", brief: "x", keep: ["palette"] });
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
