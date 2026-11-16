/**
 * 风格卡的封面图：清单里 `role: "cover"` 的那份二进制资源。
 *
 * 封面是上游从 demo.html 预渲染好的一张 webp。风格墙上每张卡用它当静态缩略图，代替
 * 「每张卡现场挂一个 iframe 去解析整份 demo」——后者在几十张连排时会把滚动拖垮。
 *
 * 取图走宿主的 `network.request`（返回 base64）而不是 `<img src=远端地址>`：插件的出站
 * 请求本来就统一过宿主，不依赖渲染进程对外部图片地址的放行策略。
 *
 * 取到的封面落进插件私有 storage：一张封面 ~30KB，但每次请求要等近一秒的首字节，几十张
 * 排队就是「过了很久才出现」。落盘后第二次打开直接读本地，不再联网。键里带资源体积，
 * 上游重生成封面（体积必变）时旧缓存自然失效。
 */
import { getPluginCtx } from "../plugin-context";
import type { DesignSystem } from "../design-systems/types";

/**
 * 同时在途的封面请求数：滚进视口的一排卡一起要图，不该一口气发几十个请求。
 * 耗时几乎全是等首字节（文件才 ~30KB），并发开到 6 能把首屏等待压下来而不增加带宽压力。
 */
const MAX_CONCURRENT = 6;
const TIMEOUT_MS = 15_000;

export interface StyleCoverRef {
	url: string;
	/** 清单里记的体积。 */
	bytes: number;
	/**
	 * 条目版本。上游规定「封面或 demo 重生成就 bump version」，所以它是最可靠的失效信号；
	 * 体积只是兜底（版本忘了 bump 时，封面重生成体积几乎必变）。两者都进缓存键。
	 */
	version: string;
}

/** 清单里这套风格的封面；没有封面（或不是图片）返回 null，调用方退回色板。 */
export function styleCoverRef(system: DesignSystem): StyleCoverRef | null {
	const cover = system.resources.find((resource) => resource.role === "cover");
	return cover?.encoding === "binary"
		? { url: cover.url, bytes: cover.bytes, version: system.version ?? "" }
		: null;
}

/** 这张封面在落盘目录里的文件名前缀（不含版本与体积）：同一张封面的各代缓存共用它。 */
function coverStem(ref: StyleCoverRef): string {
	return new URL(ref.url).pathname.replace(/^\/+/, "").replace(/[^A-Za-z0-9._-]+/g, "-");
}

/**
 * 缓存键，同时是落盘路径：地址 + 版本 + 体积，不含任何需要转义的字符。内存缓存也用它做键——
 * 只按地址缓存的话，同一会话里清单更新后封面换了，界面还会一直显示旧图。
 */
export function coverStoragePath(ref: StyleCoverRef): string {
	const version = ref.version.replace(/[^A-Za-z0-9._-]+/g, "-");
	return `design-covers/${coverStem(ref)}.${version || "0"}.${ref.bytes}.b64`;
}

const loaded = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();
const waiting: Array<() => void> = [];
let active = 0;

/** 已经取到的封面（同步）。组件重挂载（滚出再滚回）时直接用，不闪、不重复请求。 */
export function cachedStyleCover(ref: StyleCoverRef): string | null {
	return loaded.get(coverStoragePath(ref)) ?? null;
}

async function withSlot<T>(task: () => Promise<T>): Promise<T> {
	if (active >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiting.push(resolve));
	active += 1;
	try {
		return await task();
	} finally {
		active -= 1;
		waiting.shift()?.();
	}
}

async function readStored(ref: StyleCoverRef): Promise<string | null> {
	try {
		const stored = await getPluginCtx().storage.readFile(coverStoragePath(ref), "base64");
		return stored && stored.length > 0 ? stored : null;
	} catch {
		return null;
	}
}

async function fetchRemote(ref: StyleCoverRef): Promise<string | null> {
	try {
		const response = await getPluginCtx().network.request<string>({
			url: ref.url,
			method: "GET",
			responseType: "base64",
			timeoutMs: TIMEOUT_MS,
		});
		if (!response.ok || typeof response.body !== "string" || response.body.length === 0) return null;
		return response.body;
	} catch {
		return null;
	}
}

/** 写盘，并顺手清掉同一张封面的旧版本——上游每重生成一次就会多出一份，不清会越攒越多。 */
async function persist(ref: StyleCoverRef, base64: string): Promise<void> {
	try {
		const storage = getPluginCtx().storage;
		const path = coverStoragePath(ref);
		await storage.writeFile(path, base64, "base64");
		const prefix = `design-covers/${coverStem(ref)}.`;
		const stale = (await storage.list("design-covers/")).filter((name) => name.startsWith(prefix) && name !== path);
		if (stale.length > 0) await storage.commit(stale.map((name) => ({ type: "remove" as const, path: name })));
	} catch {
		// 清理是尽力而为，不影响显示。
	}
}

/**
 * 取一张封面，返回 data URL；失败返回 null（不缓存失败，下次进视口会再试一次）。
 * 先读本地落盘；没有才占一个网络名额去取，取到后写回。同一地址的并发调用共用一个请求。
 */
export function loadStyleCover(ref: StyleCoverRef): Promise<string | null> {
	const key = coverStoragePath(ref);
	const hit = loaded.get(key);
	if (hit) return Promise.resolve(hit);
	const pending = inflight.get(key);
	if (pending) return pending;
	const request = (async () => {
		let base64 = await readStored(ref);
		if (!base64) {
			base64 = await withSlot(() => fetchRemote(ref));
			if (!base64) return null;
			// 写盘失败不影响这次显示，只是下次还得联网。
			void persist(ref, base64);
		}
		const dataUrl = `data:image/webp;base64,${base64}`;
		loaded.set(key, dataUrl);
		return dataUrl;
	})().finally(() => inflight.delete(key));
	inflight.set(key, request);
	return request;
}

/** 测试用：清掉进程内缓存。 */
export function resetStyleCoverCache(): void {
	loaded.clear();
	inflight.clear();
	waiting.length = 0;
	active = 0;
}
