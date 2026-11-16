/**
 * 风格卡的封面图：清单里 `role: "cover"` 的那份二进制资源。
 *
 * 封面是上游从 demo.html 预渲染好的一张 webp。风格墙上每张卡用它当静态缩略图，代替
 * 「每张卡现场挂一个 iframe 去解析整份 demo」——后者在几十张连排时会把滚动拖垮。
 *
 * 取图走宿主的 `network.request`（返回 base64）而不是 `<img src=远端地址>`：插件的出站
 * 请求本来就统一过宿主，不依赖渲染进程对外部图片地址的放行策略。
 */
import { getPluginCtx } from "../plugin-context";
import type { DesignSystem } from "../design-systems/types";

/** 同时在途的封面请求数：滚进视口的一排卡一起要图，不该一口气发几十个请求。 */
const MAX_CONCURRENT = 3;
const TIMEOUT_MS = 15_000;

/** 清单里这套风格的封面地址；没有封面（或不是图片）返回 null，调用方退回色板。 */
export function styleCoverUrl(system: DesignSystem): string | null {
	const cover = system.resources.find((resource) => resource.role === "cover");
	return cover?.encoding === "binary" ? cover.url : null;
}

const loaded = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();
const waiting: Array<() => void> = [];
let active = 0;

/** 已经取到的封面（同步）。组件重挂载（滚出再滚回）时直接用，不闪、不重复请求。 */
export function cachedStyleCover(url: string): string | null {
	return loaded.get(url) ?? null;
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

/**
 * 取一张封面，返回 data URL；失败返回 null（不缓存失败，下次进视口会再试一次）。
 * 同一地址的并发调用共用一个请求。
 */
export function loadStyleCover(url: string): Promise<string | null> {
	const hit = loaded.get(url);
	if (hit) return Promise.resolve(hit);
	const pending = inflight.get(url);
	if (pending) return pending;
	const request = withSlot(async () => {
		try {
			const response = await getPluginCtx().network.request<string>({
				url,
				method: "GET",
				responseType: "base64",
				timeoutMs: TIMEOUT_MS,
			});
			if (!response.ok || typeof response.body !== "string" || response.body.length === 0) return null;
			const dataUrl = `data:image/webp;base64,${response.body}`;
			loaded.set(url, dataUrl);
			return dataUrl;
		} catch {
			return null;
		}
	}).finally(() => inflight.delete(url));
	inflight.set(url, request);
	return request;
}

/** 测试用：清掉进程内缓存。 */
export function resetStyleCoverCache(): void {
	loaded.clear();
	inflight.clear();
	waiting.length = 0;
	active = 0;
}
