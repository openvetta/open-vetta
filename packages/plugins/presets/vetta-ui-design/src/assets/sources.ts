/**
 * 设计配图的来源：免 key 的开放图库，加上任意网址。
 *
 * 为什么是这几家（2026-10-26 实测）：Unsplash、Pexels 的搜索不带 key 一律 401/403，
 * 让用户去申请 key 的成本又不值得；能免 key 搜索的是 Openverse（聚合 Flickr 的 CC 图、
 * Wikimedia 等）、Wikimedia Commons、NASA 图片库。Unsplash 的图经 taste-skill 收录的
 * 照片索引（vendor/taste-skill/library/photos.json，picsum.photos 按 id 出图）拿到。
 * 模型用网页搜索找到的任何图片地址也收，只是许可记为待确认。
 *
 * 这里只有纯函数：拼请求地址、把各家的返回收窄成同一种结果。联网在工具层。
 */

export type AssetSource = "photos" | "openverse" | "wikimedia" | "nasa" | "web";

export interface AssetCandidate {
	/** `<source>:<id>`，get 用它取回原图与署名。 */
	ref: string;
	source: AssetSource;
	title: string;
	author: string;
	license: string;
	/** 原图（或足够大的版本）地址。 */
	url: string;
	/** 缩略图地址，拼联系表用。 */
	thumb: string;
	/** 作品页面，署名里附上。 */
	page: string;
	width: number | null;
	height: number | null;
	/** 许可是否来自来源方的结构化数据；任意网址为 false。 */
	verified: boolean;
}

type Obj = Record<string, unknown>;
const isObj = (value: unknown): value is Obj => typeof value === "object" && value !== null && !Array.isArray(value);
const str = (value: unknown): string => (typeof value === "string" ? value : "");
const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const stripHtml = (value: string) =>
	value
		.replace(/<[^>]*>/g, "")
		.replace(/\s+/g, " ")
		.trim();

export type Orientation = "landscape" | "portrait" | "square";

// ---------- 照片索引（Unsplash，经 picsum） ----------

export interface IndexedPhoto {
	id: number;
	alt: string;
	tone: string;
	colours: string[];
	by: string;
	ratio: number | null;
	set: string;
	keywords: string[];
}

/** 把 photos.json 摊平成一张表，每张带上所在主题集的关键词，搜索时一起比。 */
export function flattenPhotoIndex(raw: unknown): IndexedPhoto[] {
	if (!isObj(raw) || !isObj(raw.sets)) return [];
	const out: IndexedPhoto[] = [];
	for (const [set, value] of Object.entries(raw.sets)) {
		if (!isObj(value) || !Array.isArray(value.photos)) continue;
		const keywords = Array.isArray(value.keywords) ? value.keywords.filter((k): k is string => typeof k === "string") : [];
		for (const photo of value.photos) {
			if (!isObj(photo) || typeof photo.id !== "number" || !str(photo.alt)) continue;
			out.push({
				id: photo.id,
				alt: str(photo.alt),
				tone: str(photo.tone),
				colours: Array.isArray(photo.colours) ? photo.colours.filter((c): c is string => typeof c === "string") : [],
				by: str(photo.by),
				ratio: num(photo.ratio),
				set,
				keywords: [set, ...keywords],
			});
		}
	}
	return out;
}

const words = (text: string) =>
	text
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((word) => word.length >= 3)
		.map((word) => word.replace(/(ies|es|s)$/, ""));

const orientationOf = (ratio: number | null): Orientation | null =>
	ratio === null ? null : ratio >= 1.15 ? "landscape" : ratio <= 0.87 ? "portrait" : "square";

export function picsumUrl(id: number, width: number, height: number): string {
	return `https://picsum.photos/id/${id}/${Math.round(width)}/${Math.round(height)}`;
}

/** 按描述、色彩和主题关键词打分；索引是英文的，查询词也应是英文。 */
export function searchPhotoIndex(
	index: readonly IndexedPhoto[],
	query: string,
	options: { orientation?: Orientation | null; limit: number },
): AssetCandidate[] {
	const terms = words(query);
	if (terms.length === 0) return [];
	const scored = index
		.map((photo) => {
			const alt = words(`${photo.alt} ${photo.colours.join(" ")} ${photo.tone}`);
			const keys = photo.keywords.flatMap(words);
			let score = 0;
			for (const term of terms) {
				if (alt.includes(term)) score += 3;
				else if (alt.some((word) => word.startsWith(term) || term.startsWith(word))) score += 1;
				if (keys.includes(term)) score += 2;
			}
			if (options.orientation && orientationOf(photo.ratio) === options.orientation) score += 0.5;
			return { photo, score };
		})
		.filter((entry) => entry.score >= 2)
		.sort((a, b) => b.score - a.score)
		.slice(0, options.limit);
	return scored.map(({ photo }) => {
		const ratio = photo.ratio ?? 1.5;
		return {
			ref: `photos:${photo.id}`,
			source: "photos",
			title: photo.alt,
			author: photo.by,
			license: "Unsplash License",
			url: picsumUrl(photo.id, 2400, Math.round(2400 / ratio)),
			thumb: picsumUrl(photo.id, 320, Math.round(320 / ratio)),
			page: `https://picsum.photos/id/${photo.id}/info`,
			width: 2400,
			height: Math.round(2400 / ratio),
			verified: true,
		};
	});
}

// ---------- Openverse ----------

export function openverseSearchUrl(query: string, orientation: Orientation | null, limit: number): string {
	const params = new URLSearchParams({ q: query, license_type: "commercial", page_size: String(limit), mature: "false" });
	if (orientation) params.set("aspect_ratio", orientation === "landscape" ? "wide" : orientation === "portrait" ? "tall" : "square");
	return `https://api.openverse.org/v1/images/?${params}`;
}

export function parseOpenverse(body: unknown): AssetCandidate[] {
	if (!isObj(body) || !Array.isArray(body.results)) return [];
	return body.results.filter(isObj).flatMap((item): AssetCandidate[] => {
		const url = str(item.url);
		const id = str(item.id);
		if (!url || !id) return [];
		const license = [str(item.license).toUpperCase(), str(item.license_version)].filter(Boolean).join(" ");
		return [
			{
				ref: `openverse:${id}`,
				source: "openverse",
				title: str(item.title) || "Untitled",
				author: str(item.creator) || "Unknown",
				license: license.startsWith("CC0") || license.startsWith("PDM") ? license : `CC ${license}`,
				url,
				thumb: str(item.thumbnail) || url,
				page: str(item.foreign_landing_url) || url,
				width: num(item.width),
				height: num(item.height),
				verified: true,
			},
		];
	});
}

// ---------- Wikimedia Commons ----------

export function wikimediaSearchUrl(query: string, limit: number): string {
	const params = new URLSearchParams({
		action: "query",
		format: "json",
		generator: "search",
		gsrsearch: `${query} filetype:bitmap`,
		gsrnamespace: "6",
		gsrlimit: String(limit),
		prop: "imageinfo",
		iiprop: "url|size|extmetadata",
		iiurlwidth: "320",
		origin: "*",
	});
	return `https://commons.wikimedia.org/w/api.php?${params}`;
}

/** 只收允许商用的许可；NC、ND 的跳过。 */
const COMMERCIAL_LICENSE = /^(cc0|cc by(-sa)?\b|public domain|pd\b|attribution)/i;

export function parseWikimedia(body: unknown): AssetCandidate[] {
	if (!isObj(body) || !isObj(body.query) || !isObj(body.query.pages)) return [];
	return Object.values(body.query.pages)
		.filter(isObj)
		.flatMap((page): AssetCandidate[] => {
			const info = Array.isArray(page.imageinfo) ? page.imageinfo.find(isObj) : undefined;
			if (!info) return [];
			const meta = isObj(info.extmetadata) ? info.extmetadata : {};
			const field = (key: string) => (isObj(meta[key]) ? stripHtml(str((meta[key] as Obj).value)) : "");
			const license = field("LicenseShortName");
			if (!COMMERCIAL_LICENSE.test(license) || /\bNC\b|\bND\b/.test(license)) return [];
			const title = str(page.title).replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, "");
			return [
				{
					ref: `wikimedia:${str(page.title)}`,
					source: "wikimedia",
					title,
					author: field("Artist") || "Wikimedia Commons",
					license,
					url: str(info.url),
					thumb: str(info.thumburl) || str(info.url),
					page: str(info.descriptionurl) || str(info.url),
					width: num(info.width),
					height: num(info.height),
					verified: true,
				},
			];
		})
		.filter((candidate) => candidate.url);
}

// ---------- NASA ----------

export function nasaSearchUrl(query: string): string {
	return `https://images-api.nasa.gov/search?${new URLSearchParams({ q: query, media_type: "image" })}`;
}

export function parseNasa(body: unknown, limit: number): AssetCandidate[] {
	if (!isObj(body) || !isObj(body.collection) || !Array.isArray(body.collection.items)) return [];
	return body.collection.items
		.filter(isObj)
		.flatMap((item): AssetCandidate[] => {
			const data = Array.isArray(item.data) ? item.data.find(isObj) : undefined;
			const link = Array.isArray(item.links) ? item.links.find(isObj) : undefined;
			const thumb = link ? str(link.href) : "";
			const id = data ? str(data.nasa_id) : "";
			if (!data || !thumb || !id) return [];
			return [
				{
					ref: `nasa:${id}`,
					source: "nasa",
					title: str(data.title) || id,
					author: str(data.photographer) || str(data.center) || "NASA",
					license: "Public domain (NASA)",
					// 各尺寸的文件名不固定（有的只有 ~small 和 ~orig），取图时先读这份清单再挑。
					url: str(item.href) || thumb,
					thumb,
					page: `https://images.nasa.gov/details/${encodeURIComponent(id)}`,
					width: null,
					height: null,
					verified: true,
				},
			];
		})
		.slice(0, limit);
}

/** collection.json 是该条目所有文件的地址列表：优先够用的大图，~orig 往往几十 MB。 */
export function pickNasaFile(body: unknown): string | null {
	if (!Array.isArray(body)) return null;
	const images = body.filter((url): url is string => typeof url === "string" && /\.(jpe?g|png)$/i.test(url));
	for (const size of ["~large", "~medium", "~orig", "~small"]) {
		const found = images.find((url) => url.includes(size));
		if (found) return found.replace(/^http:/, "https:");
	}
	return images[0]?.replace(/^http:/, "https:") ?? null;
}

/** 按需要的宽度向 Commons 要一张官方缩放图，不下载几 MB 的原图。 */
export function wikimediaScaledUrl(title: string, width: number): string {
	const params = new URLSearchParams({
		action: "query",
		format: "json",
		titles: title,
		prop: "imageinfo",
		iiprop: "url",
		iiurlwidth: String(Math.round(width)),
		origin: "*",
	});
	return `https://commons.wikimedia.org/w/api.php?${params}`;
}

export function parseWikimediaScaled(body: unknown): string | null {
	if (!isObj(body) || !isObj(body.query) || !isObj(body.query.pages)) return null;
	for (const page of Object.values(body.query.pages)) {
		const info = isObj(page) && Array.isArray(page.imageinfo) ? page.imageinfo.find(isObj) : undefined;
		if (info) return str(info.thumburl) || str(info.url) || null;
	}
	return null;
}

// ---------- 任意网址 ----------

/**
 * 拦掉本机与内网地址。联网对设计场景是放开的（任意域名），但下载工具不该被一条
 * 模型给的地址带去访问用户的路由器或本机服务。只能按字面判断：域名解析到内网的
 * 情况插件这边看不见。
 */
export function isPublicImageUrl(value: string): boolean {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return false;
	}
	if (url.protocol !== "https:" && url.protocol !== "http:") return false;
	const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
	if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
	if (host === "::1" || host === "::" || /^f[cd][0-9a-f]{2}:/.test(host) || /^fe80:/.test(host)) return false;
	const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
	if (v4) {
		const [a, b] = [Number(v4[1]), Number(v4[2])];
		if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 192 && b === 168)) return false;
		if (a === 172 && b >= 16 && b <= 31) return false;
		if (a === 100 && b >= 64 && b <= 127) return false;
	}
	return true;
}

/** 模型直接给的网址：来源和许可都不可知，记成待确认，由用户在正式使用前核对。 */
export function webCandidate(url: string, page?: string): AssetCandidate {
	const name = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "image").replace(/\.[a-z0-9]+$/i, "");
	return {
		ref: `web:${url}`,
		source: "web",
		title: name || "image",
		author: new URL(page ?? url).hostname,
		license: "unverified",
		url,
		thumb: url,
		page: page ?? url,
		width: null,
		height: null,
		verified: false,
	};
}
