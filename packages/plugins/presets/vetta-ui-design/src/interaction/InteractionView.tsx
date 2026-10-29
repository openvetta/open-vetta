import { useTranslation } from "@vetta-org/plugin-sdk";
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { homeFrameId, pathOfFrame } from "../../engine/src/routes";
import { getPluginCtx, notify } from "../plugin-context";
import { effectiveInteractionMode, type InteractionMode } from "../vetd/interaction-mode";
import type { DesignSession } from "../vetd/design-session";
import { frameRadius } from "../vetd/manifest-types";
import { InteractionToolbar } from "./InteractionToolbar";
import { PhoneShell } from "./PhoneShell";
import { PHONE_PRESETS, phoneShellKind, shellKindOfPreset, shellOuterSize } from "./phone-shell";
import { useNavBridge } from "./nav-bridge";
import { fitScale, parseCssColor, themeStageBackground, veilColor } from "./stage";

interface InteractionViewProps {
	port: number;
	session: DesignSession;
	/** 当前是否在交互模式。不在时整块隐藏但保持挂载，iframe 的路径和滚动位置都留着。 */
	active: boolean;
	/** 左上角标题区（设计切换 + 设计 / 交互 toggle），与画布同一份。 */
	titleSlot: ReactNode;
}

/** 非手机的裸画面外边框粗细（px，设计稿坐标）。 */
const BARE_BORDER = 6;

/** 订阅会话的变化（画框增删、尺寸、设备类别）。 */
function useSessionRevision(session: DesignSession): number {
	const [revision, setRevision] = useState(0);
	useEffect(() => {
		const handle = session.on(() => setRevision((value) => value + 1));
		return () => handle.dispose();
	}, [session]);
	return revision;
}

function useStageSize(): [React.RefObject<HTMLDivElement | null>, { width: number; height: number }] {
	const ref = useRef<HTMLDivElement | null>(null);
	const [size, setSize] = useState({ width: 0, height: 0 });
	useLayoutEffect(() => {
		const element = ref.current;
		if (!element) return;
		const measure = (): void => setSize({ width: element.clientWidth, height: element.clientHeight });
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		return () => observer.disconnect();
	}, []);
	return [ref, size];
}

/** 色卡背景（没有则宿主背景）的明暗决定夹层是叠黑还是叠白。 */
function useVeil(session: DesignSession, revision: number, stageRef: React.RefObject<HTMLDivElement | null>) {
	const [themeBackground, setThemeBackground] = useState<string | null>(null);
	const [veil, setVeil] = useState(() => veilColor(null));

	useEffect(() => {
		let cancelled = false;
		void session.readThemeCss().then((css) => {
			if (!cancelled) setThemeBackground(themeStageBackground(css));
		});
		return () => {
			cancelled = true;
		};
	}, [session, revision]);

	useLayoutEffect(() => {
		const element = stageRef.current;
		if (!element) return;
		const update = (): void => {
			const resolved = themeBackground ?? getComputedStyle(element).backgroundColor;
			setVeil(veilColor(parseCssColor(resolved)));
		};
		update();
		// 宿主切换亮 / 暗主题时背景变量会变，夹层要跟着换。
		const observer = new MutationObserver(update);
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme", "data-mode"] });
		return () => observer.disconnect();
	}, [themeBackground, stageRef]);

	return { themeBackground, veil };
}

/**
 * 交互模式：把设计稿当成真实产品来点，是活动面板里与画布并列的整页视图。
 *
 * 与画布上的 frame 的区别是不开元素选择——那边的点击语义是「选中这个元素」。跨帧跳转
 * 由 frame 源码里的 `<Link to>` 完成，走引擎的真实路由。视口始终是首页画框的设计尺寸，
 * 放不下就整体等比缩小，页面布局不会因面板窄而变形。
 */
export function InteractionView({ port, session, active, titleSlot }: InteractionViewProps) {
	const { t } = useTranslation();
	const revision = useSessionRevision(session);
	const iframeRef = useRef<HTMLIFrameElement | null>(null);
	const { nav, navigateTo, go, reload, configure } = useNavBridge(iframeRef);
	/** 手机机型：只在本次会话里生效，不写进设计稿（设计稿的真实尺寸才是依据）。 */
	const [deviceId, setDeviceId] = useState<string | null>(null);
	const [stageRef, stage] = useStageSize();
	const { themeBackground, veil } = useVeil(session, revision, stageRef);

	const { frames } = session.manifest;
	// 引擎侧的 frameIds 是排过序的，「字典序第一帧」的回落依赖它。
	const homeId = homeFrameId(frames.map((frame) => frame.id).sort());
	const home = frames.find((frame) => frame.id === homeId) ?? null;
	const mode: InteractionMode = effectiveInteractionMode(session.manifest, home);

	/**
	 * iframe 的 src 不能随换页变：换页走客户端路由，重设 src 会整页重载。它只在设备类别
	 * 切换（外壳换了一棵树，iframe 必然重挂）时按当前路径重算，这样切换后停在原页面。
	 */
	const pathRef = useRef("/");
	pathRef.current = nav?.path ?? pathRef.current;
	const mobile = mode === "mobile";
	const hasFrames = homeId !== null;
	// biome-ignore lint/correctness/useExhaustiveDependencies: 只在 mobile 变化时重算，路径读 ref
	const src = useMemo(() => (hasFrames ? `http://127.0.0.1:${port}${pathRef.current}` : null), [hasFrames, port, mobile]);

	const devicePreset = mobile ? (PHONE_PRESETS.find((preset) => preset.id === deviceId) ?? null) : null;
	const viewport = devicePreset
		? { width: devicePreset.width, height: devicePreset.height }
		: home
			? { width: home.width, height: home.height }
			: { width: 390, height: 844 };
	const radius = devicePreset ? (devicePreset.radius ?? 0) : home ? frameRadius(home) : 0;
	const shellKind = devicePreset ? shellKindOfPreset(devicePreset) : phoneShellKind(viewport, session.manifest.statusBar);
	const outer = mobile
		? shellOuterSize(shellKind, viewport)
		: { width: viewport.width + BARE_BORDER * 2, height: viewport.height + BARE_BORDER * 2 };
	const scale = stage.width > 0 ? fitScale(stage, outer) : 1;

	// 页面重载（刷新、整页 HMR）后配置会丢，所以每次导航回报时再发一遍；发送是幂等的。
	const pathKey = nav?.path;
	// biome-ignore lint/correctness/useExhaustiveDependencies: pathKey 只是重发的触发器
	useEffect(() => {
		configure({ touch: mobile, hideStatusBar: mobile });
	}, [configure, mobile, pathKey]);

	const currentFrameId = nav ? nav.frameId : homeId;
	const path = nav?.path ?? "/";

	const openExternal = useCallback((): void => {
		void getPluginCtx()
			.ui.openExternal(`http://127.0.0.1:${port}${path}`)
			// dev server 的生命周期跟着画布走，链接不是永久的——先说清楚。
			.then(() => notify({ message: t("interaction.openExternal.hint"), durationMs: 6000 }))
			.catch((error: unknown) => notify({ message: t("interaction.openExternal.failed"), error }));
	}, [port, path, t]);

	const frameElement = (
		<iframe
			ref={iframeRef}
			title={t("interaction.title")}
			src={src ?? undefined}
			className="block border-0"
			style={{ width: viewport.width, height: viewport.height }}
			onLoad={() => configure({ touch: mobile, hideStatusBar: mobile })}
		/>
	);

	return (
		<div
			className="absolute inset-0 flex flex-col"
			style={{ visibility: active ? "visible" : "hidden" }}
			aria-hidden={!active}
		>
			<div className="relative z-10 flex shrink-0 items-center gap-2 border-b border-border bg-background px-3 py-2">
				<div className="flex min-w-0 items-center gap-1">{titleSlot}</div>
				<div className="ml-auto min-w-0">
					<InteractionToolbar
						path={path}
						canBack={nav?.canBack === true}
						canForward={nav?.canForward === true}
						frames={frames}
						currentFrameId={currentFrameId}
						mode={mode}
						deviceId={deviceId}
						onPickDevice={setDeviceId}
						onBack={() => go(-1)}
						onForward={() => go(1)}
						onReload={reload}
						onHome={() => navigateTo("/")}
						onPickFrame={(frameId) => navigateTo(pathOfFrame(frameId))}
						onPickMode={(next) => session.setInteractionMode(next)}
						onOpenExternal={openExternal}
					/>
				</div>
			</div>
			<div
				ref={stageRef}
				className="relative min-h-0 flex-1 overflow-hidden bg-background"
				style={themeBackground ? { backgroundColor: themeBackground } : undefined}
			>
				{/* 灰色夹层：夹在底色与设备 / 画框之间，把两者分开。 */}
				<div className="absolute inset-0" style={{ backgroundColor: veil }} />
				{src ? (
					<div
						className="absolute"
						style={{
							width: outer.width * scale,
							height: outer.height * scale,
							left: Math.max(0, (stage.width - outer.width * scale) / 2),
							top: Math.max(0, (stage.height - outer.height * scale) / 2),
						}}
					>
						{mobile ? (
							<div style={{ width: outer.width, height: outer.height, transform: `scale(${scale})`, transformOrigin: "0 0" }}>
								<PhoneShell kind={shellKind} viewport={viewport} radius={radius}>
									{frameElement}
								</PhoneShell>
							</div>
						) : (
							<div
								className="text-foreground"
								style={{
									width: outer.width,
									height: outer.height,
									transform: `scale(${scale})`,
									transformOrigin: "0 0",
									boxSizing: "border-box",
									border: `${BARE_BORDER}px solid color-mix(in srgb, currentColor 22%, transparent)`,
									borderRadius: radius + BARE_BORDER,
									overflow: "hidden",
									backgroundColor: "#fff",
								}}
							>
								{frameElement}
							</div>
						)}
					</div>
				) : (
					<div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
						{t("interaction.empty")}
					</div>
				)}
			</div>
		</div>
	);
}
