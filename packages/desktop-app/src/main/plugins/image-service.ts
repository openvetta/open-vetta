import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type {
	PluginEditImageInput,
	PluginGenerateImageInput,
	PluginImageResult,
} from "../../preload/api-types/plugins.js";
import { getPluginSettings } from "./plugin-store.js";

/**
 * Main-process image service (single source of truth for `/v1/images`).
 * Both entry points route here: the agent's built-in image tool (host-injected)
 * and the plugin panel via IPC. Bytes are stored out-of-band under ~/.vetta and
 * served through the vetta-media:// protocol; results carry only references.
 */

type ImageResult = PluginImageResult;
type GenerateImageInput = PluginGenerateImageInput;
type EditImageInput = PluginEditImageInput;

/**
 * The plugin id whose settings (endpoint/model/apiKey) drive the agent's
 * built-in generate_image tool. Must match the image-gen plugin's plugin.json
 * id. The tool's host backend is bound to this id in main/runtime.ts.
 */
export const IMAGE_GEN_PLUGIN_ID = "image-gen";

interface ImageRecord {
	rootId: string;
	parent?: string;
	sessionId?: string;
	createdAt: string;
	ext: string;
	mimeType: string;
}

type ImageIndex = Record<string, ImageRecord>;

const baseDirRoot = join(homedir(), ".vetta", "plugin-images");

function pluginDir(pluginId: string): string {
	return join(baseDirRoot, pluginId);
}

function imagesDir(pluginId: string): string {
	return join(pluginDir(pluginId), "images");
}

function indexPath(pluginId: string): string {
	return join(pluginDir(pluginId), "index.json");
}

function readIndex(pluginId: string): ImageIndex {
	const path = indexPath(pluginId);
	if (!existsSync(path)) return {};
	try {
		const parsed = JSON.parse(readFileSync(path, "utf-8")) as ImageIndex;
		return parsed && typeof parsed === "object" ? parsed : {};
	} catch {
		return {};
	}
}

function writeIndex(pluginId: string, index: ImageIndex): void {
	const path = indexPath(pluginId);
	if (!existsSync(dirname(path))) mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify(index, null, 2), "utf-8");
}

function toMediaUrl(absPath: string): string {
	return `vetta-media://local/stream?path=${encodeURIComponent(absPath)}`;
}

function imagePath(pluginId: string, id: string, ext: string): string {
	return join(imagesDir(pluginId), `${id}.${ext}`);
}

function toResult(pluginId: string, id: string, record: ImageRecord): ImageResult {
	return { id, url: toMediaUrl(imagePath(pluginId, id, record.ext)), mimeType: record.mimeType };
}

type ImageProvider = "openai" | "agnes-ai";

interface ImageConfig {
	provider: ImageProvider;
	baseUrl: string;
	apiKey: string;
	model: string;
	size: string;
}

const PROVIDER_DEFAULTS: Record<ImageProvider, { baseUrl: string; model: string }> = {
	openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-image-1" },
	"agnes-ai": { baseUrl: "https://apihub.agnes-ai.com/v1", model: "agnes-image-2.1-flash" },
};

function resolveConfig(pluginId: string): ImageConfig {
	const settings = getPluginSettings(pluginId);
	const provider: ImageProvider = settings.provider === "agnes-ai" ? "agnes-ai" : "openai";
	const defaults = PROVIDER_DEFAULTS[provider];
	const baseUrl = (
		typeof settings.baseUrl === "string" && settings.baseUrl.trim() ? settings.baseUrl.trim() : defaults.baseUrl
	).replace(/\/+$/, "");
	const apiKey = typeof settings.apiKey === "string" ? settings.apiKey.trim() : "";
	const model = typeof settings.model === "string" && settings.model.trim() ? settings.model.trim() : defaults.model;
	const size = typeof settings.size === "string" && settings.size.trim() ? settings.size.trim() : "1024x1024";
	if (!apiKey) throw new Error("图像服务未配置 apiKey（请在插件设置中填写）");
	return { provider, baseUrl, apiKey, model, size };
}

function extFromMime(mimeType: string): string {
	if (mimeType.includes("jpeg")) return "jpg";
	if (mimeType.includes("webp")) return "webp";
	if (mimeType.includes("gif")) return "gif";
	return "png";
}

/** Pull image bytes out of an OpenAI images response item (b64 or url). */
async function extractBytes(
	item: { b64_json?: string; url?: string },
	config: ImageConfig,
): Promise<{ data: Buffer; mimeType: string }> {
	if (item.b64_json) {
		return { data: Buffer.from(item.b64_json, "base64"), mimeType: "image/png" };
	}
	if (item.url) {
		// Some providers return a relative URL (e.g. "/v1/images/<id>/content")
		// that must be resolved against the configured base URL; relative ones
		// hit the same authenticated API, so forward the bearer token.
		const isAbsolute = /^https?:\/\//i.test(item.url);
		const url = isAbsolute ? item.url : new URL(item.url, `${config.baseUrl}/`).toString();
		const headers = isAbsolute ? undefined : { Authorization: `Bearer ${config.apiKey}` };
		const response = await fetch(url, { headers });
		if (!response.ok) throw new Error(`下载生成图片失败: HTTP ${response.status}`);
		const mimeType = response.headers.get("content-type") ?? "image/png";
		return { data: Buffer.from(await response.arrayBuffer()), mimeType };
	}
	throw new Error("图像响应缺少 b64_json / url");
}

async function persist(
	pluginId: string,
	bytes: { data: Buffer; mimeType: string },
	meta: { rootId?: string; parent?: string; sessionId?: string },
): Promise<ImageResult> {
	const id = randomUUID();
	const ext = extFromMime(bytes.mimeType);
	const path = imagePath(pluginId, id, ext);
	if (!existsSync(dirname(path))) mkdirSync(dirname(path), { recursive: true });
	await writeFile(path, bytes.data);
	const record: ImageRecord = {
		rootId: meta.rootId ?? id,
		parent: meta.parent,
		sessionId: meta.sessionId,
		createdAt: new Date().toISOString(),
		ext,
		mimeType: bytes.mimeType,
	};
	const index = readIndex(pluginId);
	index[id] = record;
	writeIndex(pluginId, index);
	return toResult(pluginId, id, record);
}

type ImageItem = { b64_json?: string; url?: string };

/** POST an images request and return the first response item (throws on non-ok). */
async function requestImage(config: ImageConfig, path: string, init: RequestInit): Promise<ImageItem> {
	const response = await fetch(`${config.baseUrl}/${path}`, init);
	if (!response.ok) {
		throw new Error(`HTTP ${response.status} ${await response.text().catch(() => "")}`.trim());
	}
	const json = (await response.json()) as { data?: ImageItem[] };
	const item = json.data?.[0];
	if (!item) throw new Error("响应缺少 data[0]");
	return item;
}

function jsonInit(config: ImageConfig, body: Record<string, unknown>): RequestInit {
	return {
		method: "POST",
		headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
		body: JSON.stringify(body),
	};
}

/** Text-to-image. */
function requestGeneration(config: ImageConfig, prompt: string): Promise<ImageItem> {
	if (config.provider === "agnes-ai") {
		// Agnes: same /images/generations endpoint; top-level return_base64 for b64 output.
		return requestImage(
			config,
			"images/generations",
			jsonInit(config, { model: config.model, prompt, size: config.size, return_base64: true }),
		);
	}
	return requestImage(
		config,
		"images/generations",
		jsonInit(config, { model: config.model, prompt, n: 1, size: config.size }),
	);
}

/** Image-to-image. */
function requestEdit(config: ImageConfig, prompt: string, src: { data: Buffer; mimeType: string }): Promise<ImageItem> {
	if (config.provider === "agnes-ai") {
		// Agnes img2img: same endpoint; source image as Data URI inside extra_body.image,
		// b64 output via extra_body.response_format (NOT at top level).
		const dataUri = `data:${src.mimeType};base64,${src.data.toString("base64")}`;
		return requestImage(
			config,
			"images/generations",
			jsonInit(config, {
				model: config.model,
				prompt,
				size: config.size,
				extra_body: { image: [dataUri], response_format: "b64_json" },
			}),
		);
	}
	// OpenAI standard multipart edits.
	const form = new FormData();
	form.set("model", config.model);
	form.set("prompt", prompt);
	form.set("n", "1");
	form.set("size", config.size);
	form.set(
		"image",
		new Blob([new Uint8Array(src.data)], { type: src.mimeType }),
		`source.${extFromMime(src.mimeType)}`,
	);
	return requestImage(config, "images/edits", {
		method: "POST",
		headers: { Authorization: `Bearer ${config.apiKey}` },
		body: form,
	});
}

export async function generateImage(pluginId: string, input: GenerateImageInput): Promise<ImageResult[]> {
	const config = resolveConfig(pluginId);
	let item: ImageItem;
	try {
		item = await requestGeneration(config, input.prompt);
	} catch (err) {
		throw new Error(`图像生成失败: ${err instanceof Error ? err.message : String(err)}`);
	}
	const bytes = await extractBytes(item, config);
	return [await persist(pluginId, bytes, { sessionId: input.sessionId })];
}

async function resolveSourceBytes(
	pluginId: string,
	source: EditImageInput["source"],
): Promise<{ data: Buffer; mimeType: string; rootId?: string; parent?: string }> {
	if ("imageId" in source) {
		const record = readIndex(pluginId)[source.imageId];
		if (!record) throw new Error(`未找到源图像: ${source.imageId}`);
		const data = await readFile(imagePath(pluginId, source.imageId, record.ext));
		return { data, mimeType: record.mimeType, rootId: record.rootId, parent: source.imageId };
	}
	return { data: Buffer.from(source.data, "base64"), mimeType: source.mimeType };
}

export async function editImage(pluginId: string, input: EditImageInput): Promise<ImageResult[]> {
	const config = resolveConfig(pluginId);
	const src = await resolveSourceBytes(pluginId, input.source);
	let item: ImageItem;
	try {
		item = await requestEdit(config, input.prompt, src);
	} catch (err) {
		throw new Error(`图像编辑失败: ${err instanceof Error ? err.message : String(err)}`);
	}
	const bytes = await extractBytes(item, config);
	return [await persist(pluginId, bytes, { rootId: src.rootId, parent: src.parent, sessionId: input.sessionId })];
}

/** All images in the same edit lineage as `imageId`, oldest first. */
export async function imageLineage(pluginId: string, imageId: string): Promise<ImageResult[]> {
	const index = readIndex(pluginId);
	const record = index[imageId];
	if (!record) return [];
	return Object.entries(index)
		.filter(([, value]) => value.rootId === record.rootId)
		.sort(([, a], [, b]) => a.createdAt.localeCompare(b.createdAt))
		.map(([id, value]) => toResult(pluginId, id, value));
}
