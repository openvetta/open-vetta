/**
 * 配图来源的收窄与署名。返回结构取自 2026-10-26 实测的各家接口；字段一变，搜索就会
 * 静默变空，所以每家都用一份最小样本守住。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assetFileName, creditLine, importName, parseCredits, upsertCredit } from "../src/assets/credits";
import { planCover } from "../src/assets/raster";
import {
	flattenPhotoIndex,
	isPublicImageUrl,
	parseNasa,
	parseOpenverse,
	parseWikimedia,
	pickNasaFile,
	searchPhotoIndex,
	webCandidate,
} from "../src/assets/sources";

const index = flattenPhotoIndex(
	JSON.parse(readFileSync(join(__dirname, "../vendor/taste-skill/library/photos.json"), "utf8")),
);

describe("照片索引（Unsplash）", () => {
	it("摊平全部照片，按描述与主题词搜得到", () => {
		expect(index.length).toBeGreaterThan(300);
		const [first] = searchPhotoIndex(index, "night sky stars", { limit: 3 });
		expect(first).toMatchObject({ source: "photos", license: "Unsplash License", verified: true });
		expect(first?.url).toMatch(/^https:\/\/picsum\.photos\/id\/\d+\/2400\/\d+$/);
		expect(searchPhotoIndex(index, "zz", { limit: 3 })).toEqual([]);
	});
});

describe("开放图库", () => {
	it("Openverse：许可写成 CC 全称", () => {
		const [item] = parseOpenverse({
			results: [
				{
					id: "abc",
					title: "Saturn",
					creator: "NASA Hubble",
					license: "by",
					license_version: "2.0",
					url: "https://live.staticflickr.com/1.jpg",
					thumbnail: "https://api.openverse.org/v1/images/abc/thumb/",
					foreign_landing_url: "https://www.flickr.com/photos/x/1",
					width: 1600,
					height: 1200,
				},
			],
		});
		expect(item).toMatchObject({ ref: "openverse:abc", license: "CC BY 2.0", author: "NASA Hubble", width: 1600 });
		expect(parseOpenverse({ results: [{ id: "x" }] })).toEqual([]);
	});

	it("Wikimedia：只收可商用的许可，作者去掉 HTML", () => {
		const page = (title: string, license: string) => ({
			title: `File:${title}.jpg`,
			imageinfo: [
				{
					url: `https://upload.wikimedia.org/${title}.jpg`,
					thumburl: `https://thumb.wikimedia.org/${title}.jpg`,
					descriptionurl: `https://commons.wikimedia.org/wiki/File:${title}.jpg`,
					width: 4000,
					height: 3000,
					extmetadata: { LicenseShortName: { value: license }, Artist: { value: '<a href="x">Wilfredor</a>' } },
				},
			],
		});
		const results = parseWikimedia({
			query: { pages: { 1: page("Cinema", "CC BY-SA 4.0"), 2: page("Locked", "CC BY-NC 2.0"), 3: page("Free", "CC0") } },
		});
		expect(results.map((r) => [r.title, r.license, r.author])).toEqual([
			["Cinema", "CC BY-SA 4.0", "Wilfredor"],
			["Free", "CC0", "Wilfredor"],
		]);
	});

	it("NASA：先读文件清单，挑够用的大图而不是几十 MB 的原图", () => {
		const [item] = parseNasa(
			{
				collection: {
					items: [
						{
							href: "https://images-assets.nasa.gov/image/PIA1/collection.json",
							data: [{ nasa_id: "PIA1", title: "Saturn", center: "JPL" }],
							links: [{ href: "https://images-assets.nasa.gov/image/PIA1/PIA1~small.jpg" }],
						},
					],
				},
			},
			3,
		);
		expect(item).toMatchObject({ ref: "nasa:PIA1", license: "Public domain (NASA)", url: expect.stringMatching(/collection\.json$/) });
		expect(
			pickNasaFile([
				"http://images-assets.nasa.gov/image/PIA1/PIA1~orig.jpg",
				"http://images-assets.nasa.gov/image/PIA1/PIA1~medium.jpg",
				"http://images-assets.nasa.gov/image/PIA1/metadata.json",
			]),
		).toBe("https://images-assets.nasa.gov/image/PIA1/PIA1~medium.jpg");
		expect(pickNasaFile(["http://x/metadata.json"])).toBeNull();
	});
});

describe("任意网址", () => {
	it("放行公网地址，拦住本机与内网", () => {
		expect(isPublicImageUrl("https://images.unsplash.com/photo-1.jpg")).toBe(true);
		for (const url of [
			"http://localhost:3000/a.png",
			"http://127.0.0.1/a.png",
			"http://192.168.1.1/a.png",
			"http://10.0.0.2/a.png",
			"http://172.20.0.1/a.png",
			"http://[::1]/a.png",
			"http://nas.local/a.png",
			"file:///etc/passwd",
			"not a url",
		]) {
			expect(isPublicImageUrl(url), url).toBe(false);
		}
	});

	it("来源不明的图记为许可待确认", () => {
		expect(webCandidate("https://example.com/img/desert%20dunes.jpg", "https://example.com/post")).toMatchObject({
			source: "web",
			title: "desert dunes",
			license: "unverified",
			verified: false,
			page: "https://example.com/post",
		});
	});
});

describe("落盘", () => {
	it("按显示尺寸的两倍居中裁切，不放大原图", () => {
		expect(planCover({ width: 4000, height: 3000 }, { width: 390, height: 220 })).toMatchObject({
			width: 780,
			height: 440,
			sy: expect.any(Number),
		});
		const small = planCover({ width: 600, height: 400 }, { width: 1440, height: 600 });
		expect(small.width).toBe(600);
		expect(small.height).toBe(250);
		const tall = planCover({ width: 8000, height: 8000 }, { width: 2000, height: 3000 });
		expect(tall.height).toBeLessThanOrEqual(2400);
	});

	it("文件名不重名，import 变量名合法，同一文件的署名只留最新", () => {
		const taken = new Set(["night-sky.jpg"]);
		expect(assetFileName("Night Sky!", taken, "jpg")).toBe("night-sky-2.jpg");
		expect(assetFileName("星空", taken, "jpg")).toBe("image.jpg");
		expect(importName("night-sky-2.jpg")).toBe("nightSky2");
		expect(importName("2049-poster.jpg")).toBe("img2049Poster");
		const base = { title: "t", author: "a", source: "photos" as const, license: "Unsplash License", page: "p", url: "u", verified: true, at: "x" };
		const merged = upsertCredit([{ ...base, file: "assets/a.jpg" }], { ...base, file: "assets/a.jpg", title: "new" });
		expect(merged).toHaveLength(1);
		expect(merged[0]?.title).toBe("new");
		expect(parseCredits("oops")).toEqual([]);
		expect(creditLine({ ...base, file: "assets/a.jpg", verified: false })).toMatch(/license unverified/);
	});
});
