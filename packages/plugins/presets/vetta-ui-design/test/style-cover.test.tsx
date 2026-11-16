import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@vetta-org/plugin-sdk", () => ({
	useTranslation: () => ({ t: (key: string) => key, locale: "zh" }),
}));

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { DesignResource, DesignSystem } from "../src/design-systems/types";
import { StyleCover } from "../src/gallery/StyleCover";
import { cachedStyleCover, loadStyleCover, resetStyleCoverCache, styleCoverUrl } from "../src/gallery/style-cover";
import { setPluginCtx } from "../src/plugin-context";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** 立刻上报「可见」的桩：封面只在进视口后才取。 */
class ImmediateIntersectionObserver {
	constructor(private readonly callback: (entries: { isIntersecting: boolean }[]) => void) {}
	observe(): void {
		this.callback([{ isIntersecting: true }]);
	}
	disconnect(): void {}
	unobserve(): void {}
}
vi.stubGlobal("IntersectionObserver", ImmediateIntersectionObserver);

const COVER_URL = "https://cdn.example.com/templates/linear/cover.webp";
const cover: DesignResource = { path: "cover.webp", role: "cover", encoding: "binary", url: COVER_URL, bytes: 100 };

function system(resources: DesignResource[] = [cover]): DesignSystem {
	return {
		id: "linear",
		name: "Linear",
		category: "dev",
		vibe: "dark",
		blurb: "blurb",
		resources,
		themeCss: "@theme { --color-primary: #000; }",
		designMd: "# Linear",
	};
}

const request = vi.fn();

beforeEach(() => {
	resetStyleCoverCache();
	request.mockReset();
	setPluginCtx({ network: { request } } as never);
});

describe("styleCoverUrl", () => {
	it("取 cover 角色的二进制资源地址", () => {
		expect(styleCoverUrl(system())).toBe(COVER_URL);
	});

	it("没有封面、或封面不是二进制时返回 null", () => {
		expect(styleCoverUrl(system([]))).toBeNull();
		expect(
			styleCoverUrl(system([{ path: "cover.webp", role: "cover", encoding: "text", content: "x", bytes: 1 }])),
		).toBeNull();
		expect(styleCoverUrl(system([{ ...cover, role: "preview" }]))).toBeNull();
	});
});

describe("loadStyleCover", () => {
	it("经宿主 network 取 base64，缓存成 data URL", async () => {
		request.mockResolvedValue({ ok: true, body: "AAAA" });
		await expect(loadStyleCover(COVER_URL)).resolves.toBe("data:image/webp;base64,AAAA");
		expect(cachedStyleCover(COVER_URL)).toBe("data:image/webp;base64,AAAA");
		expect(request).toHaveBeenCalledWith(expect.objectContaining({ url: COVER_URL, responseType: "base64" }));
	});

	it("同一地址并发只发一个请求，取到后不再请求", async () => {
		request.mockResolvedValue({ ok: true, body: "AAAA" });
		await Promise.all([loadStyleCover(COVER_URL), loadStyleCover(COVER_URL)]);
		await loadStyleCover(COVER_URL);
		expect(request).toHaveBeenCalledTimes(1);
	});

	it("失败返回 null 且不缓存，下次还能重试", async () => {
		request.mockResolvedValueOnce({ ok: false, body: "" });
		await expect(loadStyleCover(COVER_URL)).resolves.toBeNull();
		request.mockRejectedValueOnce(new Error("offline"));
		await expect(loadStyleCover(COVER_URL)).resolves.toBeNull();
		expect(cachedStyleCover(COVER_URL)).toBeNull();
		request.mockResolvedValueOnce({ ok: true, body: "BBBB" });
		await expect(loadStyleCover(COVER_URL)).resolves.toBe("data:image/webp;base64,BBBB");
	});

	it("同时在途的请求有上限，一排卡进视口不会一口气发几十个", async () => {
		const resolvers: Array<(value: unknown) => void> = [];
		request.mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)));
		const all = Array.from({ length: 8 }, (_, index) => loadStyleCover(`${COVER_URL}?${index}`));
		await Promise.resolve();
		expect(request).toHaveBeenCalledTimes(3);
		resolvers[0]?.({ ok: true, body: "A" });
		await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(4));
		// 余下的依次放行：每放行一个，队列里的下一个才会发出。
		for (let index = 1; index < 8; index++) {
			await vi.waitFor(() => expect(resolvers[index]).toBeDefined());
			resolvers[index]?.({ ok: true, body: "A" });
		}
		await Promise.all(all);
		expect(request).toHaveBeenCalledTimes(8);
	});
});

describe("StyleCover", () => {
	let host: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		host = document.createElement("div");
		document.body.appendChild(host);
		root = createRoot(host);
	});

	afterEach(() => {
		act(() => root.unmount());
		host.remove();
	});

	const img = (): HTMLImageElement | null => host.querySelector("img");

	it("有封面：取到后在色板之上铺一张图", async () => {
		request.mockResolvedValue({ ok: true, body: "AAAA" });
		await act(async () => root.render(<StyleCover system={system()} />));
		expect(img()?.getAttribute("src")).toBe("data:image/webp;base64,AAAA");
		// 色板兜底层一直在：图没解码完之前露的是色板，不是空白。
		expect(host.querySelector("[style*='background']")).not.toBeNull();
	});

	it("没有封面：只有色板，不发任何请求", async () => {
		await act(async () => root.render(<StyleCover system={system([])} />));
		expect(img()).toBeNull();
		expect(request).not.toHaveBeenCalled();
	});

	it("取失败：停在色板上，不渲染裂图", async () => {
		request.mockRejectedValue(new Error("offline"));
		await act(async () => root.render(<StyleCover system={system()} />));
		expect(img()).toBeNull();
	});

	it("没进视口不取图", async () => {
		class NeverVisible {
			observe(): void {}
			disconnect(): void {}
			unobserve(): void {}
		}
		vi.stubGlobal("IntersectionObserver", NeverVisible);
		try {
			await act(async () => root.render(<StyleCover system={system()} />));
			expect(request).not.toHaveBeenCalled();
		} finally {
			vi.stubGlobal("IntersectionObserver", ImmediateIntersectionObserver);
		}
	});

	it("再次挂载直接用缓存，不重复请求", async () => {
		request.mockResolvedValue({ ok: true, body: "AAAA" });
		await act(async () => root.render(<StyleCover system={system()} />));
		act(() => root.render(<div />));
		await act(async () => root.render(<StyleCover system={system()} />));
		expect(img()?.getAttribute("src")).toBe("data:image/webp;base64,AAAA");
		expect(request).toHaveBeenCalledTimes(1);
	});
});
