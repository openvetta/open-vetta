import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PET_ACTIONS, type PetActionId } from "../../../../shared/pet-actions";
import {
	DEFAULT_PET_VIDEO_SIZE,
	PET_SIZE_MAX,
	normalizePetVideoSize,
	normalizePetVideoSizeForWindow,
} from "../../../../shared/pet-config";
import type { PetBridge } from "../../../../shared/pet-ipc";
import { PetDebugOverlay } from "./PetDebugOverlay";
import { PetSpeechBubble } from "./PetSpeechBubble";
import { PetVideoSurface } from "./PetVideoSurface";
import { getActionDuration, pickNextAction } from "../services/pet-action-picker";
import {
	getInitialAction,
	getInitialAutoMode,
	getInitialBubbleStyle,
	getInitialDebugFrame,
	getInitialVideoBaseSizeByAction,
	getInitialVideoScale,
	getVideoMap,
} from "../services/pet-url-options";
import { getVideoDisplaySize } from "../services/pet-video-size";
import { usePetAutoContentSize } from "../hooks/usePetAutoContentSize";
import { usePetBubble } from "../hooks/usePetBubble";
import { usePetHitbox } from "../hooks/usePetHitbox";
import {
	PET_APP_PRESENTATION_MIN_HOLD_MS,
	type PetAppActionUpdate,
	type PetAppBubbleUpdate,
	usePetPresentationThrottle,
} from "../hooks/usePetPresentationThrottle";
import { usePetWindowInteractions } from "../hooks/usePetWindowInteractions";
import { useWindowSize } from "../hooks/useWindowSize";

const USER_ACTION_HOLD_MS = 10_000;

declare global {
	interface Window {
		vettaPet?: PetBridge;
	}
}

export function PetApp(): JSX.Element {
	const videos = useMemo(() => getVideoMap(), []);
	const [actionId, setActionId] = useState<PetActionId | undefined>(() => getInitialAction(videos));
	const [bubbleStyle, setBubbleStyle] = useState(getInitialBubbleStyle);
	const [autoMode, setAutoMode] = useState(getInitialAutoMode);
	const [debugFrame, setDebugFrame] = useState(getInitialDebugFrame);
	const [videoScale, setVideoScale] = useState(getInitialVideoScale);
	const [videoBaseSizeByAction, setVideoBaseSizeByAction] = useState(getInitialVideoBaseSizeByAction);
	const [contentOffset, setContentOffset] = useState({ x: 0, y: 0 });
	const [failedVideoSrc, setFailedVideoSrc] = useState<string | undefined>();
	const [windowSize, setWindowSize] = useWindowSize();
	const [videoNaturalSize, setVideoNaturalSize] = useState<{ width: number; height: number } | undefined>();
	const contentRef = useRef<HTMLDivElement>(null);
	const videoRef = useRef<HTMLDivElement>(null);
	const autoModeRef = useRef(autoMode);
	const appActionIdRef = useRef<PetActionId | undefined>(undefined);
	const userOverrideUntilRef = useRef(0);
	const userOverrideTimerRef = useRef<number | undefined>(undefined);
	const { bubble, hideBubble, showBubble } = usePetBubble();

	const action = PET_ACTIONS.find((item) => item.id === actionId);
	const videoSrc = actionId ? videos[actionId] : undefined;
	const shouldShowVideo = videoSrc != null && videoSrc !== failedVideoSrc;
	const selectedVideoBaseSize = actionId ? videoBaseSizeByAction[actionId] : DEFAULT_PET_VIDEO_SIZE;
	const selectedVideoSize = normalizePetVideoSize(selectedVideoBaseSize * videoScale);
	const maxVideoSize = debugFrame ? Math.min(windowSize.width, windowSize.height) : PET_SIZE_MAX;
	const targetVideoSize = selectedVideoSize;
	const effectiveVideoSize = normalizePetVideoSizeForWindow(targetVideoSize, maxVideoSize);
	const videoSize = getVideoDisplaySize(videoNaturalSize, effectiveVideoSize);
	const bubbleAnchorSize = normalizePetVideoSizeForWindow(
		PET_ACTIONS.reduce(
			(total, item) => total + normalizePetVideoSize((videoBaseSizeByAction[item.id] ?? DEFAULT_PET_VIDEO_SIZE) * videoScale),
			0,
		) / PET_ACTIONS.length,
		maxVideoSize,
	);
	const bubblePlacement = bubble && contentOffset.y < 0 ? "below" : "above";

	const clearUserOverrideTimer = () => {
		if (userOverrideTimerRef.current == null) return;
		window.clearTimeout(userOverrideTimerRef.current);
		userOverrideTimerRef.current = undefined;
	};
	const isUserOverrideActive = () => Date.now() < userOverrideUntilRef.current;
	const applyAutomaticAction = () => {
		if (!autoModeRef.current) return;
		setActionId((current) => appActionIdRef.current ?? pickNextAction(videos, current));
	};
	const canApplyAppAction = useCallback(() => autoModeRef.current && !isUserOverrideActive(), []);
	const applyAppAction = useCallback(
		(update: PetAppActionUpdate) => {
			if (update.type === "set") {
				setActionId(update.actionId);
				return;
			}
			setActionId((current) => pickNextAction(videos, current));
		},
		[videos],
	);
	const applyAppBubble = useCallback(
		(update: PetAppBubbleUpdate) => {
			if (update.type === "hide") {
				hideBubble("app");
				return;
			}
			showBubble({
				...update.input,
				source: "app",
				ttlMs: Math.max(update.input.ttlMs ?? PET_APP_PRESENTATION_MIN_HOLD_MS, PET_APP_PRESENTATION_MIN_HOLD_MS),
			});
		},
		[hideBubble, showBubble],
	);
	const handleAppActionQueued = useCallback((update: PetAppActionUpdate) => {
		if (update.type === "set") {
			appActionIdRef.current = update.actionId;
		}
	}, []);
	const { clearPresentationThrottle, queueAppAction, queueAppBubble } = usePetPresentationThrottle({
		minHoldMs: PET_APP_PRESENTATION_MIN_HOLD_MS,
		canApplyAction: canApplyAppAction,
		applyAction: applyAppAction,
		applyBubble: applyAppBubble,
		onActionQueued: handleAppActionQueued,
	});
	const scheduleUserActionRelease = (holdMs: number | undefined) => {
		clearUserOverrideTimer();
		const duration = typeof holdMs === "number" && Number.isFinite(holdMs) && holdMs > 0 ? holdMs : USER_ACTION_HOLD_MS;
		userOverrideUntilRef.current = Date.now() + duration;
		userOverrideTimerRef.current = window.setTimeout(() => {
			userOverrideTimerRef.current = undefined;
			userOverrideUntilRef.current = 0;
			applyAutomaticAction();
		}, duration);
	};

	const { handlePointerDown, handlePointerLeave, handlePointerMove, handleWheel } = usePetWindowInteractions({
		actionId,
		debugFrame,
		maxVideoSize,
		selectedVideoSize,
		videoScale,
		videoRef,
		onVideoBaseSizeChange: (nextBaseSize) => {
			if (!actionId) return;
			setVideoBaseSizeByAction((current) => ({
				...current,
				[actionId]: nextBaseSize,
			}));
		},
	});

	usePetHitbox({
		debugFrame,
		shouldShowVideo,
		videoRef,
	});

	usePetAutoContentSize({
		contentRef,
		targetRef: videoRef,
		debugFrame,
		observeKey: `${actionId ?? ""}:${bubblePlacement}:${bubbleAnchorSize}`,
	});

	useEffect(() => {
		autoModeRef.current = autoMode;
	}, [autoMode]);

	useEffect(() => {
		return () => {
			clearUserOverrideTimer();
			clearPresentationThrottle();
		};
	}, [clearPresentationThrottle]);

	useEffect(() => {
		void window.vettaPet?.setMousePassthrough(!debugFrame);
		return () => {
			void window.vettaPet?.setMousePassthrough(false);
		};
	}, [debugFrame]);

	useEffect(() => {
		if (!autoMode || !actionId) return;
		const timer = window.setTimeout(() => {
			if (isUserOverrideActive()) return;
			if (appActionIdRef.current === actionId) {
				appActionIdRef.current = undefined;
			}
			applyAutomaticAction();
		}, getActionDuration(actionId));
		return () => window.clearTimeout(timer);
	}, [actionId, autoMode, videos]);

	useEffect(() => {
		setFailedVideoSrc(undefined);
		setVideoNaturalSize(undefined);
	}, [actionId]);

	useEffect(() => {
		return window.vettaPet?.onCommand((command) => {
			if (command.type === "show-bubble") {
				const input = {
					text: command.text,
					...(command.source === undefined ? {} : { source: command.source }),
					...(command.ttlMs === undefined ? {} : { ttlMs: command.ttlMs }),
					...(command.priority === undefined ? {} : { priority: command.priority }),
				};
				if ((command.source ?? "app") === "app") {
					queueAppBubble({ type: "show", input });
					return;
				}
				showBubble(input);
				return;
			}
			if (command.type === "hide-bubble") {
				if ((command.source ?? "app") === "app") {
					queueAppBubble({ type: "hide" });
					return;
				}
				hideBubble(command.source);
				return;
			}
			if (command.type === "set-debug-frame") {
				setDebugFrame(command.enabled);
				return;
			}
			if (command.type === "set-video-scale") {
				setVideoScale(command.scale);
				return;
			}
			if (command.type === "set-video-base-size") {
				setVideoBaseSizeByAction((current) => ({
					...current,
					[command.actionId]: command.baseSize,
				}));
				return;
			}
			if (command.type === "set-bubble-style") {
				setBubbleStyle({
					styleId: command.styleId,
					...(command.decorUrl === undefined ? {} : { decorUrl: command.decorUrl }),
				});
				return;
			}
			if (command.type === "set-content-offset") {
				setContentOffset({ x: command.x, y: command.y });
				return;
			}
			if (command.type === "set-auto-mode") {
				const wasEnabled = autoModeRef.current;
				setAutoMode(command.enabled);
				autoModeRef.current = command.enabled;
				if (command.enabled && !wasEnabled && !isUserOverrideActive()) {
					applyAutomaticAction();
				}
				return;
			}
			if (command.type === "set-action") {
				const source = command.source ?? "user";
				if (source === "app") {
					queueAppAction({ type: "set", actionId: command.actionId });
					return;
				}
				if (source === "config") {
					if (!autoModeRef.current) {
						setActionId(command.actionId);
					}
					return;
				}
				setActionId(command.actionId);
				scheduleUserActionRelease(command.holdMs);
				return;
			}
			if (command.source === "app") {
				queueAppAction({ type: "random" });
				return;
			}
			setActionId((current) => pickNextAction(videos, current));
			scheduleUserActionRelease(command.holdMs);
		});
	}, [hideBubble, queueAppAction, queueAppBubble, showBubble, videos]);

	const handleDebugVideoSizeChange = (size: number) => {
		if (!actionId) return;
		const nextBaseSize = normalizePetVideoSizeForWindow(size / videoScale, maxVideoSize / videoScale);
		setVideoBaseSizeByAction((current) => ({
			...current,
			[actionId]: nextBaseSize,
		}));
	};

	return (
		<div
			className="fixed inset-0 flex cursor-move items-center justify-center overflow-hidden bg-transparent"
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerLeave={handlePointerLeave}
			onWheel={handleWheel}
		>
			<PetDebugOverlay
				debugFrame={debugFrame}
				videoSize={videoSize}
				windowSize={windowSize}
				onWindowSizeChange={(size) => setWindowSize({ width: size, height: size })}
			/>
			<div
				ref={contentRef}
				className="relative flex items-center justify-center"
				style={{
					width: videoNaturalSize ? `${videoSize.width}px` : "100%",
					height: videoNaturalSize ? `${videoSize.height}px` : "100%",
					transform:
						contentOffset.x === 0 && contentOffset.y === 0
							? undefined
							: `translate(${contentOffset.x}px, ${contentOffset.y}px)`,
				}}
			>
				<PetSpeechBubble
					anchorSize={bubbleAnchorSize}
					decorUrl={bubbleStyle.decorUrl}
					message={bubble}
					placement={bubblePlacement}
					styleId={bubbleStyle.styleId}
				/>
				<PetVideoSurface
					actionDescription={action?.description}
					actionId={actionId}
					baseSize={selectedVideoSize}
					debugFrame={debugFrame}
					maxVideoSize={maxVideoSize}
					shouldShowVideo={shouldShowVideo}
					videoRef={videoRef}
					videoSize={videoSize}
					videoSrc={videoSrc}
					hasNaturalSize={videoNaturalSize != null}
					onError={() => setFailedVideoSrc(videoSrc)}
					onLoadedMetadata={(size) => setVideoNaturalSize(size)}
					onVideoSizeChange={handleDebugVideoSizeChange}
				/>
			</div>
		</div>
	);
}
