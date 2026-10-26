/**
 * vetd_assets 的常用流程：搜索 → 看联系表挑图 → 按显示尺寸下载进 assets/ → 报告里列署名。
 * 联网换成按地址返回样本的假实现；拼图与裁切依赖真实 canvas，在这里换成固定结果
 * （真实浏览器里的表现另有探针验证）。
 */
import type { PluginAgentToolHandler, PluginAgentToolRegistration, PluginContext, PluginFsApi } from "@vetta-org/plugin-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/vetd/render-verification", async (importOriginal) => ({
	...(await importOriginal<typeof import("../src/vetd/render-verification")>()),
	composeVerificationSheet: vi.fn(async () => "data:image/jpeg;base64,U0hFRVQ="),
}));
vi.mock("../src/assets/raster", async (importOriginal) => ({
	...(await importOriginal<typeof import("../src/assets/raster")>()),
	coverImage: vi.fn(async (_: string, size: { width: number; height: number }) => ({
		base64: "RklUVEVE",
		width: size.width * 2,
		height: size.height * 2,
	})),
}));

import { registerAssetsTool } from "../src/assets/assets-tool";
import { setCanvasController } from "../src/canvas/design-runtime";

const DIR = "C:/work/films.vetd";
let files: Map<string, string>;
let requests: string[];
let handler: PluginAgentToolHandler<Record<string, unknown>>;

const image = (body = "SU1H") => ({ ok: true, status: 200, statusText: "OK", headers: { "content-type": "image/jpeg" }, body });
const json = (body: unknown) => ({ ok: true, status: 200, statusText: "OK", headers: { "content-type": "application/json" }, body });

function respond(url: string) {
	if (url.startsWith("https://api.openverse.org/v1/images/?")) {
		return json({
			results: [
				{
					id: "ov1",
					title: "Desert at night",
					creator: "Jane",
					license: "by",
					license_version: "2.0",
					url: "https://live.staticflickr.com/ov1.jpg",
					thumbnail: "https://api.openverse.org/v1/images/ov1/thumb/",
					foreign_landing_url: "https://flickr.com/ov1",
				},
			],
		});
	}
	if (url.startsWith("https://commons.wikimedia.org/")) return json({ query: { pages: {} } });
	if (url.startsWith("https://images-api.nasa.gov/")) return { ok: false, status: 503, statusText: "x", headers: {}, body: null };
	if (url.includes("example.com/page")) return { ok: true, status: 200, statusText: "OK", headers: { "content-type": "text/html" }, body: "PGh0bWw+" };
	return image();
}

const fs = {
	readFile: async (path: string) => {
		const content = files.get(path);
		if (content === undefined) throw new Error(`missing: ${path}`);
		return { content, encoding: "utf8" as const };
	},
	writeFile: async (path: string, content: string) => {
		files.set(path, content);
	},
	readDir: async (path: string) =>
		[...files.keys()]
			.filter((key) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes("/"))
			.map((key) => ({ name: key.slice(path.length + 1), path: key, isDirectory: false, size: 1, modifiedAt: 1 })),
	createDirectory: async () => {},
	delete: async () => {},
} as unknown as PluginFsApi;

const call = (input: Record<string, unknown>) =>
	handler({ host: { fs }, session: { cwd: "C:/work" }, trigger: { input } } as never) as Promise<Record<string, unknown>>;

beforeEach(() => {
	files = new Map();
	requests = [];
	setCanvasController({
		port: 1,
		captureFrame: async () => "",
		session: { vetdPath: DIR, dirPath: DIR, manifest: { version: 1, type: "vetta-design", canvas: { x: 0, y: 0, zoom: 1 }, frames: [] } } as never,
		notes: { notes: [] } as never,
		resolveNoteElements: async () => [],
		openDesign: async () => {},
	} as never);
	const ctx = {
		agent: {
			registerTool: (registration: PluginAgentToolRegistration) => {
				handler = registration.handler as typeof handler;
				return { dispose: () => {} };
			},
		},
		network: {
			request: async ({ url }: { url: string }) => {
				requests.push(url);
				return respond(url);
			},
		},
	} as unknown as PluginContext;
	registerAssetsTool(ctx, { scopeUse: ["project"] });
});

afterEach(() => setCanvasController(null));

describe("vetd_assets", () => {
	it("search → 联系表 → get 进 assets/ → credits", async () => {
		const found = await call({ action: "search", query: "desert night" });
		expect(found.ok).toBe(true);
		expect(found.path).toMatch(/\.snapshots\/assets-search-\d+\.png$/);
		const results = found.results as { n: number; ref: string; source: string }[];
		expect(results.map((r) => r.source)).toEqual(expect.arrayContaining(["photos", "openverse"]));
		// 一家挂了不影响其余，并如实报出来。
		expect(found.unavailable).toEqual(["nasa"]);

		const openverse = results.find((r) => r.source === "openverse")!;
		const got = await call({ action: "get", ref: openverse.ref, width: 390, height: 220, name: "hero desert" });
		expect(got).toMatchObject({
			ok: true,
			file: "assets/hero-desert.jpg",
			import: 'import heroDesert from "../assets/hero-desert.jpg";',
			size: "780x440",
			license: "CC BY 2.0",
		});
		expect(files.get(`${DIR}/assets/hero-desert.jpg`)).toBe("RklUVEVE");

		const photo = results.find((r) => r.source === "photos")!;
		await call({ action: "get", ref: photo.ref, width: 160, height: 240 });
		// Unsplash 图按要的尺寸直接从 picsum 出，不先下整张原图。
		expect(requests.at(-1)).toMatch(/^https:\/\/picsum\.photos\/id\/\d+\/320\/480$/);

		const credits = await call({ action: "credits" });
		expect(credits.credits).toHaveLength(2);
		expect(credits.unverified).toBeUndefined();
	});

	it("网页搜到的图也能下，许可记为待确认", async () => {
		const got = await call({
			action: "get",
			url: "https://images.example.org/poster.jpg",
			page: "https://example.org/gallery",
			width: 200,
			height: 300,
		});
		expect(got).toMatchObject({ ok: true, license: "unverified", note: expect.stringMatching(/license is unknown/) });
		const credits = await call({ action: "credits" });
		expect(credits.unverified).toEqual(["assets/poster.jpg"]);
	});

	it("拦住内网地址、不是图片的地址和缺尺寸的调用", async () => {
		expect(await call({ action: "get", url: "http://192.168.1.10/a.jpg", width: 100, height: 100 })).toMatchObject({
			ok: false,
			error: expect.stringMatching(/public/),
		});
		expect(await call({ action: "get", url: "https://example.com/page", width: 100, height: 100 })).toMatchObject({
			ok: false,
			error: expect.stringMatching(/not an image/),
		});
		expect(await call({ action: "get", url: "https://example.com/a.jpg" })).toMatchObject({
			ok: false,
			error: expect.stringMatching(/width/),
		});
		expect(files.size).toBe(0);
	});

	it("画布没开时提示先建或打开设计", async () => {
		setCanvasController(null);
		expect(await call({ action: "search", query: "x" })).toMatchObject({ ok: false, error: expect.stringMatching(/vetd_create/) });
	});
});
