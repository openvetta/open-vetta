import { NEW_SESSION_TEXTURE_MASK } from "@vetta-org/theme-ui/chat/NewSessionBackground";
import { type JSX, type RefObject, useId, useLayoutEffect, useRef, useState } from "react";

/**
 * 对话页的「涂鸦墙纸」底衬。是否为对话页铺这一层由外观设置里的「聊天背景」决定
 * （见 `@shared/theme/chat-background`）；组件自己不知道开关，只负责画。
 *
 * 只是背景纹路，不承载任何语义，因此整层 `aria-hidden` + `pointer-events-none`。
 */

/**
 * 平铺瓦片边长（px）。改动它需要同步调整下面的撒点坐标。
 */
const TILE_SIZE = 240;

/**
 * 对话页的上下渐隐：标题栏和输入框所在的位置只留一丝纹路，中间正文区才铺满。
 * 遮罩只读 alpha，这里的黑色只是 alpha 载体，不参与配色（同 NewSessionBackground 的写法）。
 */
const CHAT_PAGE_FADE =
	"linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.35) 5%, rgba(0,0,0,1) 14%, rgba(0,0,0,1) 74%, rgba(0,0,0,0.35) 94%, rgba(0,0,0,0) 100%)";

/**
 * 这层纹路怎么淡出容器边缘。同一条纹路在不同宿主下需要的遮罩不一样，
 * 所以给的是三个语义档位，而不是让每个宿主自己拼渐变：
 *
 * - `chat`：对话页，上下渐隐，避开标题栏和输入框；
 * - `new-session`：新会话页，与网格/涟漪/流光一样向外淡出（`NEW_SESSION_TEXTURE_MASK`），
 *   换纹理时页面重心才不跳；
 * - `none`：设置页的方格预览，挂遮罩会把大半张卡片遮没。
 */
export type ChatDoodleFade = "chat" | "new-session" | "none";

const FADE_MASKS: Record<ChatDoodleFade, string | undefined> = {
	chat: CHAT_PAGE_FADE,
	"new-session": NEW_SESSION_TEXTURE_MASK,
	none: undefined,
};

interface DoodleLayer {
	readonly key: string;
	/**
	 * 瓦片相对基础图形的放大倍数。单层平铺会留下肉眼可见的方格周期，
	 * 叠一层周期互质（1 : 1.42）、偏移不同的图层就能把重复感打散。
	 */
	readonly tileScale: number;
	readonly offsetX: number;
	readonly offsetY: number;
	readonly opacity: number;
}

const LAYERS: readonly DoodleLayer[] = [
	{ key: "base", tileScale: 1, offsetX: 0, offsetY: 0, opacity: 0.24 },
	{ key: "echo", tileScale: 1.42, offsetX: 97, offsetY: 53, opacity: 0.18 },
];

/**
 * 所有图形共用一条渐变：同一块「彩色玻璃」蒙在整张图上，而不是每个图标各拿一段。
 * 五个停靠点直接用仓库已有的分段色 token（同亮度、等饱和、只靠色相区分），
 * 因此暗色/亮色主题下都是同一套五颜六色，不需要额外硬编码颜色。
 */
const DOODLE_GRADIENT_STOPS = [
	"var(--context-segment-1)",
	"var(--context-segment-2)",
	"var(--context-segment-3)",
	"var(--context-segment-4)",
	"var(--context-segment-5)",
] as const;

interface Glyph {
	readonly paths: readonly string[];
	/** [cx, cy, r] */
	readonly circles?: readonly (readonly [number, number, number])[];
	/** [cx, cy, rx, ry, rotateDeg] */
	readonly ellipses?: readonly (readonly [number, number, number, number, number])[];
}

/**
 * 图形库：手写的细线小图标，全部画在 24×24 的盒子里（盒子中心即旋转中心）。
 * 只用直线、圆弧和二次曲线，保证缩到 1px 以下描边时不会糊成一团。
 */
const GLYPHS = {
	bubble: {
		paths: [
			"M4.5 7A2.5 2.5 0 0 1 7 4.5h10A2.5 2.5 0 0 1 19.5 7v6.5A2.5 2.5 0 0 1 17 16h-6l-4 3.5V16H7a2.5 2.5 0 0 1-2.5-2.5V7Z",
		],
	},
	sparkle: { paths: ["M12 4q1.5 6.5 8 8-6.5 1.5-8 8-1.5-6.5-8-8 6.5-1.5 8-8Z"] },
	star: {
		paths: [
			"M12 4.2q1.2 6.6 7.8 7.8-6.6 1.2-7.8 7.8-1.2-6.6-7.8-7.8 6.6-1.2 7.8-7.8Z",
			"M18.6 15.2q.5 2.4 2.9 2.9-2.4.5-2.9 2.9-.5-2.4-2.9-2.9 2.4-.5 2.9-2.9Z",
		],
	},
	bolt: { paths: ["m13.5 3.5-6.5 9.8h4.6l-1.1 7.2 6.5-9.8h-4.6Z"] },
	moon: { paths: ["M20 15.4A8.4 8.4 0 0 1 8.6 4 8.6 8.6 0 1 0 20 15.4Z"] },
	terminal: { paths: ["m5.5 7.5 4.8 4.5-4.8 4.5", "M13 17h5.5"] },
	plane: {
		paths: ["m20.5 3.5-17 7.4 6.2 2.9 2.7 6.2 8.1-16.5Z", "m9.7 13.8 10.8-10.3"],
	},
	cube: {
		paths: ["M12 3.4 4.6 7.6v8.8L12 20.6l7.4-4.2V7.6L12 3.4Z", "M4.6 7.6 12 11.8l7.4-4.2", "M12 11.8v8.8"],
	},
	cloud: {
		paths: ["M7.2 18h9.4a3.4 3.4 0 0 0 .3-6.8 5.2 5.2 0 0 0-10-1.2A3.6 3.6 0 0 0 7.2 18Z"],
	},
	arrow: { paths: ["M20 5.5v5.2a3 3 0 0 1-3 3H5.2", "m9.4 9.6-4.4 4.1 4.4 4.1"] },
	hash: { paths: ["M9.5 4 7 20", "M17 4l-2.5 16", "M4.8 9h15", "M4 15h15"] },
	target: { paths: [], circles: [[12, 12, 6.6], [12, 12, 1.8]] },
	wave: { paths: ["M3.5 12c2-5.5 3.6-5.5 5.6 0s3.6 5.5 5.6 0 3.6-5.5 5.6 0"] },
	leaf: {
		paths: ["M12 20.5v-7.2", "M12 13.3c0-4.3 2.6-6.9 7.4-7.5.1 4.6-2.6 7.3-7.4 7.5Z"],
	},
	planet: { paths: [], circles: [[12, 12, 5.2]], ellipses: [[12, 12, 10.4, 3.4, -22]] },
	asterisk: { paths: ["M12 4.5v15", "M5.5 8.2l13 7.6", "M18.5 8.2l-13 7.6"] },
	cursor: { paths: ["m6 4.5 11.5 6.4-4.9 1.6-1.7 4.9L6 4.5Z"] },
	braces: {
		paths: [
			"M10.5 4.2C8.2 4.2 8 5.8 8 7.6v2.6c0 1.4-.7 1.8-2 1.8 1.3 0 2 .4 2 1.8v2.6c0 1.8.2 3.4 2.5 3.4",
			"M13.5 4.2c2.3 0 2.5 1.6 2.5 3.4v2.6c0 1.4.7 1.8 2 1.8-1.3 0-2 .4-2 1.8v2.6c0 1.8-.2 3.4-2.5 3.4",
		],
	},
	book: {
		paths: [
			"M4.5 6.2c2.4-1.4 4.9-1.4 7.5 0v14c-2.6-1.4-5.1-1.4-7.5 0v-14Z",
			"M19.5 6.2c-2.4-1.4-4.9-1.4-7.5 0v14c2.6-1.4 5.1-1.4 7.5 0v-14Z",
		],
	},
	hexagon: { paths: ["M12 3.5 19.4 7.7v8.6L12 20.5 4.6 16.3V7.7L12 3.5Z", "M12 9.2v6.2"] },
	quote: { paths: ["M9.5 5.5C6.8 6.8 5.4 9 5.4 12v6.5", "M17 5.5C14.3 6.8 12.9 9 12.9 12v6.5"] },
	capsule: { paths: [], ellipses: [[12, 12, 9.6, 4.2, 26]], circles: [[12, 12, 2.2]] },
	/** 三个小点：瓦片里最轻的填充物，让疏密不至于太均匀。 */
	dots: { paths: [], circles: [[6.5, 12, 1.3], [12, 12, 1.3], [17.5, 12, 1.3]] },
	/** 两道小弧：一片羽毛的抽象。 */
	bird: { paths: ["M3 14.5c2.6-3.4 4.2-3.4 6.8 0", "M13.2 14.5c2.6-3.4 4.2-3.4 6.8 0"] },
	/** 折线小段：瓦片里的短笔画。 */
	dash: { paths: ["M5 15.5 9.5 9l4.5 6.5L19 8.5"] },
} satisfies Record<string, Glyph>;

/**
 * 撒点：[图形, x, y, scale, 旋转角]。
 *
 * 尺寸从 0.34 到 1.5 刻意拉开（TG 的墙纸大小极不均匀），位置是打散过的，
 * 既避免行列感，也保证图形之间留出约 7px 空隙、不会叠成一坨。
 */
const LAYOUT: readonly (readonly [keyof typeof GLYPHS, number, number, number, number])[] = [
	["bubble", 17.0, 5.3, 0.5, -24],
	["sparkle", 50.2, 4.7, 0.75, -6],
	["star", 172.4, 4.9, 0.5, -24],
	["bolt", 183.7, 11.7, 0.66, -12],
	["moon", 219.4, 4.1, 0.66, 12],
	["terminal", 25.5, 16.6, 0.75, -30],
	["plane", 34.1, 34.1, 0.75, 0],
	["cube", 71.9, 37.7, 0.75, 24],
	["cloud", 80.9, 14.5, 1.02, -24],
	["arrow", 104.8, 33.6, 1.5, -12],
	["hash", 132.1, 22.2, 0.42, 18],
	["target", 146.1, 34.9, 0.34, -18],
	["wave", 156.6, 29.2, 0.58, 0],
	["leaf", 166.0, 33.1, 1.3, 30],
	["planet", 197.2, 32.3, 0.42, 6],
	["asterisk", 211.5, 24.6, 0.84, 12],
	["cursor", 49.2, 53.4, 0.66, -12],
	["braces", 104.0, 60.3, 0.34, -18],
	["book", 126.8, 59.5, 0.84, 18],
	["hexagon", 188.8, 53.5, 0.66, -24],
	["quote", 209.8, 62.5, 0.42, -6],
	["capsule", 213.7, 50.3, 0.42, 6],
	["dots", 20.0, 74.6, 0.58, -12],
	["bird", 39.7, 69.4, 0.75, 6],
	["dash", 61.6, 68.1, 0.75, 30],
	["bubble", 83.3, 89.1, 0.58, 30],
	["sparkle", 102.6, 89.1, 0.66, 30],
	["star", 124.0, 77.9, 0.5, 12],
	["bubble", 138.2, 82.7, 0.84, -30],
	["sparkle", 155.5, 67.9, 0.75, 18],
	["star", 164.9, 78.0, 1.02, -12],
	["bolt", 186.7, 67.5, 0.92, -6],
	["moon", 205.1, 86.7, 0.75, -24],
	["terminal", 45.5, 108.6, 0.34, -18],
	["plane", 57.9, 111.8, 0.84, 24],
	["cube", 59.0, 94.7, 0.84, 12],
	["cloud", 111.0, 116.9, 0.75, -24],
	["arrow", 122.7, 98.8, 1.02, -30],
	["hash", 158.6, 101.4, 0.66, 12],
	["target", 194.8, 113.8, 0.5, 18],
	["wave", 36.7, 120.3, 0.5, -18],
	["leaf", 89.5, 140.9, 0.5, 18],
	["planet", 106.7, 132.7, 1.14, -30],
	["asterisk", 148.2, 121.5, 0.66, -24],
	["cursor", 167.5, 125.6, 0.34, 24],
	["braces", 187.7, 127.4, 0.75, -18],
	["book", 216.6, 120.5, 0.75, -30],
	["hexagon", 34.3, 144.2, 0.58, 24],
	["quote", 59.5, 162.7, 0.34, -30],
	["capsule", 67.9, 150.0, 0.58, 6],
	["dots", 96.8, 163.1, 0.42, 0],
	["bird", 154.2, 156.8, 0.84, 12],
	["dash", 180.5, 165.3, 0.66, -24],
	["bubble", 185.7, 147.4, 0.66, 24],
	["sparkle", 217.5, 153.6, 0.5, -6],
	["star", 31.5, 183.4, 0.66, 30],
	["bubble", 51.4, 184.0, 0.66, -12],
	["sparkle", 85.1, 190.9, 0.34, 12],
	["star", 96.4, 185.8, 0.34, 12],
	["bolt", 125.2, 171.0, 0.42, -18],
	["moon", 129.8, 180.5, 0.66, 30],
	["terminal", 144.2, 185.2, 0.66, 18],
	["plane", 150.3, 174.0, 0.42, 18],
	["cube", 173.6, 181.9, 0.34, 12],
	["cloud", 223.6, 188.5, 0.42, -18],
	["arrow", 13.8, 208.8, 0.84, -12],
	["hash", 52.2, 202.1, 0.66, 0],
	["target", 77.9, 206.0, 0.42, 6],
	["wave", 83.1, 219.9, 0.58, 18],
	["leaf", 99.0, 206.4, 0.58, 24],
	["planet", 137.4, 213.9, 0.34, 6],
	["asterisk", 154.4, 206.3, 0.5, -24],
	["cursor", 175.0, 203.8, 0.75, 12],
	["braces", 197.3, 213.2, 0.92, -30],
	["book", 199.6, 199.2, 0.58, 30],
	["hexagon", 216.9, 208.7, 0.58, 0],
];

export interface ChatDoodleBackdropProps {
	/** 默认 `chat`：对话页是这层纹路的主场。 */
	readonly fade?: ChatDoodleFade;
}

/**
 * Telegram 风格的涂鸦墙纸：铺满的极细线图标，统一喷一条渐变。
 *
 * 图形的颜色不是逐个上色，而是「先用图形做成遮罩，再整体透过一条渐变」——
 * 所以窗口缩放、换位置时颜色都不会跟着图形跑，像一整块彩色玻璃压在上面。
 *
 * 用内联 `<svg>` 而不是 data URI 背景图：内联 SVG 才吃得到 CSS 变量（data URI 里的
 * SVG 是独立文档，变量不继承）。图形保持 24×24 盒子、`patternUnits=userSpaceOnUse`，
 * 一个 `<rect>` 就铺满整块区域，缩放窗口也不会重排图形。
 */

interface LayerSize {
	readonly width: number;
	readonly height: number;
}

/**
 * 量出底衬的实际像素尺寸，交给 SVG 的遮罩与填充矩形。
 *
 * 不能只写 `100%`：Chromium 会缓存 `<mask>` 里按百分比算出的内容，容器变宽时
 * （例如活动面板打开 → 拖宽 → 关掉）遮罩仍停在旧宽度，多出来的那一截就是空白。
 * 写成具体像素后，尺寸一变属性就变，遮罩随之失效重画。
 */
function useLayerSize(): readonly [RefObject<HTMLDivElement | null>, LayerSize | null] {
	const ref = useRef<HTMLDivElement | null>(null);
	const [size, setSize] = useState<LayerSize | null>(null);

	useLayoutEffect(() => {
		const node = ref.current;
		if (!node) return;
		const update = (width: number, height: number): void => {
			const next = { width: Math.ceil(width), height: Math.ceil(height) };
			setSize((prev) => (prev && prev.width === next.width && prev.height === next.height ? prev : next));
		};
		const rect = node.getBoundingClientRect();
		update(rect.width, rect.height);
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver((entries) => {
			const box = entries[0]?.contentRect;
			if (box) update(box.width, box.height);
		});
		observer.observe(node);
		return () => observer.disconnect();
	}, []);

	return [ref, size];
}

export function ChatDoodleBackdrop({ fade = "chat" }: ChatDoodleBackdropProps): JSX.Element {
	const [containerRef, size] = useLayerSize();
	// 量到之前（首帧、jsdom）退回百分比，不影响首屏。
	const width = size && size.width > 0 ? size.width : "100%";
	const height = size && size.height > 0 ? size.height : "100%";
	const rawId = useId();
	const id = rawId.replace(/[^a-zA-Z0-9_-]/g, "");
	const mask = FADE_MASKS[fade];
	const gradientId = `chat-doodle-gradient-${id}`;
	const layers = LAYERS.map((layer) => ({
		...layer,
		tileSize: TILE_SIZE * layer.tileScale,
		patternId: `chat-doodle-pattern-${id}-${layer.key}`,
		maskId: `chat-doodle-mask-${id}-${layer.key}`,
	}));

	return (
		<div
			ref={containerRef}
			aria-hidden
			className="pointer-events-none absolute inset-0 overflow-hidden"
			style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
		>
			<svg className="h-full w-full" fill="none">
				<defs>
					{layers.map((layer) => (
						<pattern
							key={layer.patternId}
							id={layer.patternId}
							width={layer.tileSize}
							height={layer.tileSize}
							patternUnits="userSpaceOnUse"
							patternTransform={`translate(${layer.offsetX} ${layer.offsetY})`}
							// 遮罩只看亮度，白色即“看得见”；这里的白不是主题色，是 alpha。
							stroke="white"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<g transform={`scale(${layer.tileScale})`}>
								{LAYOUT.map(([name, x, y, scale, rotate]) => {
									const glyph: Glyph = GLYPHS[name];
									return (
										<g
											// 撒点表是静态常量，位置即身份。
											key={`${name}-${x}-${y}`}
											transform={`translate(${x} ${y}) scale(${scale}) rotate(${rotate} 12 12)`}
											// 外层已经放大过，这里补偿回去，描边才稳定在 1px 以内。
											strokeWidth={1 / layer.tileScale}
										>
											{glyph.paths.map((path) => (
												<path key={path} d={path} />
											))}
											{glyph.circles?.map(([cx, cy, r]) => (
												<circle key={`${cx}-${cy}-${r}`} cx={cx} cy={cy} r={r} />
											))}
											{glyph.ellipses?.map(([cx, cy, rx, ry, degree]) => (
												<ellipse
													key={`${cx}-${cy}-${rx}-${ry}`}
													cx={cx}
													cy={cy}
													rx={rx}
													ry={ry}
													transform={`rotate(${degree} ${cx} ${cy})`}
												/>
											))}
										</g>
									);
								})}
							</g>
						</pattern>
					))}
					{layers.map((layer) => (
						<mask
							key={layer.maskId}
							id={layer.maskId}
							maskUnits="userSpaceOnUse"
							x={0}
							y={0}
							width={width}
							height={height}
						>
							<rect width={width} height={height} fill={`url(#${layer.patternId})`} />
						</mask>
					))}
					<linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
						{DOODLE_GRADIENT_STOPS.map((color, index) => (
							<stop
								key={color}
								offset={`${(index / (DOODLE_GRADIENT_STOPS.length - 1)) * 100}%`}
								style={{ stopColor: color }}
							/>
						))}
					</linearGradient>
				</defs>
				{layers.map((layer) => (
					<rect
						key={layer.maskId}
						width={width}
						height={height}
						fill={`url(#${gradientId})`}
						mask={`url(#${layer.maskId})`}
						style={{ opacity: layer.opacity }}
					/>
				))}
			</svg>
		</div>
	);
}
