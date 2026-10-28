/**
 * iOS 状态栏预设：设计源码里 `import { StatusBar } from "@vetta/ios"`。
 *
 * 为什么由引擎提供而不是让 agent 现画：状态栏的信号、Wi-Fi、电池是 Apple 画好的字形，
 * 圆角、间距、电池内芯比例都有固定值，凭印象画出来只能「像」，一眼就能看出不对。
 * 这里的尺寸全部是对着 iOS 模拟器截图量出来的（iPhone 17 Pro / 16 的灵动岛版，
 * iPhone 14 的刘海版，灰底 9:41、满格满电），再用基本图形（圆角矩形、同心弧）重画，
 * 不含 Apple 的矢量或字体文件：时间文字走系统字体栈，在 macOS 上就是 SF。
 *
 * 三个变体只在中间的挖孔不同：`flat` 沿用刘海版的版式，只是不画挖孔。
 * 画框被拉宽时，两侧内容跟着各自的一侧走，挖孔居中且尺寸不变，高度固定。
 */
import type { CSSProperties } from "react";

export type StatusBarVariant = "island" | "notch" | "flat";
/** 字形颜色：`dark` 是黑色字形（放在浅色屏幕上），`light` 是白色字形。不传则继承文字颜色。 */
export type StatusBarTone = "light" | "dark";

export interface StatusBarProps {
	/** 默认 `island`。 */
	variant?: StatusBarVariant;
	tone?: StatusBarTone;
	/** 默认 `9:41`。 */
	time?: string;
	/** 电量 0–100，默认 100。 */
	battery?: number;
	/**
	 * 浮在内容上方而不占位，用于头图铺到状态栏下面的屏。默认占位：高度就是该变体的
	 * 顶部安全区，内容放在它下面。
	 */
	overlay?: boolean;
	className?: string;
	style?: CSSProperties;
}

/** 各变体的顶部安全区高度（pt）。状态栏占位，内容不要进入这一段。 */
export const STATUS_BAR_HEIGHT: Record<StatusBarVariant, number> = {
	island: 59,
	notch: 47,
	flat: 47,
};

interface ClusterMetrics {
	width: number;
	height: number;
	bars: { x: number; h: number }[];
	barW: number;
	barBottom: number;
	wifi: { cx: number; tipY: number; rings: [number, number][]; dot: number; angle: number };
	battery: { x: number; y: number; w: number; h: number; r: number; fillR: number; capH: number };
}

interface Metrics {
	height: number;
	cutoutW: number;
	cluster: ClusterMetrics;
	clusterTop: number;
	clusterNudge: number;
	timeSize: number;
	timeTop: number;
	timeNudge: number;
	timeTracking: number;
}

const MODERN: Metrics = {
	height: 59,
	cutoutW: 125,
	cluster: {
		width: 78.33,
		height: 13,
		bars: [
			{ x: 0, h: 4.67 },
			{ x: 5.33, h: 7 },
			{ x: 10.67, h: 9.67 },
			{ x: 16, h: 12.33 },
		],
		barW: 3.33,
		barBottom: 12.67,
		wifi: { cx: 35.17, tipY: 12.67, rings: [[5.67, 8], [9.67, 12.33]], dot: 3.67, angle: 41 },
		battery: { x: 50.67, y: 0, w: 25, h: 13, r: 4, fillR: 2, capH: 3.67 },
	},
	clusterTop: 22.67,
	clusterNudge: -5,
	timeSize: 17,
	timeTop: 19.17,
	timeNudge: 3.6,
	timeTracking: 0,
};

const CLASSIC: Metrics = {
	height: 47,
	cutoutW: 171.33,
	cluster: {
		width: 69.34,
		height: 12.33,
		bars: [
			{ x: 0, h: 4 },
			{ x: 4.67, h: 6 },
			{ x: 9.33, h: 8.67 },
			{ x: 14, h: 11.33 },
		],
		barW: 3,
		barBottom: 12,
		wifi: { cx: 30.67, tipY: 12, rings: [[5.4, 7.8], [9.5, 12]], dot: 3.6, angle: 37 },
		battery: { x: 44.33, y: 0.33, w: 22.67, h: 12, r: 4.3, fillR: 1.7, capH: 3.33 },
	},
	clusterTop: 18.33,
	clusterNudge: 1.7,
	timeSize: 15,
	timeTop: 14.4,
	timeNudge: -2.9,
	timeTracking: 0,
};

const NOTCH_PATH =
	"M0 0C2.2 0.4 4.4 1.9 4.67 4.67L6 18.33C7.2 25 15 33.67 26 33.67H145.33C156.33 33.67 164.13 25 165.33 18.33L166.67 4.67C166.93 1.9 169.13 0.4 171.33 0Z";

const rad = (deg: number): number => (deg * Math.PI) / 180;

function Cluster({ m, battery }: { m: ClusterMetrics; battery: number }) {
	const { wifi, battery: b } = m;
	const s = Math.sin(rad(wifi.angle));
	const c = Math.cos(rad(wifi.angle));
	const level = Math.max(0, Math.min(100, battery)) / 100;
	const dotR = wifi.dot - 0.5;
	return (
		<svg width={m.width} height={m.height} viewBox={`0 0 ${m.width} ${m.height}`} fill="currentColor" style={{ display: "block" }} aria-hidden="true">
			{m.bars.map((bar) => (
				<rect key={bar.x} x={bar.x} y={m.barBottom - bar.h} width={m.barW} height={bar.h} rx={0.95} />
			))}
			{wifi.rings.map(([inner, outer]) => {
				const mid = (inner + outer) / 2;
				return (
					<path
						key={inner}
						d={`M${wifi.cx - mid * s} ${wifi.tipY - mid * c}A${mid} ${mid} 0 0 1 ${wifi.cx + mid * s} ${wifi.tipY - mid * c}`}
						fill="none"
						stroke="currentColor"
						strokeWidth={outer - inner}
						strokeLinecap="round"
					/>
				);
			})}
			<path
				d={`M${wifi.cx} ${wifi.tipY}L${wifi.cx - dotR * s} ${wifi.tipY - dotR * c}A${dotR} ${dotR} 0 0 1 ${wifi.cx + dotR * s} ${wifi.tipY - dotR * c}Z`}
				stroke="currentColor"
				strokeWidth={1}
				strokeLinejoin="round"
			/>
			<rect x={b.x + 0.5} y={b.y + 0.5} width={b.w - 1} height={b.h - 1} rx={b.r - 0.5} fill="none" stroke="currentColor" strokeWidth={1} opacity={0.4} />
			<rect x={b.x + 2} y={b.y + 2} width={(b.w - 4) * level} height={b.h - 4} rx={b.fillR} />
			<path
				d={`M${b.x + b.w + 1} ${b.y + b.h / 2 - b.capH / 2}A1.1 1.1 0 0 1 ${b.x + b.w + 1} ${b.y + b.h / 2 + b.capH / 2}Z`}
				opacity={0.5}
			/>
		</svg>
	);
}

export function StatusBar({ variant = "island", tone, time = "9:41", battery = 100, overlay = false, className, style }: StatusBarProps) {
	const m = variant === "island" ? MODERN : CLASSIC;
	const color = tone === "light" ? "#fff" : tone === "dark" ? "#000" : undefined;
	const ear: CSSProperties = { position: "relative", height: "100%" };
	return (
		<div
			data-vetd-status-bar={variant}
			className={className}
			style={{
				position: overlay ? "absolute" : "relative",
				top: overlay ? 0 : undefined,
				left: overlay ? 0 : undefined,
				zIndex: overlay ? 50 : undefined,
				flexShrink: 0,
				width: "100%",
				height: m.height,
				display: "grid",
				gridTemplateColumns: `1fr ${m.cutoutW}px 1fr`,
				color,
				pointerEvents: "none",
				userSelect: "none",
				...style,
			}}
		>
			<div style={ear}>
				<span
					style={{
						position: "absolute",
						left: "50%",
						top: m.timeTop,
						transform: `translateX(calc(-50% + ${m.timeNudge}px))`,
						font: `600 ${m.timeSize}px/20px -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif`,
						letterSpacing: m.timeTracking,
						fontFeatureSettings: '"case" 1',
						whiteSpace: "nowrap",
					}}
				>
					{time}
				</span>
			</div>
			<div style={{ position: "relative" }}>
				{variant === "island" ? (
					<div
						style={{
							position: "absolute",
							left: 0,
							top: 11.33,
							width: m.cutoutW,
							height: 36.33,
							borderRadius: 18.17,
							background: "#000",
						}}
					/>
				) : variant === "notch" ? (
					<svg
						width={m.cutoutW}
						height={33.67}
						viewBox="0 0 171.33 33.67"
						style={{ position: "absolute", left: 0, top: 0 }}
						aria-hidden="true"
					>
						<path d={NOTCH_PATH} fill="#000" />
					</svg>
				) : null}
			</div>
			<div style={ear}>
				<div
					style={{
						position: "absolute",
						left: "50%",
						top: m.clusterTop,
						transform: `translateX(calc(-50% + ${m.clusterNudge}px))`,
					}}
				>
					<Cluster m={m.cluster} battery={battery} />
				</div>
			</div>
		</div>
	);
}
