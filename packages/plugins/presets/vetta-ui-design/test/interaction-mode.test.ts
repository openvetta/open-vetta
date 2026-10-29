/**
 * 交互模式的设备类别：创建时按 显式值 > 品类 > 尺寸 推断并存进设计；老文档运行时推断、不回写。
 */
import type {
	PluginAgentToolHandler,
	PluginAgentToolRegistration,
	PluginContext,
	PluginFsApi,
} from "@vetta-org/plugin-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerDesignTools } from "../src/tools";
import { effectiveInteractionMode, inferInteractionModeFromSize, resolveInteractionMode } from "../src/vetd/interaction-mode";

describe("inferInteractionModeFromSize", () => {
	it("认得出的预设按类别走，横屏也认", () => {
		expect(inferInteractionModeFromSize({ width: 393, height: 852 })).toBe("mobile");
		expect(inferInteractionModeFromSize({ width: 852, height: 393 })).toBe("mobile");
		expect(inferInteractionModeFromSize({ width: 1512, height: 982 })).toBe("desktop");
		expect(inferInteractionModeFromSize({ width: 794, height: 1123 })).toBe("other");
	});

	it("认不出的按宽度粗分", () => {
		expect(inferInteractionModeFromSize({ width: 360, height: 780 })).toBe("mobile");
		expect(inferInteractionModeFromSize({ width: 1300, height: 700 })).toBe("desktop");
		expect(inferInteractionModeFromSize({ width: 800, height: 800 })).toBe("other");
	});
});

describe("resolveInteractionMode", () => {
	const size = { width: 1920, height: 1080 };

	it("显式值最优先", () => {
		expect(resolveInteractionMode({ interaction: "mobile", product: "desktop", size })).toBe("mobile");
	});

	it("品类比尺寸可靠：1920x1080 的幻灯片不是桌面", () => {
		expect(resolveInteractionMode({ product: "slide", size })).toBe("other");
		expect(resolveInteractionMode({ product: "landing", size })).toBe("desktop");
		expect(resolveInteractionMode({ product: "mobile", size })).toBe("mobile");
	});

	it("没有品类（自定义尺寸）才看尺寸，乱填的显式值被忽略", () => {
		expect(resolveInteractionMode({ interaction: "tablet", size: { width: 402, height: 874 } })).toBe("mobile");
	});
});

describe("effectiveInteractionMode", () => {
	it("存了就用存的，不管尺寸", () => {
		expect(effectiveInteractionMode({ interactionMode: "other" }, { width: 390, height: 844 })).toBe("other");
	});

	it("老文档按首页画框推断，没有画框退到默认尺寸，再没有就桌面", () => {
		expect(effectiveInteractionMode({}, { width: 390, height: 844 })).toBe("mobile");
		expect(effectiveInteractionMode({ defaultFrameSize: { width: 1440, height: 900 } }, null)).toBe("desktop");
		expect(effectiveInteractionMode({}, null)).toBe("desktop");
	});
});

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

describe("vetd_create 设备类别", () => {
	it("品类决定设备类别并存进设计", async () => {
		expect((await create({ name: "m", product: "mobile", brief: "x" })).interactionMode).toBe("mobile");
		expect(manifestOf("m").interactionMode).toBe("mobile");
		await create({ name: "p", product: "poster" });
		expect(manifestOf("p").interactionMode).toBe("other");
	});

	it("自定义尺寸按尺寸推断；agent 显式给的覆盖推断", async () => {
		await create({ name: "a", frameSize: { width: 393, height: 852 } });
		expect(manifestOf("a").interactionMode).toBe("mobile");
		await create({ name: "b", frameSize: { width: 800, height: 800 }, interaction: "mobile" });
		expect(manifestOf("b").interactionMode).toBe("mobile");
	});
});
