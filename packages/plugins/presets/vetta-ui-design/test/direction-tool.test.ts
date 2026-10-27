/**
 * vetd_direction 的常用流程：落地页发候选、App 收 agent 的提案 → 挑一个拿方向表 → 下一轮
 * show 拿回同一张表 → 带理由重发一格。走真实的库与真实的 direction.json 读写，只把文件系统和插件存储换成
 * 内存实现。
 */
import type {
	PluginAgentToolHandler,
	PluginAgentToolRegistration,
	PluginContext,
	PluginFsApi,
} from "@vetta-org/plugin-sdk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setCanvasController } from "../src/canvas/design-runtime";
import { registerDirectionTool } from "../src/direction/direction-tool";
import { loud, night, OBVIOUS, option } from "./proposal-fixture";

type Handler = PluginAgentToolHandler<Record<string, unknown>>;

const DIR = "C:/work/invoices.vetd";
let files: Map<string, string>;
let storage: Map<string, string>;
let handler: Handler;

const fs = {
	readFile: async (path: string) => {
		const content = files.get(path);
		if (content === undefined) throw new Error(`missing: ${path}`);
		return { content, encoding: "utf8" as const };
	},
	writeFile: async (path: string, content: string) => {
		files.set(path, content);
	},
	stat: async (path: string) =>
		files.has(path) || [...files.keys()].some((key) => key.startsWith(`${path}/`)) ? { isDirectory: false } : null,
} as unknown as PluginFsApi;

const openDesign = (width: number) =>
	setCanvasController({
		port: 1,
		captureFrame: async () => "",
		session: {
			vetdPath: DIR,
			dirPath: DIR,
			manifest: { version: 1, type: "vetta-design", canvas: { x: 0, y: 0, zoom: 1 }, frames: [], defaultFrameSize: { width, height: 900 } },
		} as never,
		notes: { notes: [] } as never,
		resolveNoteElements: async () => [],
		openDesign: async () => {},
	} as never);

const call = (input: Record<string, unknown>) =>
	handler({ host: { fs }, session: { cwd: "C:/work" }, trigger: { input } } as never) as Promise<Record<string, unknown>>;

beforeEach(() => {
	files = new Map();
	storage = new Map();
	const ctx = {
		agent: {
			registerTool: (registration: PluginAgentToolRegistration) => {
				handler = registration.handler as Handler;
				return { dispose: () => {} };
			},
		},
		storage: {
			readFile: async (path: string) => storage.get(path) ?? null,
			writeFile: async (path: string, data: string) => {
				storage.set(path, data);
				return { revision: "1", changedPaths: [path] };
			},
		},
	} as unknown as PluginContext;
	registerDirectionTool(ctx, { scopeUse: ["project", "conversation"] });
	openDesign(1440);
});

afterEach(() => setCanvasController(null));

describe("vetd_direction", () => {
	it("deal → choose → show → redraw，方向随设计保存，跨设计历史只记 id", async () => {
		const dealt = await call({ action: "deal", for: "page", sector: "saas", brief: "invoice tool for freelancers" });
		expect(dealt.ok).toBe(true);
		const options = dealt.options as { id: string; name: string; summary: string }[];
		expect(options).toHaveLength(3);
		expect(JSON.parse(files.get(`${DIR}/direction.json`)!)).toMatchObject({ mode: "page", choice: null });

		const chosen = await call({ action: "choose", id: options[0].id });
		expect(chosen.ok).toBe(true);
		const sheet = chosen.sheet as string;
		expect(sheet).toMatch(/^# Direction sheet — /);
		expect(sheet).toContain("vetd_install with packages");
		expect(chosen.install).toEqual(expect.arrayContaining([expect.stringMatching(/^@fontsource(-variable)?\//)]));
		const history = JSON.parse(storage.get("direction/history.json")!);
		expect(history).toEqual([expect.objectContaining({ mode: "page", direction: options[0].id })]);

		// 下一轮会话：不重新发牌，拿回同一张表。
		const shown = await call({ action: "show" });
		expect(shown.sheet).toBe(sheet);

		const refused = await call({ action: "redraw", slot: "palette" });
		expect(refused).toMatchObject({ ok: false, error: expect.stringMatching(/reason/) });
		const redrawn = await call({ action: "redraw", slot: "palette", reason: "the client's brand colour is green" });
		expect(redrawn.ok).toBe(true);
		const saved = JSON.parse(files.get(`${DIR}/direction.json`)!);
		expect(saved.redraws).toEqual([expect.objectContaining({ slot: "palette", reason: "the client's brand colour is green" })]);
	});

	it("App 屏幕：deal 给提案说明与原料 → propose → choose → show；手机画框给手机版式，历史记下可比的几项", async () => {
		openDesign(390);
		const brief = await call({ action: "deal", for: "app", brief: "coffee ordering app" });
		expect(brief).toMatchObject({ ok: true, mode: "app", propose: expect.stringMatching(/`obvious`/) });
		const ingredients = brief.ingredients as { palettes: string[]; type: string[] };
		expect(ingredients.palettes.length).toBeGreaterThan(0);
		expect(ingredients.type.length).toBeGreaterThan(0);

		const rejected = await call({ action: "propose", obvious: OBVIOUS, options: [option(), option({ id: "twin" }), loud()] });
		expect(rejected).toMatchObject({ ok: false, error: expect.stringMatching(/same direction twice/) });

		const proposed = await call({ action: "propose", obvious: OBVIOUS, options: [option(), night(), loud()] });
		expect(proposed).toMatchObject({ ok: true, mode: "app" });
		expect((proposed.ask as { id: string }[]).map((q) => q.id)).toEqual(["direction"]);
		expect(proposed.note).toMatch(/propose again/);

		const chosen = await call({ action: "choose", id: "night-counter" });
		expect(chosen.sheet).toMatch(/^# App sheet — Night counter/);
		expect(chosen.sheet).toContain("frame 390px wide");
		expect(chosen.sheet).toContain("### The phone");
		expect(chosen.install).toEqual(["@fontsource-variable/big-shoulders-display", "@fontsource-variable/public-sans"]);
		expect(JSON.parse(storage.get("direction/history.json")!)).toEqual([
			expect.objectContaining({ mode: "app", theme: "dark", hue: "orange", typeClass: "condensed-heavy" }),
		]);
		expect((await call({ action: "show" })).sheet).toBe(chosen.sheet);
		expect(await call({ action: "redraw", slot: "style", reason: "x" })).toMatchObject({
			ok: false,
			error: expect.stringMatching(/"propose"/),
		});
	});

	it("没说气质时提案带气质题；agent 自己问的题随 choose 记下；不带 intent 的重来沿用基调", async () => {
		await call({ action: "deal", for: "app", brief: "media library", intent: { colour: "深色" } });
		const shownBefore = await call({ action: "show" });
		expect(shownBefore).toMatchObject({ ok: true, chosen: false, propose: expect.any(String) });
		// 还没选就重来一遍：基调和偏好都在。
		await call({ action: "deal", for: "app", brief: "media library" });
		const proposed = await call({ action: "propose", obvious: OBVIOUS, options: [option(), night(), loud()] });
		const shown = await call({ action: "show" });
		expect((shown.ask as { id: string }[]).map((q) => q.id)).toEqual(["direction"]);
		expect((shown.options as { id: string }[]).map((o) => o.id)).toEqual((proposed.options as { id: string }[]).map((o) => o.id));
		const chosen = await call({
			action: "choose",
			id: "roast-ledger",
			preferences: [{ question: "屏幕以什么为先？", answer: "海报大图" }],
		});
		expect(chosen.ok).toBe(true);
		expect(chosen.sheet).toContain('- Asked "屏幕以什么为先？" — the user answered "海报大图". Binding.');
		const saved = JSON.parse(files.get(`${DIR}/direction.json`)!);
		expect(saved.intent.stated).toMatchObject({ colour: "深色", preferences: [{ question: "屏幕以什么为先？" }] });
	});

	it("没经过 vetd_create 的设计也能直接提案", async () => {
		const proposed = await call({ action: "propose", brief: "x", obvious: OBVIOUS, options: [option(), night(), loud()] });
		expect(proposed.ok).toBe(true);
		expect(JSON.parse(files.get(`${DIR}/direction.json`)!)).toMatchObject({ mode: "app", options: ["roast-ledger", "night-counter", "tamper-green"] });
	});

	it("跟随风格包或 DESIGN.md 的设计只发构图", async () => {
		files.set(`${DIR}/DESIGN.md`, "# Brand");
		const refused = await call({ action: "deal", for: "page", sector: "saas" });
		expect(refused).toMatchObject({ ok: false, error: expect.stringMatching(/keep: \["palette", "type"\]/) });
		const allowed = await call({ action: "deal", for: "page", sector: "saas", keep: ["palette", "type"] });
		expect(allowed.ok).toBe(true);
	});

	it("没发过牌就 show/choose，提示先 deal；画布没开就提示先建设计", async () => {
		expect(await call({ action: "show" })).toMatchObject({ ok: false, error: expect.stringMatching(/Deal first/) });
		expect(await call({ action: "deal", for: "page" })).toMatchObject({ ok: false, error: expect.stringMatching(/sector/) });
		setCanvasController(null);
		expect(await call({ action: "deal", for: "page", sector: "saas" })).toMatchObject({
			ok: false,
			error: expect.stringMatching(/vetd_create/),
		});
	});
});
