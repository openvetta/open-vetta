/**
 * 走宿主离屏窗口的位图截图（ctx.capture.offscreen）。
 *
 * 与 iframe 内 html-to-image 的本质区别：这里是真实 Chromium 渲染管线直接出图，
 * 不存在「克隆 DOM 到 SVG 再重排」带来的断行、半像素基线偏移——位图与活体逐像素
 * 一致。同一个引擎 dev server 复用一个离屏窗口（SPA 客户端路由切帧），每帧只付
 * React 渲染 + 静置的成本，且完全不占画布渲染进程的主线程。
 *
 * 旧宿主没有这个能力（ctx.capture 为 undefined），调用方据 supported() 回落到
 * html-to-image 老路。
 */
import type { PluginOffscreenCaptureOptions, PluginOffscreenCaptureResult } from "@vetta-org/plugin-sdk";
import { HOME_FRAME_ID } from "../../engine/src/routes";
import { STORAGE_SEED_PARAM, type StorageEntries } from "../../engine/src/storage-sync";
import { planTiles } from "../materials/tile-plan";
import { loadImage } from "../mockup/load-image";
import { getPluginCtx } from "../plugin-context";
import { LAYOUT_PROBE_SCRIPT } from "../vetd/layout-probe";
import { TELLS_PROBE_SCRIPT } from "../vetd/tells-probe";

/**
 * 交付截图上跑的探针：渲染缺陷与生成感两组规则拼成一个数组返回。分属两个模块，是因为
 * 判据性质不同（一定画错了 vs 审美规则），各自由 layoutIssues / tellIssues 只认自己的
 * 规则名去解释。
 */
const DELIVERY_PROBE_SCRIPT = `[...(${LAYOUT_PROBE_SCRIPT}), ...(${TELLS_PROBE_SCRIPT})]`;

/**
 * 画布位图队列可以并行占用的离屏会话数。
 *
 * 宿主对同一插件最多 4 个会话（offscreen-capture-service 的 MAX_SESSIONS_PER_PLUGIN），
 * 这里占 3，剩下的一个留给交付物截图（不带 slot 的调用，见下）——否则用户正在截图/
 * 导出时会撞上「Too many capture sessions」。
 */
export const OFFSCREEN_RASTER_SLOTS = 3;

/**
 * 宿主离屏窗口的单边上限（offscreen-capture-service 的 MAX_VIEWPORT_PX）。
 * 超过会被宿主静默夹到这个数，位图就少一截，所以这边必须自己知道这条线在哪。
 *
 * 宿主那边不能往上放：离屏合成的纹理按物理像素算，2 倍屏下 4096 已是 8192，
 * 再高就会撞上 GPU 的最大纹理边长（常见 16384），GPU 进程直接退出重启。
 */
export const OFFSCREEN_MAX_VIEWPORT_PX = 4_096;

/**
 * 分块拼接画布的物理像素上限。Chromium 的 canvas 单边最大 32767、总面积也有上限，
 * 再高的 frame 按比例缩小，宁可略糊也不要出不了图。
 */
const MAX_STITCH_EDGE_PX = 16_384;

export interface OffscreenRasterRequest {
	port: number;
	frameId: string;
	width: number;
	height: number;
	/** jpeg 质量，0–1。 */
	quality: number;
	/**
	 * 位图队列的槽位（0 起，上限 OFFSCREEN_RASTER_SLOTS）。同一 slot 的请求在宿主侧
	 * 串行复用同一个隐藏窗口，不同 slot 之间才是真并行。
	 * 省略表示交付物那条路：独占一个会话，不和后台队列抢窗口。
	 */
	slot?: number;
	/** 出图的同时量一次布局（见 vetd/layout-probe）。画布自己的刷新不需要。 */
	probeLayout?: boolean;
}

export interface OffscreenRasterResult {
	dataUrl: string;
	/** `probeLayout` 时探针的原始结果，交给 layoutIssues 解释；宿主不支持时为 undefined。 */
	probe: unknown;
}

/** 宿主边界：测试用假的截图函数与解码器代替离屏窗口。 */
export interface OffscreenRasterDeps {
	capture(options: PluginOffscreenCaptureOptions): Promise<PluginOffscreenCaptureResult>;
	loadImage(dataUrl: string): Promise<HTMLImageElement>;
}

export function offscreenRasterSupported(): boolean {
	try {
		return typeof getPluginCtx().capture?.offscreen === "function";
	} catch {
		return false;
	}
}

/**
 * 快照序列化后的上限。地址里装得下远比这大的东西，但设计稿的存储正常只有几 KB；
 * 超出说明页面在往里塞大块数据，整份搬进每次截图的地址不划算，退回不同步。
 */
const MAX_STORAGE_SEED_CHARS = 256 * 1024;

/** 引擎端口 → 画布那侧 localStorage 的快照（已序列化）。null 表示不同步。 */
const storageSeeds = new Map<number, string | null>();

/**
 * 记下画布那侧的 localStorage 快照，之后这个引擎的离屏截图都按它的状态出图
 * （为什么需要见 engine/src/storage-sync.ts）。返回快照是否与上次不同。
 *
 * 快照进的是截图地址：内容一变地址就变，宿主按地址判断要不要重新加载，离屏窗口
 * 于是自然地整页重开、在设计稿读存储之前拿到新状态；内容不变则继续复用窗口。
 */
export function setOffscreenStorageSeed(port: number, entries: StorageEntries): boolean {
	const serialized = JSON.stringify(entries);
	const next = serialized.length > MAX_STORAGE_SEED_CHARS ? null : serialized;
	if (next === null && storageSeeds.get(port) !== null) {
		console.warn(`[vetd] localStorage 快照过大（${serialized.length} 字符），离屏截图不再同步画布状态`);
	}
	const changed = !storageSeeds.has(port) || storageSeeds.get(port) !== next;
	storageSeeds.set(port, next);
	return changed;
}

/** 离屏窗口要加载的引擎地址：恒为根路径，带上画布状态的快照（有的话）。 */
export function offscreenEngineUrl(port: number): string {
	const base = `http://127.0.0.1:${port}/`;
	const seed = storageSeeds.get(port);
	return seed ? `${base}?${STORAGE_SEED_PARAM}=${encodeURIComponent(seed)}` : base;
}

function sessionKeyOf(port: number, slot: number | null): string {
	return slot === null ? `design-raster:${port}:delivery` : `design-raster:${port}:${slot}`;
}

/**
 * 地址栏此刻显示的是哪一帧（页面表达式）。规则与引擎 routes.ts 的 frameOfPath 一致：
 * 首页 `/` 是 index，其余路径段百分号解码后即 frame id。
 */
const SHOWN_FRAME_EXPRESSION = `(function () {
	var segment = location.pathname.replace(/^\\/+|\\/+$/g, "");
	try { segment = decodeURIComponent(segment); } catch (error) {}
	return segment === "" ? ${JSON.stringify(HOME_FRAME_ID)} : segment;
})()`;

/** 当前历史条目的 key。react-router 每次导航（含页面自己的重定向）都会换一个新 key。 */
const HISTORY_KEY_EXPRESSION = `(history.state && history.state.key ? history.state.key : "initial")`;

/**
 * 「切帧已经发生，且地址栏显示的那一帧画完了」的页面表达式。
 *
 * 不写成 `__vetdPainted === 目标帧`：有的帧挂载后会立刻跳走（首页 `index.tsx` 里
 * `navigate("/welcome-ongoing")` 这种重定向），写回的是跳转后那一帧，目标帧自己的
 * 标记永远不会出现——每次都只能耗满宿主超时。改为比对地址：普通帧地址与标记一致；
 * 重定向帧的地址被页面改成了跳转目标，标记也是它，截到的就是画布上看到的样子。
 *
 * 光比地址还不够：show-frame 是异步消息，发出后的一小段时间里地址还停在上一帧，
 * 上一帧迟到的标记这时落下会和地址对上，误把上一帧当成就绪。所以切帧脚本记下出发时
 * 的历史 key（`__vetdNavFrom`），这里要求 key 已经变了；不需要切帧时记为空串。
 */
export const FRAME_PAINTED_EXPRESSION = `(function () {
	var painted = window.__vetdPainted;
	if (typeof painted !== "string") return false;
	if (window.__vetdNavFrom && ${HISTORY_KEY_EXPRESSION} === window.__vetdNavFrom) return false;
	return painted === ${SHOWN_FRAME_EXPRESSION};
})()`;

/** 截图就绪：帧画完，且图片都已解码。 */
export const FRAME_READY_EXPRESSION = `${FRAME_PAINTED_EXPRESSION} && Array.from(document.querySelectorAll("img")).every((img) => img.complete)`;

/**
 * 页面里切到目标帧的语句片段（供切帧与分块翻页脚本共用，调用处需先定义变量 `ID`）。
 * 记下出发时的历史 key，让 {@link FRAME_PAINTED_EXPRESSION} 能认出切帧是否已经发生。
 */
export const NAVIGATE_TO_FRAME_STATEMENTS = `window.__vetdPainted = null;
	window.__vetdNavFrom = ${HISTORY_KEY_EXPRESSION};
	window.postMessage({ vetd: true, type: "show-frame", id: ID }, "*");`;

/** 地址栏已经显示目标帧（页面表达式，调用处需先定义变量 `ID`）。 */
export const SHOWING_FRAME_EXPRESSION = `${SHOWN_FRAME_EXPRESSION} === ID`;

/**
 * 复用离屏窗口前先清掉上一帧的完成标记，再等这一帧重新画出来。
 *
 * 不清的话连续截同一个 frame 时 readyExpression 会立刻命中旧值，截图可能发生在本轮
 * React 更新、字体绘制或视口改尺寸后的重排之前，让「刚改完又截了一张」拿到旧画面。
 *
 * 但清完之后谁来写回，要看地址栏此刻显示的是不是这一帧：
 * - 别的帧：发 show-frame，引擎切路由、提交后由 FramePainted 写回；
 * - 已经是这一帧：切到同一路径时路由元素引用不变，React 直接跳过渲染，FramePainted
 *   不会再跑——只清不写就是死等，只能耗满宿主超时、销毁窗口、重开整页才截得到。
 *   完整内容截图每帧都要连着截同一帧两次（先量高度再按内容高度截），曾因此每帧
 *   白等一整个超时。这时脚本照 FramePainted 的顺序（一帧 → 字体 → 一帧）自己写回。
 *
 * 判断看地址而不看标记：标记可能刚被上一次（超时的）截图清空，看标记会再走进死等。
 */
export function framePrepareScript(frameId: string): string {
	const id = JSON.stringify(frameId);
	return `(() => {
	var ID = ${id};
	if (${SHOWING_FRAME_EXPRESSION}) {
		window.__vetdPainted = null;
		window.__vetdNavFrom = "";
		requestAnimationFrame(function () {
			document.fonts.ready.then(function () {
				requestAnimationFrame(function () {
					if (window.__vetdPainted === null) window.__vetdPainted = ID;
				});
			});
		});
		return;
	}
	${NAVIGATE_TO_FRAME_STATEMENTS}
})()`;
}

/** localhost 预览进程已经不在；与页面构建失败、截图超时等可恢复的单帧错误区分。 */
export function isOffscreenServerUnavailable(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return message.includes("ERR_CONNECTION_REFUSED") || message.includes("ECONNREFUSED");
}

function hostDeps(): OffscreenRasterDeps {
	const capture = getPluginCtx().capture;
	if (!capture) throw new Error("offscreen capture unavailable");
	return { capture: (options) => capture.offscreen(options), loadImage };
}

/** 超高 frame 分块时撑高文档用的样式节点。 */
const TALL_STYLE_ID = "vetd-raster-tall";

/**
 * 超高 frame 每一块的准备脚本：照常切帧（{@link framePrepareScript}），等画完后把
 * 文档撑到 frame 高度、滚到这一块的位置。就绪信号是 `__vetdScrollAt`。
 *
 * 撑高是因为活体 iframe 的视口就是 frame 高度：内容比 frame 短时，下面那段露出的是
 * 页面背景。离屏视口只有上限那么高，不撑的话文档滚不到 frame 底部，最后一块会和
 * 上一块错位。
 */
export function tallFramePrepareScript(frameId: string, frameHeight: number, scrollTop: number): string {
	const top = Math.max(0, Math.round(scrollTop));
	return `(() => {
	var TOP = ${top};
	window.__vetdScrollAt = null;
	${framePrepareScript(frameId)};
	var timer = setInterval(function () {
		if (!${FRAME_PAINTED_EXPRESSION}) return;
		clearInterval(timer);
		var style = document.getElementById("${TALL_STYLE_ID}");
		if (!style) {
			style = document.createElement("style");
			style.id = "${TALL_STYLE_ID}";
			document.head.appendChild(style);
		}
		style.textContent = "html{min-height:${Math.round(frameHeight)}px !important;scrollbar-width:none !important}";
		window.scrollTo({ top: TOP, behavior: "instant" });
		requestAnimationFrame(function () { window.__vetdScrollAt = TOP; });
	}, 50);
})()`;
}

/** 与 {@link tallFramePrepareScript} 配对的就绪表达式。 */
function tallFrameReadyExpression(scrollTop: number): string {
	return `${FRAME_READY_EXPRESSION} && window.__vetdScrollAt === ${Math.max(0, Math.round(scrollTop))}`;
}

/** 最后一块出图后撤掉撑高、滚动归零：同一槽位的下一帧不该接手一个滚到底的页面。 */
const TALL_FRAME_RESET_SCRIPT = `(() => {
	var style = document.getElementById("${TALL_STYLE_ID}");
	if (style) style.remove();
	window.scrollTo({ top: 0, behavior: "instant" });
	window.__vetdScrollAt = null;
	return true;
})()`;

export async function captureFrameOffscreen(
	request: OffscreenRasterRequest,
	deps: OffscreenRasterDeps = hostDeps(),
): Promise<OffscreenRasterResult> {
	const viewportHeight = Math.min(request.height, OFFSCREEN_MAX_VIEWPORT_PX);
	const shoot = (extra: Partial<PluginOffscreenCaptureOptions>): Promise<PluginOffscreenCaptureResult> =>
		deps.capture({
			// 恒定加载根路径，切帧走 show-frame 消息（bridge 的既有协议）：url 不变
			// 才能命中宿主的窗口复用，免掉每帧一次整页加载。只有存储快照变了地址才变。
			url: offscreenEngineUrl(request.port),
			width: request.width,
			height: viewportHeight,
			sessionKey: sessionKeyOf(request.port, request.slot ?? null),
			prepareScript: framePrepareScript(request.frameId),
			// __vetdPainted 由引擎在「chunk 到齐 + 字体就绪 + 绘制过一帧」后写入
			// （见 engine/src/main.tsx 的 FramePainted）；图片解码另等 complete。
			readyExpression: FRAME_READY_EXPRESSION,
			settleMs: 300,
			timeoutMs: 20_000,
			format: "jpeg",
			quality: request.quality,
			...extra,
		});
	const probe = request.probeLayout === true ? { probeScript: DELIVERY_PROBE_SCRIPT } : {};
	if (request.height <= OFFSCREEN_MAX_VIEWPORT_PX) {
		const result = await shoot(probe);
		return { dataUrl: result.dataUrl, probe: result.probe };
	}
	return stitchTallFrame(request, viewportHeight, shoot, deps, probe);
}

/**
 * 比宿主上限还高的 frame（长落地页）：视口钉在上限，按文档滚动逐块截，再拼成一张
 * 正好是 frame 尺寸的图。
 *
 * 直接把高度交给宿主的话会被静默夹到上限，图比 frame 矮；画布上的位图是 object-cover
 * 铺满 frame 的，矮图会被等比放大、左右裁掉。
 *
 * 与活体的差异：离屏视口比 frame 矮，按视口高度（vh、min-h-screen）布局的元素会更短，
 * fixed 元素每块各出现一次。长落地页里这两样都少见，比整张图走样好得多。
 */
async function stitchTallFrame(
	request: OffscreenRasterRequest,
	viewportHeight: number,
	shoot: (extra: Partial<PluginOffscreenCaptureOptions>) => Promise<PluginOffscreenCaptureResult>,
	deps: OffscreenRasterDeps,
	probe: { probeScript?: string },
): Promise<OffscreenRasterResult> {
	const plan = planTiles({ viewportHeight, top: 0, bottom: viewportHeight, hidden: request.height - viewportHeight });
	let canvas: HTMLCanvasElement | null = null;
	let g: CanvasRenderingContext2D | null = null;
	let scale = 1;
	let draw = 1;
	let probed: unknown;
	for (const [index, tile] of plan.tiles.entries()) {
		const first = index === 0;
		const last = index === plan.tiles.length - 1;
		const shot = await shoot({
			prepareScript: tallFramePrepareScript(request.frameId, request.height, tile.scrollTop),
			readyExpression: tallFrameReadyExpression(tile.scrollTop),
			// 布局探针只跑第一块：它出图后才求值，那时页面还停在顶端。
			...(first ? probe : {}),
			...(last ? { probeScript: TALL_FRAME_RESET_SCRIPT } : {}),
		});
		if (first) probed = shot.probe;
		const image = await deps.loadImage(shot.dataUrl);
		if (canvas === null || g === null) {
			scale = shot.scaleFactor > 0 ? shot.scaleFactor : 1;
			const fit = Math.min(1, MAX_STITCH_EDGE_PX / (plan.height * scale), MAX_STITCH_EDGE_PX / (request.width * scale));
			draw = scale * fit;
			canvas = document.createElement("canvas");
			canvas.width = Math.max(1, Math.round(request.width * draw));
			canvas.height = Math.max(1, Math.round(plan.height * draw));
			g = canvas.getContext("2d");
			if (!g) throw new Error("2D canvas context unavailable");
			g.fillStyle = "#ffffff";
			g.fillRect(0, 0, canvas.width, canvas.height);
		}
		const rows = tile.srcBottom - tile.srcTop;
		g.drawImage(
			image,
			0,
			tile.srcTop * scale,
			request.width * scale,
			rows * scale,
			0,
			tile.destTop * draw,
			request.width * draw,
			rows * draw,
		);
	}
	if (canvas === null) throw new Error("tall frame produced no tiles");
	return { dataUrl: canvas.toDataURL("image/jpeg", request.quality), probe: probed };
}

/**
 * 释放引擎对应的全部离屏窗口（切设计文档 / 强制刷新时；下次截图会重新加载页面）。
 * 池里每个槽位都是独立会话，漏掉任何一个都会让那一格继续拿旧页面出图。
 */
export function releaseOffscreenRasterSession(port: number): void {
	try {
		const capture = getPluginCtx().capture;
		if (!capture) return;
		for (let slot = 0; slot < OFFSCREEN_RASTER_SLOTS; slot += 1) {
			void capture.releaseOffscreen(sessionKeyOf(port, slot));
		}
		void capture.releaseOffscreen(sessionKeyOf(port, null));
	} catch {
		// ctx 未就绪或宿主不支持：无窗口可释放。
	}
}
