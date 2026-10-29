import { useTranslation } from "@vetta-org/plugin-sdk";
import { type JSX, useRef, useState } from "react";
import type { InteractionMode } from "../vetd/interaction-mode";
import { CAPSULE_CLASS, CapsuleButton, PLAIN_CLASS } from "./Capsule";
import { DevicePopover } from "./DevicePopover";

interface InteractionToolbarProps {
	path: string;
	canBack: boolean;
	canForward: boolean;
	frames: readonly { id: string; title: string }[];
	currentFrameId: string | null;
	mode: InteractionMode;
	/** 设备 / 浏览器打开只留图标（面板偏窄）。 */
	iconOnly: boolean;
	/** 路由胶囊整组收起（面板很窄）。 */
	hideRoute: boolean;
	/** 手机机型：null 跟随设计稿。只在移动端显示下拉。 */
	deviceId: string | null;
	onPickDevice(id: string | null): void;
	onBack(): void;
	onForward(): void;
	onReload(): void;
	onHome(): void;
	onPickFrame(frameId: string): void;
	onPickMode(mode: InteractionMode): void;
	onOpenExternal(): void;
}

/** 设备类型图标：当前是哪一类就画哪一类。 */
const modeIcons: Record<InteractionMode, JSX.Element> = {
	mobile: (
		<>
			<rect x="7" y="2.5" width="10" height="19" rx="2.5" />
			<path d="M11 18.5h2" strokeLinecap="round" />
		</>
	),
	desktop: (
		<>
			<rect x="3" y="4" width="18" height="12" rx="2" />
			<path d="M9 20h6M12 16v4" strokeLinecap="round" />
		</>
	),
	other: (
		<>
			<rect x="4" y="4" width="16" height="16" rx="3" />
			<path d="M9 9h6v6H9z" strokeLinejoin="round" />
		</>
	),
};

const icons = {
	back: <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />,
	forward: <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />,
	reload: <path d="M20 11a8 8 0 10-2.3 5.7M20 5v6h-6" strokeLinecap="round" strokeLinejoin="round" />,
	home: <path d="M4 11l8-7 8 7v8a1 1 0 01-1 1h-4v-6h-6v6H5a1 1 0 01-1-1v-8z" strokeLinecap="round" strokeLinejoin="round" />,
	external: (
		<>
				<path d="M14 4h6v6" strokeLinecap="round" strokeLinejoin="round" />
				<path d="M20 4l-9 9" strokeLinecap="round" />
				<path d="M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" strokeLinecap="round" strokeLinejoin="round" />
		</>
	),
};

/** 交互模式顶部的导航条：前进后退刷新、当前路径、跳页面、设备。纯展示，状态归 InteractionView。 */
export function InteractionToolbar({
	path,
	canBack,
	canForward,
	frames,
	currentFrameId,
	mode,
	iconOnly,
	hideRoute,
	deviceId,
	onPickDevice,
	onBack,
	onForward,
	onReload,
	onHome,
	onPickFrame,
	onPickMode,
	onOpenExternal,
}: InteractionToolbarProps) {
	const { t } = useTranslation();
	const deviceRef = useRef<HTMLDivElement | null>(null);
	const [deviceOpen, setDeviceOpen] = useState(false);
	return (
		<>
			{hideRoute ? null : (
				// 路由这一组是同一个胶囊：里面只有图标（名字在悬停提示里），不各画边框，也没有分隔线。
				<div className={`${CAPSULE_CLASS} min-w-0 shrink gap-0.5 px-1`}>
					<CapsuleButton variant="plain" iconOnly label={t("interaction.back")} icon={icons.back} disabled={!canBack} onClick={onBack} />
					<CapsuleButton variant="plain" iconOnly label={t("interaction.forward")} icon={icons.forward} disabled={!canForward} onClick={onForward} />
					<CapsuleButton variant="plain" iconOnly label={t("interaction.reload")} icon={icons.reload} onClick={onReload} />
					<CapsuleButton variant="plain" iconOnly label={t("interaction.home")} icon={icons.home} onClick={onHome} />
					<span className={`${PLAIN_CLASS} min-w-0 max-w-40 shrink px-2.5 font-normal`} title={path}>
						<span className="truncate">{path}</span>
					</span>
					<label className={`${PLAIN_CLASS} min-w-0 max-w-48 shrink px-2.5`}>
						<select
							value={currentFrameId ?? ""}
							onChange={(event) => event.target.value && onPickFrame(event.target.value)}
							title={t("interaction.pages")}
							aria-label={t("interaction.pages")}
							className="min-w-0 max-w-28 shrink truncate border-none bg-transparent text-xs font-normal text-inherit outline-none focus:outline-none"
						>
							{currentFrameId === null ? <option value="">{t("interaction.pages")}</option> : null}
							{frames.map((frame) => (
								<option key={frame.id} value={frame.id}>
									{frame.title}
								</option>
							))}
						</select>
					</label>
				</div>
			)}
			<div className="ml-auto flex shrink-0 items-center justify-end gap-1.5">
				{/* 设备类型和手机机型合成一个按钮，点开是浮层。 */}
				<div ref={deviceRef} className="relative shrink-0">
					<CapsuleButton
						label={t("interaction.switchDevice")}
						title={`${t("interaction.deviceMenu")}：${t(`interaction.mode.${mode}`)}`}
						icon={modeIcons[mode]}
						iconOnly={iconOnly}
						aria-haspopup="menu"
						aria-expanded={deviceOpen}
						onClick={() => setDeviceOpen((open) => !open)}
					/>
					{deviceOpen ? (
						<DevicePopover
							mode={mode}
							deviceId={deviceId}
							boundaryRef={deviceRef}
							onPickMode={onPickMode}
							onPickDevice={onPickDevice}
							onClose={() => setDeviceOpen(false)}
						/>
					) : null}
				</div>
				<CapsuleButton
					label={t("interaction.openExternal.short")}
					title={t("interaction.openExternal")}
					icon={icons.external}
					iconOnly={iconOnly}
					onClick={onOpenExternal}
				/>
			</div>
		</>
	);
}
