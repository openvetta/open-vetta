/**
 * vetd_create 的状态栏设置：手机界面默认灵动岛，用户另有要求就照用户的，存进设计；
 * 其他品类不带这个字段。
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

const manifestOf = (name: string) => JSON.parse(files.get(`${CWD}/${name}.vetd/design.json`) ?? "null");

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

describe("vetd_create 状态栏", () => {
	it("手机界面没提状态栏：默认灵动岛，写进设计，并告诉 agent 怎么写", async () => {
		const result = await create({ name: "shop", product: "mobile", brief: "grocery delivery" });
		expect(result.statusBar).toBe("island");
		expect(manifestOf("shop").statusBar).toBe("island");
		expect(result.note).toContain('<StatusBar variant="island"');
	});

	it("用户要刘海、或只要状态栏：照用户的", async () => {
		expect((await create({ name: "a", product: "mobile", brief: "x", statusBar: "notch" })).statusBar).toBe("notch");
		expect(manifestOf("a").statusBar).toBe("notch");
		expect((await create({ name: "b", product: "mobile", brief: "x", statusBar: "flat" })).statusBar).toBe("flat");
		expect(manifestOf("b").statusBar).toBe("flat");
	});

	it("用户不要状态栏：存下 none，并明确告诉 agent 别画", async () => {
		const result = await create({ name: "c", product: "mobile", brief: "x", statusBar: "none" });
		expect(manifestOf("c").statusBar).toBe("none");
		expect(result.note).toContain("NO status bar");
		expect(result.note).not.toContain("<StatusBar");
	});

	it("桌面等品类没有这个字段", async () => {
		const result = await create({ name: "dash", product: "desktop", brief: "x" });
		expect(result.statusBar).toBeUndefined();
		expect(manifestOf("dash").statusBar).toBeUndefined();
	});
});
