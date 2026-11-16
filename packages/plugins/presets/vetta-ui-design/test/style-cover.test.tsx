import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@vetta-org/plugin-sdk", () => ({
	useTranslation: () => ({ t: (key: string) => key, locale: "zh" }),
}));

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { DesignResource, DesignSystem } from "../src/design-systems/types";
import { StyleCover } from "../src/gallery/StyleCover";
import {
	cachedStyleCover,
	coverStoragePath,
	loadStyleCover,
	resetStyleCoverCache,
	styleCoverRef,
} from "../src/gallery/style-cover";
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
		version: "1.0.0",
		resources,
		themeCss: "@theme { --color-primary: #000; }",
		designMd: "# Linear",
	};
}

const REF = { url: COVER_URL, bytes: 100, version: "1.0.0" };

const request = vi.fn();
const readFile = vi.fn();
const writeFile = vi.fn();
const list = vi.fn();
const commit = vi.fn();

beforeEach(() => {
	resetStyleCoverCache();
	request.mockReset();
	// 默认：本地没有缓存、写盘成功。
	readFile.mockReset().mockResolvedValue(null);
	writeFile.mockReset().mockResolvedValue({ revision: "1", changedPaths: [] });
	list.mockReset().mockResolvedValue([]);
	commit.mockReset().mockResolvedValue({ revision: "2", changedPaths: [] });
	setPluginCtx({ network: { request }, storage: { readFile, writeFile, list, commit } } as never);
});

describe("styleCoverRef", () => {
	it("取 cover 角色的二进制资源地址", () => {
		expect(styleCoverRef(system())).toEqual(REF);
	});

	it("没有封面、或封面不是二进制时返回 null", () => {
		expect(styleCoverRef(system([]))).toBeNull();
		expect(
			styleCoverRef(system([{ path: "cover.webp", role: "cover", encoding: "text", content: "x", bytes: 1 }])),
		).toBeNull();
		expect(styleCoverRef(system([{ ...cover, role: "preview" }]))).toBeNull();
	});
});

describe("loadStyleCover", () => {
	it("经宿主 network 取 base64，缓存成 data URL", async () => {
		request.mockResolvedValue({ ok: true, body: "AAAA" });
		await expect(loadStyleCover(REF)).resolves.toBe("data:image/webp;base64,AAAA");
		expect(cachedStyleCover(REF)).toBe("data:image/webp;base64,AAAA");
		expect(request).toHaveBeenCalledWith(expect.objectContaining({ url: COVER_URL, responseType: "base64" }));
	});

	it("同一地址并发只发一个请求，取到后不再请求", async () => {
		request.mockResolvedValue({ ok: true, body: "AAAA" });
		await Promise.all([loadStyleCover(REF), loadStyleCover(REF)]);
		await loadStyleCover(REF);
		expect(request).toHaveBeenCalledTimes(1);
	});

	it("失败返回 null 且不缓存，下次还能重试", async () => {
		request.mockResolvedValueOnce({ ok: false, body: "" });
		await expect(loadStyleCover(REF)).resolves.toBeNull();
		request.mockRejectedValueOnce(new Error("offline"));
		await expect(loadStyleCover(REF)).resolves.toBeNull();
		expect(cachedStyleCover(REF)).toBeNull();
		request.mockResolvedValueOnce({ ok: true, body: "BBBB" });
		await expect(loadStyleCover(REF)).resolves.toBe("data:image/webp;base64,BBBB");
	});

	it("同时在途的请求有上限，一排卡进视口不会一口气发几十个", async () => {
		const resolvers: Array<(value: unknown) => void> = [];
		request.mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)));
		const all = Array.from({ length: 8 }, (_, index) => loadStyleCover({ url: `${COVER_URL}?${index}`, bytes: index, version: "1" }));
		await Promise.resolve();
		await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(6));
		resolvers[0]?.({ ok: true, body: "A" });
		await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(7));
		// 余下的依次放行：每放行一个，队列里的下一个才会发出。
		for (let index = 1; index < 8; index++) {
			await vi.waitFor(() => expect(resolvers[index]).toBeDefined());
			resolvers[index]?.({ ok: true, body: "A" });
		}
		await Promise.all(all);
		expect(request).toHaveBeenCalledTimes(8);
	});
});

describe("封面落盘", () => {
	it("本地有就直接用，一个网络请求都不发", async () => {
		readFile.mockResolvedValue("ZZZZ");
		await expect(loadStyleCover(REF)).resolves.toBe("data:image/webp;base64,ZZZZ");
		expect(readFile).toHaveBeenCalledWith(coverStoragePath(REF), "base64");
		expect(request).not.toHaveBeenCalled();
	});

	it("本地没有：联网取到后写回，下次启动就命中", async () => {
		request.mockResolvedValue({ ok: true, body: "AAAA" });
		await loadStyleCover(REF);
		expect(writeFile).toHaveBeenCalledWith(coverStoragePath(REF), "AAAA", "base64");
	});

	it("取失败不写盘", async () => {
		request.mockResolvedValue({ ok: false, body: "" });
		await loadStyleCover(REF);
		expect(writeFile).not.toHaveBeenCalled();
	});

	it("读盘或写盘出错都不影响显示，退回联网", async () => {
		readFile.mockRejectedValue(new Error("disk"));
		writeFile.mockRejectedValue(new Error("disk"));
		request.mockResolvedValue({ ok: true, body: "AAAA" });
		await expect(loadStyleCover(REF)).resolves.toBe("data:image/webp;base64,AAAA");
	});

	it("上游更新（版本或体积变）后缓存键变化，旧缓存不会被误用", () => {
		const key = coverStoragePath(REF);
		expect(coverStoragePath({ ...REF, version: "1.0.1" })).not.toBe(key);
		expect(coverStoragePath({ ...REF, bytes: 101 })).not.toBe(key);
	});

	it("同一会话里清单更新后，内存缓存也不会继续给旧图", async () => {
		request.mockResolvedValueOnce({ ok: true, body: "OLD1" }).mockResolvedValueOnce({ ok: true, body: "NEW2" });
		await expect(loadStyleCover(REF)).resolves.toBe("data:image/webp;base64,OLD1");
		const updated = { ...REF, version: "1.0.1", bytes: 222 };
		expect(cachedStyleCover(updated)).toBeNull();
		await expect(loadStyleCover(updated)).resolves.toBe("data:image/webp;base64,NEW2");
		expect(request).toHaveBeenCalledTimes(2);
	});

	it("写入新版本后清掉同一张封面的旧版本，别的风格不动", async () => {
		const old = coverStoragePath({ ...REF, version: "0.9.0", bytes: 50 });
		const other = coverStoragePath({ url: "https://cdn.example.com/templates/stripe/cover.webp", bytes: 1, version: "1.0.0" });
		list.mockResolvedValue([old, other, coverStoragePath(REF)]);
		request.mockResolvedValue({ ok: true, body: "AAAA" });
		await loadStyleCover(REF);
		await vi.waitFor(() => expect(commit).toHaveBeenCalled());
		expect(commit).toHaveBeenCalledWith([{ type: "remove", path: old }]);
	});

	it("落盘路径只含安全字符，且不同风格互不相撞", () => {
		const a = coverStoragePath({ url: "https://h.example/templates/linear/cover.webp", bytes: 1, version: "1.0.0" });
		const b = coverStoragePath({ url: "https://h.example/templates/stripe/cover.webp", bytes: 1, version: "1.0.0" });
		expect(a).not.toBe(b);
		expect(a).toMatch(/^design-covers\/[A-Za-z0-9._-]+$/);
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

	it("清单更新后（同一组件、版本变了）重新取新封面", async () => {
		request.mockResolvedValueOnce({ ok: true, body: "OLD1" }).mockResolvedValueOnce({ ok: true, body: "NEW2" });
		await act(async () => root.render(<StyleCover system={system()} />));
		expect(img()?.getAttribute("src")).toBe("data:image/webp;base64,OLD1");
		await act(async () => root.render(<StyleCover system={{ ...system(), version: "1.0.1" }} />));
		expect(img()?.getAttribute("src")).toBe("data:image/webp;base64,NEW2");
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
