/**
 * `vetd_assets`：给设计稿找真实图片、下载进 assets/。
 *
 * 没有图的设计稿，图片位只能拿渐变加图标冒充（实测 Emby 稿的海报全是这样），这是
 * 「一眼 AI」的最大来源之一。frame 不能加载远程图片（截图、导出会坏），所以图必须
 * 落进设计包；这个工具负责：多源搜索并拼成一张带编号的缩略图联系表（模型看一次图就
 * 能挑，不读一长串地址）、按显示尺寸裁切压缩、把来源与许可记进 CREDITS.json。
 *
 * 一个工具三个动作，理由同 vetd_direction：描述每轮都在系统提示里。
 */
import type { PluginContext, PluginFsApi } from "@vetta-org/plugin-sdk";
import { getCanvasController } from "../canvas/design-runtime";
import { pruneSnapshots, snapshotPath } from "../cards/snapshots";
import { composeVerificationSheet } from "../vetd/render-verification";
import {
	assetFileName,
	CREDITS_FILE,
	type CreditEntry,
	creditLine,
	importName,
	parseCredits,
	serializeCredits,
	upsertCredit,
} from "./credits";
import { coverImage } from "./raster";
import {
	type AssetCandidate,
	type AssetSource,
	flattenPhotoIndex,
	type IndexedPhoto,
	isPublicImageUrl,
	nasaSearchUrl,
	type Orientation,
	openverseSearchUrl,
	parseNasa,
	parseOpenverse,
	parseWikimedia,
	parseWikimediaScaled,
	picsumUrl,
	pickNasaFile,
	searchPhotoIndex,
	webCandidate,
	wikimediaScaledUrl,
	wikimediaSearchUrl,
} from "./sources";

export const ASSETS_TOOL_NAME = "vetd_assets";

const SEARCH_SOURCES = ["photos", "openverse", "wikimedia", "nasa"] as const;
type SearchSource = (typeof SEARCH_SOURCES)[number];
const MAX_RESULTS = 12;
/** Wikimedia 要求带可识别的 User-Agent，否则会限流或拒绝。 */
const HEADERS = { "User-Agent": "VettaDesign/1.0 (design mockups; https://github.com/openvetta/open-vetta)" };
const SEARCH_TIMEOUT_MS = 15_000;
const DOWNLOAD_TIMEOUT_MS = 60_000;
/** 联系表里每张缩略图的显示宽度。 */
const THUMB_WIDTH = 240;

interface AssetsInput {
	action?: unknown;
	query?: unknown;
	sources?: unknown;
	orientation?: unknown;
	limit?: unknown;
	ref?: unknown;
	url?: unknown;
	page?: unknown;
	width?: unknown;
	height?: unknown;
	name?: unknown;
}

let photoIndex: Promise<IndexedPhoto[]> | null = null;
const loadPhotoIndex = () =>
	(photoIndex ??= import("../../vendor/taste-skill/library/photos.json").then((module) =>
		flattenPhotoIndex(module.default),
	));

/** 最近一次搜索的结果，get 按 ref 取回原图与署名；换设计或重启后按 ref 重新解析。 */
const recent = new Map<string, AssetCandidate>();

class AssetsError extends Error {}

async function requestJson(ctx: PluginContext, url: string): Promise<unknown> {
	const response = await ctx.network.request<unknown>({
		url,
		method: "GET",
		headers: HEADERS,
		responseType: "json",
		timeoutMs: SEARCH_TIMEOUT_MS,
	});
	if (!response.ok) throw new AssetsError(`${new URL(url).hostname} answered ${response.status}`);
	return response.body;
}

async function requestImage(ctx: PluginContext, url: string, timeoutMs: number): Promise<{ base64: string; mime: string }> {
	const response = await ctx.network.request<string>({ url, method: "GET", headers: HEADERS, responseType: "base64", timeoutMs });
	const mime = (response.headers["content-type"] ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
	if (!response.ok || typeof response.body !== "string") {
		throw new AssetsError(`Download failed: ${new URL(url).hostname} answered ${response.status}.`);
	}
	if (!mime.startsWith("image/")) {
		throw new AssetsError(`${url} is not an image (${mime || "no content type"}). Pass the image file's own address, not the page it sits on.`);
	}
	return { base64: response.body, mime };
}

async function searchSource(ctx: PluginContext, source: SearchSource, query: string, orientation: Orientation | null, limit: number) {
	if (source === "photos") return searchPhotoIndex(await loadPhotoIndex(), query, { orientation, limit });
	if (source === "openverse") return parseOpenverse(await requestJson(ctx, openverseSearchUrl(query, orientation, limit)));
	if (source === "wikimedia") return parseWikimedia(await requestJson(ctx, wikimediaSearchUrl(query, limit + 4))).slice(0, limit);
	return parseNasa(await requestJson(ctx, nasaSearchUrl(query)), limit);
}

/** 各来源轮流取一张，凑满上限：不让某一家把结果占满。 */
export function interleave(lists: readonly AssetCandidate[][], limit: number): AssetCandidate[] {
	const out: AssetCandidate[] = [];
	for (let round = 0; out.length < limit; round++) {
		let added = false;
		for (const list of lists) {
			const candidate = list[round];
			if (candidate && out.length < limit) {
				out.push(candidate);
				added = true;
			}
		}
		if (!added) break;
	}
	return out;
}

/** 不在最近结果里的 ref（新会话、换了设计）按来源重新解析出原图与署名。 */
async function resolveRef(ctx: PluginContext, ref: string): Promise<AssetCandidate> {
	const cached = recent.get(ref);
	if (cached) return cached;
	const at = ref.indexOf(":");
	const source = ref.slice(0, at) as AssetSource;
	const id = ref.slice(at + 1);
	if (source === "photos") {
		const photo = (await loadPhotoIndex()).find((entry) => String(entry.id) === id);
		if (photo) return searchPhotoIndex([photo], photo.alt, { limit: 1 })[0] as AssetCandidate;
	} else if (source === "openverse") {
		const [found] = parseOpenverse({ results: [await requestJson(ctx, `https://api.openverse.org/v1/images/${encodeURIComponent(id)}/`)] });
		if (found) return found;
	} else if (source === "wikimedia") {
		const params = new URLSearchParams({ action: "query", format: "json", titles: id, prop: "imageinfo", iiprop: "url|size|extmetadata", origin: "*" });
		const [found] = parseWikimedia(await requestJson(ctx, `https://commons.wikimedia.org/w/api.php?${params}`));
		if (found) return found;
	} else if (source === "nasa") {
		const [found] = parseNasa(await requestJson(ctx, nasaSearchUrl(id)), 1);
		if (found) return found;
	} else if (source === "web" && isPublicImageUrl(id)) {
		return webCandidate(id);
	}
	throw new AssetsError(`Unknown or expired ref "${ref}". Search again, or pass the image's \`url\`.`);
}

/** 同一张图按要的尺寸取：picsum 直接按尺寸出图，Commons 要官方缩放图，NASA 先读文件清单。 */
async function downloadUrlFor(ctx: PluginContext, candidate: AssetCandidate, width: number, height: number): Promise<string> {
	if (candidate.source === "photos") return picsumUrl(Number(candidate.ref.slice("photos:".length)), width * 2, height * 2);
	if (candidate.source === "wikimedia") {
		const scaled = parseWikimediaScaled(await requestJson(ctx, wikimediaScaledUrl(candidate.ref.slice("wikimedia:".length), width * 2)));
		return scaled ?? candidate.url;
	}
	if (candidate.source === "nasa") {
		const file = pickNasaFile(await requestJson(ctx, candidate.url));
		if (!file) throw new AssetsError("NASA lists no image file for this item. Pick another result.");
		return file;
	}
	return candidate.url;
}

const positive = (value: unknown): number | null =>
	typeof value === "number" && Number.isFinite(value) && value >= 16 && value <= 4000 ? Math.round(value) : null;

async function readCredits(fs: PluginFsApi, dirPath: string): Promise<CreditEntry[]> {
	const found = await fs.readFile(`${dirPath}/${CREDITS_FILE}`).catch(() => null);
	return parseCredits(found?.content ?? null);
}

export function registerAssetsTool(ctx: PluginContext, options: { scopeUse: readonly ("project" | "conversation")[] }): void {
	ctx.agent.registerTool<AssetsInput>({
		id: "vetd-assets",
		name: ASSETS_TOOL_NAME,
		label: "%tool.vetd_assets%",
		description:
			"Find real pictures for the open design and download them into its assets/. `search` queries free, commercially usable libraries (Unsplash photos, Openverse, Wikimedia Commons, NASA) and returns one numbered contact sheet to Read once; `get` downloads a result by `ref` — or any image `url` you found with web search — cropped to the slot's display `width`×`height`, records its credit in assets/CREDITS.json and returns the import line; `credits` lists them for your report.\nDo NOT use for images in the user's own repository, or to fetch anything that is not an image.\nOnly for the .vetd design open on the canvas.",
		parameters: {
			type: "object",
			properties: {
				action: { type: "string", enum: ["search", "get", "credits"] },
				query: { type: "string", description: "search: what is in the picture, in English (\"night sky over desert\")." },
				sources: {
					type: "array",
					items: { type: "string", enum: [...SEARCH_SOURCES] },
					description: "search: limit to these libraries (default all). photos = curated Unsplash set; nasa = space.",
				},
				orientation: { type: "string", enum: ["landscape", "portrait", "square"] },
				limit: { type: "number", description: `search: results to return, at most ${MAX_RESULTS} (default).` },
				ref: { type: "string", description: "get: a result's ref from search." },
				url: { type: "string", description: "get: any direct image URL found elsewhere (license is recorded as unverified)." },
				page: { type: "string", description: "get with url: the page the image came from, for the credit." },
				width: { type: "number", description: "get: the slot's display width in px." },
				height: { type: "number", description: "get: the slot's display height in px." },
				name: { type: "string", description: "get: a short file name, e.g. `hero-desert`." },
			},
			required: ["action"],
			additionalProperties: false,
		},
		scope_use: options.scopeUse,
		timeoutMs: 120_000,
		handler: async ({ host, trigger }) => {
			const controller = getCanvasController();
			if (!controller) return { ok: false, error: "No design is open on the canvas. Create one with vetd_create, or open it first." };
			const { dirPath } = controller.session;
			const input = trigger.input;
			try {
				if (input.action === "search") {
					const query = typeof input.query === "string" ? input.query.trim() : "";
					if (!query) throw new AssetsError("Pass `query`: what is in the picture, in English.");
					const orientation =
						input.orientation === "landscape" || input.orientation === "portrait" || input.orientation === "square"
							? input.orientation
							: null;
					const wanted = Array.isArray(input.sources)
						? SEARCH_SOURCES.filter((source) => (input.sources as unknown[]).includes(source))
						: [...SEARCH_SOURCES];
					const sources = wanted.length > 0 ? wanted : [...SEARCH_SOURCES];
					const limit = Math.min(MAX_RESULTS, Math.max(1, typeof input.limit === "number" ? Math.round(input.limit) : MAX_RESULTS));
					const settled = await Promise.allSettled(sources.map((source) => searchSource(ctx, source, query, orientation, limit)));
					const unavailable = sources.filter((_, index) => settled[index]?.status === "rejected");
					const results = interleave(
						settled.map((entry) => (entry.status === "fulfilled" ? entry.value : [])),
						limit,
					);
					for (const candidate of results) recent.set(candidate.ref, candidate);
					if (results.length === 0) {
						return {
							ok: true,
							results: [],
							...(unavailable.length > 0 ? { unavailable } : {}),
							note: "Nothing found. Try plainer English words for what is in the picture (a place, a material, an object), or another source.",
						};
					}
					const thumbs = await Promise.all(
						results.map(async (candidate, index) => {
							try {
								const image = await requestImage(ctx, candidate.thumb, SEARCH_TIMEOUT_MS);
								const ratio = candidate.width && candidate.height ? candidate.width / candidate.height : 1.5;
								return {
									id: `${index + 1} · ${candidate.source}`,
									width: THUMB_WIDTH,
									height: Math.round(THUMB_WIDTH / Math.min(3, Math.max(0.5, ratio))),
									dataUrl: `data:${image.mime};base64,${image.base64}`,
								};
							} catch {
								return null;
							}
						}),
					);
					const sheet = await composeVerificationSheet(thumbs.filter((thumb) => thumb !== null));
					let path: string | null = null;
					if (sheet) {
						path = snapshotPath(dirPath, "assets-search", Date.now());
						await host.fs.writeFile(path, sheet.split(",")[1] ?? "", "base64");
						await pruneSnapshots(host.fs, dirPath, "assets-search");
					}
					return {
						ok: true,
						...(path ? { path } : {}),
						results: results.map((candidate, index) => ({
							n: index + 1,
							ref: candidate.ref,
							title: candidate.title.slice(0, 80),
							source: candidate.source,
							license: candidate.license,
							...(candidate.width && candidate.height ? { size: `${candidate.width}x${candidate.height}` } : {}),
						})),
						...(unavailable.length > 0 ? { unavailable } : {}),
						note: path
							? "Read the contact sheet once and pick by what you see. Then `get` each pick by its ref with the slot's display width and height. Pictures in one design share one light and one treatment."
							: "The contact sheet could not be composed here; pick by title, then `get` by ref.",
					};
				}

				if (input.action === "get") {
					const width = positive(input.width);
					const height = positive(input.height);
					if (!width || !height) throw new AssetsError("Pass `width` and `height`: the slot's display size in px, 16-4000.");
					let candidate: AssetCandidate;
					if (typeof input.ref === "string" && input.ref) candidate = await resolveRef(ctx, input.ref);
					else if (typeof input.url === "string" && input.url) {
						if (!isPublicImageUrl(input.url)) throw new AssetsError("Only public http(s) image addresses can be downloaded.");
						candidate = webCandidate(input.url, typeof input.page === "string" ? input.page : undefined);
					} else throw new AssetsError("Pass `ref` from a search, or an image `url`.");

					const image = await requestImage(ctx, await downloadUrlFor(ctx, candidate, width, height), DOWNLOAD_TIMEOUT_MS);
					const fitted = await coverImage(`data:${image.mime};base64,${image.base64}`, { width, height });
					const extension = fitted ? "jpg" : (image.mime.split("/")[1] ?? "jpg").replace("jpeg", "jpg").replace(/\+.*$/, "");
					const credits = await readCredits(host.fs, dirPath);
					const existing = await host.fs
						.readDir(`${dirPath}/assets`)
						.then((entries) => new Set(entries.map((entry) => entry.name)))
						.catch(() => new Set<string>());
					const file = assetFileName(typeof input.name === "string" && input.name ? input.name : candidate.title, existing, extension);
					await host.fs.createDirectory(`${dirPath}/assets`).catch(() => {});
					await host.fs.writeFile(`${dirPath}/assets/${file}`, fitted?.base64 ?? image.base64, "base64");
					const entry: CreditEntry = {
						file: `assets/${file}`,
						title: candidate.title,
						author: candidate.author,
						source: candidate.source,
						license: candidate.license,
						page: candidate.page,
						url: candidate.url,
						verified: candidate.verified,
						at: new Date().toISOString(),
					};
					await host.fs.writeFile(`${dirPath}/${CREDITS_FILE}`, serializeCredits(upsertCredit(credits, entry)));
					return {
						ok: true,
						file: entry.file,
						import: `import ${importName(file)} from "../assets/${file}";`,
						...(fitted ? { size: `${fitted.width}x${fitted.height}` } : {}),
						license: entry.license,
						note: entry.verified
							? "Use it with object-cover at the size you asked for. The credit is recorded; list credits in your report."
							: "Downloaded, but its license is unknown: name it in your report as one the user must clear before shipping.",
					};
				}

				if (input.action === "credits") {
					const credits = await readCredits(host.fs, dirPath);
					return {
						ok: true,
						credits: credits.map(creditLine),
						...(credits.some((entry) => !entry.verified)
							? { unverified: credits.filter((entry) => !entry.verified).map((entry) => entry.file) }
							: {}),
					};
				}

				throw new AssetsError('Pass `action`: "search", "get" or "credits".');
			} catch (error) {
				if (error instanceof AssetsError) return { ok: false, error: error.message };
				return { ok: false, retryable: true, error: error instanceof Error ? error.message : String(error) };
			}
		},
	});
}
