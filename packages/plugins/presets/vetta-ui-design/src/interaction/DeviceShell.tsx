import type { ReactNode } from "react";
import type { FrameSize } from "../vetd/manifest-types";
import { contentFit, SHELLS, type ShellKind, shellOuterSize } from "./device-shell";

interface DeviceShellProps {
	kind: ShellKind;
	viewport: FrameSize;
	/**
	 * 设计自己的状态栏已经画了灵动岛 / 刘海（拆不开的图），外壳就不再画自己的，免得叠成两个。
	 * 只对灵动岛 / 刘海款手机有意义，其余忽略。
	 */
	hideIsland?: boolean;
	children: ReactNode;
}

/**
 * devices.css 的机身。库里的尺寸是写死的：手机和 iPad 这里用内联样式按我们的视口重新给定
 * 外框和屏幕尺寸，灵动岛、按键、天线条这些子元素是相对边缘定位的，不受影响；手表机身固定，
 * 页面等比缩进屏幕。机身和屏幕的圆角不覆盖，用库里的值——外壳定了圆角，就不再叠画框的圆角。
 */
export function DeviceShell({ kind, viewport, hideIsland = false, children }: DeviceShellProps) {
	const spec = SHELLS[kind];
	const outer = shellOuterSize(kind, viewport);
	const fit = contentFit(kind, viewport);
	const outerStyle = { width: outer.width, height: outer.height };
	const screen = spec.fixed ? spec.fixed.screen : viewport;
	const hasIsland = kind === "island" || kind === "notch";
	return (
		<div className={`device ${spec.className}${hideIsland && hasIsland ? " vetd-no-island" : ""}`} style={outerStyle}>
			<div
				className="device-frame"
				style={{
					// 手表的外框比整台设备窄（两侧给表冠留的），其余和整台设备一样大。
					...(spec.fixed ? { height: outer.height } : outerStyle),
					padding: `${spec.padding.y}px ${spec.padding.x}px`,
				}}
			>
				<div
					className="device-screen"
					style={{
						width: screen.width,
						height: screen.height,
						border: 0,
						overflow: "hidden",
						// 手表的页面比屏幕小，缩放后四周留的空是黑的（和表面一致）。
						...(fit ? { backgroundColor: "#000" } : {}),
					}}
				>
					{fit ? (
						<div
							style={{
								width: viewport.width,
								height: viewport.height,
								transform: `scale(${fit.scale})`,
								transformOrigin: "0 0",
								marginLeft: fit.offset.width,
								marginTop: fit.offset.height,
							}}
						>
							{children}
						</div>
					) : (
						children
					)}
				</div>
			</div>
			<div className="device-stripe" />
			<div className="device-header" />
			<div className="device-sensors" />
			<div className="device-btns" />
			<div className="device-power" />
			{kind === "home" ? <div className="device-home" /> : null}
		</div>
	);
}
