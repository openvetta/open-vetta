import type { ReactNode } from "react";
import type { FrameSize } from "../vetd/manifest-types";
import { PHONE_SHELLS, type PhoneShellKind, shellOuterSize } from "./phone-shell";

interface PhoneShellProps {
	kind: PhoneShellKind;
	viewport: FrameSize;
	/**
	 * 设计自己的状态栏已经画了灵动岛 / 刘海（拆不开的图），外壳就不再画自己的，免得叠成两个。
	 * Home 键款没有这块，忽略。
	 */
	hideIsland?: boolean;
	children: ReactNode;
}

/**
 * devices.css 的机身。库里的尺寸是写死的，这里用内联样式按我们的视口重新给定外框和屏幕尺寸，
 * 灵动岛、按键、天线条这些子元素是相对边缘定位的，不受影响。机身和屏幕的圆角不覆盖，
 * 用库里的值——外壳定了圆角，就不再叠画框的圆角。
 */
export function PhoneShell({ kind, viewport, hideIsland = false, children }: PhoneShellProps) {
	const spec = PHONE_SHELLS[kind];
	const outer = shellOuterSize(kind, viewport);
	const outerStyle = { width: outer.width, height: outer.height };
	return (
		<div className={`device ${spec.className}${hideIsland && kind !== "home" ? " vetd-no-island" : ""}`} style={outerStyle}>
			<div
				className="device-frame"
				style={{
					...outerStyle,
					padding: `${spec.padding.y}px ${spec.padding.x}px`,
				}}
			>
				<div
					className="device-screen"
					style={{
						width: viewport.width,
						height: viewport.height,
						border: 0,
						overflow: "hidden",
					}}
				>
					{children}
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
