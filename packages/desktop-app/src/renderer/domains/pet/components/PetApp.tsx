import { useEffect, useMemo, useRef, useState } from "react";
import { PET_ACTIONS, type PetActionId } from "../../../../shared/pet-actions";
import {
	DEFAULT_PET_VIDEO_SIZE,
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
import { usePetBubble } from "../hooks/usePetBubble";
import { usePetHitbox } from "../hooks/usePetHitbox";
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
	const [failedVideoSrc, setFailedVideoSrc] = useState<string | undefined>();
	const [windowSize, setWindowSize] = useWindowSize();
	const [videoNaturalSize, setVideoNaturalSize] = useState<{ width: number; height: number } | undefined>();
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
	const maxVideoSize = Math.min(windowSize.width, windowSize.height);
	const targetVideoSize = debugFrame ? selectedVideoBaseSize : selectedVideoSize;
	const effectiveVideoSize = normalizePetVideoSizeForWindow(targetVideoSize, maxVideoSize);
	const videoSize = getVideoDisplaySize(videoNaturalSize, effectiveVideoSize);

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
		selectedVideoBaseSize,
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

	useEffect(() => {
		autoModeRef.current = autoMode;
	}, [autoMode]);

	useEffect(() => {
		return clearUserOverrideTimer;
	}, []);

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
				showBubble({
					text: command.text,
					...(command.source === undefined ? {} : { source: command.source }),
					...(command.ttlMs === undefined ? {} : { ttlMs: command.ttlMs }),
					...(command.priority === undefined ? {} : { priority: command.priority }),
				});
				return;
			}
			if (command.type === "hide-bubble") {
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
			if (command.type === "set-auto-mode") {
				setAutoMode(command.enabled);
				autoModeRef.current = command.enabled;
				if (command.enabled && !isUserOverrideActive()) {
					applyAutomaticAction();
				}
				return;
			}
			if (command.type === "set-action") {
				const source = command.source ?? "user";
				if (source === "app") {
					appActionIdRef.current = command.actionId;
					if (autoModeRef.current && !isUserOverrideActive()) {
						setActionId(command.actionId);
					}
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
				if (autoModeRef.current && !isUserOverrideActive()) {
					applyAutomaticAction();
				}
				return;
			}
			setActionId((current) => pickNextAction(videos, current));
			scheduleUserActionRelease(command.holdMs);
		});
	}, [hideBubble, showBubble, videos]);

	const handleDebugVideoSizeChange = (size: number) => {
		if (!actionId) return;
		const nextBaseSize = normalizePetVideoSizeForWindow(size, maxVideoSize);
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
				className="relative flex items-center justify-center"
				style={{
					width: videoNaturalSize ? `${videoSize.width}px` : "100%",
					height: videoNaturalSize ? `${videoSize.height}px` : "100%",
				}}
			>
				<PetSpeechBubble
					decorUrl={bubbleStyle.decorUrl}
					message={bubble}
					styleId={bubbleStyle.styleId}
				/>
				<PetVideoSurface
					actionDescription={action?.description}
					actionId={actionId}
					baseSize={selectedVideoBaseSize}
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
