import {
	useEffect,
	useMemo,
	useRef,
	useState,
	type PointerEvent as ReactPointerEvent,
	type WheelEvent,
} from "react";
import { PET_ACTIONS, type PetActionId } from "../../../../shared/pet-actions";
import {
	DEFAULT_PET_VIDEO_SIZE,
	normalizePetSize,
	normalizePetVideoSizeForWindow,
	type PetVideoSizeByAction,
} from "../../../../shared/pet-config";
import type { PetBridge, PetResizeCorner } from "../../../../shared/pet-ipc";

type PetVideoMap = Partial<Record<PetActionId, string>>;

declare global {
	interface Window {
		vettaPet?: PetBridge;
	}
}

const actionDurations: Record<PetActionId, { minMs: number; maxMs: number }> = {
	sleep: { minMs: 180_000, maxMs: 300_000 },
	workout: { minMs: 35_000, maxMs: 70_000 },
	typing: { minMs: 90_000, maxMs: 180_000 },
	music: { minMs: 80_000, maxMs: 160_000 },
	hula: { minMs: 35_000, maxMs: 70_000 },
	"jump-rope": { minMs: 30_000, maxMs: 60_000 },
	tea: { minMs: 60_000, maxMs: 120_000 },
};

function getVideoMap(): PetVideoMap {
	const params = new URLSearchParams(window.location.search);
	const videos: PetVideoMap = {};
	for (const action of PET_ACTIONS) {
		const video = params.get(action.id);
		if (video && video.length > 0) {
			videos[action.id] = video;
		}
	}

	const legacyVideo = params.get("video");
	if (legacyVideo && legacyVideo.length > 0) {
		videos.typing = legacyVideo;
	}

	return videos;
}

function getInitialAutoMode(): boolean {
	return new URLSearchParams(window.location.search).get("autoMode") !== "false";
}

function getInitialDebugFrame(): boolean {
	return new URLSearchParams(window.location.search).get("debugFrame") === "true";
}

function getInitialVideoSizeByAction(): PetVideoSizeByAction {
	const params = new URLSearchParams(window.location.search);
	const sizes = {} as PetVideoSizeByAction;
	for (const action of PET_ACTIONS) {
		const size = Number(params.get(`${action.id}VideoSize`));
		sizes[action.id] = Number.isFinite(size) ? size : DEFAULT_PET_VIDEO_SIZE;
	}
	return sizes;
}

function getInitialAction(videos: PetVideoMap): PetActionId | undefined {
	const initialAction = new URLSearchParams(window.location.search).get("initialAction");
	if (initialAction && PET_ACTIONS.some((action) => action.id === initialAction) && videos[initialAction as PetActionId]) {
		return initialAction as PetActionId;
	}
	return pickNextAction(videos);
}

function randomInt(min: number, max: number): number {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getAvailableActionIds(videos: PetVideoMap): PetActionId[] {
	return PET_ACTIONS.map((action) => action.id).filter((id) => videos[id] != null);
}

function getWeightedActionsForNow(): PetActionId[] {
	const hour = new Date().getHours();
	if (hour < 7) {
		return ["sleep", "sleep", "sleep", "sleep", "music", "tea"];
	}
	if (hour >= 9 && hour < 18) {
		return ["typing", "typing", "typing", "typing", "tea", "tea", "workout", "jump-rope", "hula"];
	}
	if (hour >= 18 && hour < 23) {
		return ["music", "music", "tea", "tea", "hula", "workout", "typing"];
	}
	return ["sleep", "sleep", "music", "tea", "tea"];
}

function pickNextAction(videos: PetVideoMap, previous?: PetActionId): PetActionId | undefined {
	const available = getAvailableActionIds(videos);
	if (available.length === 0) return undefined;

	const preferred = getWeightedActionsForNow().filter((id) => videos[id] != null);
	const pool = preferred.length > 0 ? preferred : available;
	let selected = pool[randomInt(0, pool.length - 1)];
	if (available.length > 1 && selected === previous) {
		const alternatives = pool.filter((id) => id !== previous);
		if (alternatives.length > 0) {
			selected = alternatives[randomInt(0, alternatives.length - 1)];
		}
	}
	return selected;
}

function getActionDuration(actionId: PetActionId): number {
	const duration = actionDurations[actionId];
	return randomInt(duration.minMs, duration.maxMs);
}

function getWindowSize(): { width: number; height: number } {
	return {
		width: window.innerWidth,
		height: window.innerHeight,
	};
}

function getVideoDisplaySize(
	naturalSize: { width: number; height: number } | undefined,
	size: number,
): { width: number; height: number } {
	if (!naturalSize || naturalSize.width <= 0 || naturalSize.height <= 0) {
		return { width: size, height: size };
	}
	const scale = size / Math.max(naturalSize.width, naturalSize.height);
	return {
		width: Math.round(naturalSize.width * scale),
		height: Math.round(naturalSize.height * scale),
	};
}

function DebugCorners({ color }: { color: "cyan" | "amber" }): JSX.Element {
	const squareClass =
		color === "cyan"
			? "border-cyan-200 bg-cyan-400 shadow-cyan-950/40"
			: "border-amber-100 bg-amber-300 shadow-amber-950/40";
	const baseClass = `absolute size-2 border shadow-sm ${squareClass}`;

	return (
		<>
			<span className={`${baseClass} left-0 top-0`} />
			<span className={`${baseClass} right-0 top-0`} />
			<span className={`${baseClass} bottom-0 left-0`} />
			<span className={`${baseClass} bottom-0 right-0`} />
		</>
	);
}

function DebugBorder({ color, viewport = false }: { color: "cyan" | "amber"; viewport?: boolean }): JSX.Element {
	const borderClass = color === "cyan" ? "border-cyan-400" : "border-amber-300";
	if (viewport) {
		return (
			<div className="pointer-events-none fixed inset-0 z-20 overflow-hidden">
				<div
					className={`absolute box-border border ${borderClass}`}
					style={{ inset: 1 }}
				>
					<DebugCorners color={color} />
				</div>
			</div>
		);
	}

	return (
		<div className={`pointer-events-none absolute inset-0 z-20 box-border border ${borderClass}`}>
			<DebugCorners color={color} />
		</div>
	);
}

function WindowResizeHandles({
	size,
	onSizeChange,
}: {
	size: number;
	onSizeChange: (size: number) => void;
}): JSX.Element {
	const handlePointerDown = (corner: PetResizeCorner) => (event: ReactPointerEvent<HTMLDivElement>) => {
		event.preventDefault();
		event.stopPropagation();
		event.currentTarget.setPointerCapture(event.pointerId);
		const startX = event.screenX;
		const startY = event.screenY;
		const startSize = size;
		const xDirection = corner.endsWith("right") ? 1 : -1;
		const yDirection = corner.startsWith("bottom") ? 1 : -1;
		let lastSize = startSize;
		let pendingSize = startSize;
		let animationFrame: number | undefined;
		const resizeSessionReady = window.vettaPet?.beginWindowResize(corner) ?? Promise.resolve();

		const flushSize = () => {
			animationFrame = undefined;
			void resizeSessionReady.then(() => window.vettaPet?.setWindowSize(pendingSize, corner));
		};
		const scheduleSizeChange = (nextSize: number) => {
			pendingSize = nextSize;
			if (animationFrame != null) return;
			animationFrame = window.requestAnimationFrame(flushSize);
		};

		const handlePointerMove = (moveEvent: PointerEvent) => {
			const deltaX = (moveEvent.screenX - startX) * xDirection;
			const deltaY = (moveEvent.screenY - startY) * yDirection;
			const nextSize = normalizePetSize(startSize + Math.max(deltaX, deltaY));
			if (nextSize === lastSize) return;
			lastSize = nextSize;
			onSizeChange(nextSize);
			scheduleSizeChange(nextSize);
		};
		const handlePointerUp = () => {
			window.removeEventListener("pointermove", handlePointerMove);
			window.removeEventListener("pointerup", handlePointerUp);
			window.removeEventListener("pointercancel", handlePointerUp);
			if (animationFrame != null) {
				window.cancelAnimationFrame(animationFrame);
			}
			void resizeSessionReady
				.then(() => window.vettaPet?.setWindowSize(lastSize, corner))
				.then(() => window.vettaPet?.endWindowResize(lastSize));
		};

		window.addEventListener("pointermove", handlePointerMove);
		window.addEventListener("pointerup", handlePointerUp);
		window.addEventListener("pointercancel", handlePointerUp);
	};
	const baseClass = "no-drag absolute z-40 size-6 bg-cyan-400/25";

	return (
		<>
			<div
				className={`${baseClass} left-0 top-0 cursor-nwse-resize`}
				onPointerDown={handlePointerDown("top-left")}
			/>
			<div
				className={`${baseClass} right-0 top-0 cursor-nesw-resize`}
				onPointerDown={handlePointerDown("top-right")}
			/>
			<div
				className={`${baseClass} bottom-0 left-0 cursor-nesw-resize`}
				onPointerDown={handlePointerDown("bottom-left")}
			/>
			<div
				className={`${baseClass} bottom-0 right-0 cursor-nwse-resize`}
				onPointerDown={handlePointerDown("bottom-right")}
			/>
		</>
	);
}

function VideoResizeHandles({
	actionId,
	size,
	windowSize,
	onSizeChange,
}: {
	actionId: PetActionId;
	size: number;
	windowSize: number;
	onSizeChange: (size: number) => void;
}): JSX.Element {
	const handlePointerDown = (corner: PetResizeCorner) => (event: ReactPointerEvent<HTMLDivElement>) => {
		event.preventDefault();
		event.stopPropagation();
		event.currentTarget.setPointerCapture(event.pointerId);
		const startX = event.clientX;
		const startY = event.clientY;
		const startSize = size;
		const xDirection = corner.endsWith("right") ? 1 : -1;
		const yDirection = corner.startsWith("bottom") ? 1 : -1;
		let lastSize = startSize;
		let changed = false;

		const handlePointerMove = (moveEvent: PointerEvent) => {
			const deltaX = (moveEvent.clientX - startX) * xDirection;
			const deltaY = (moveEvent.clientY - startY) * yDirection;
			const nextSize = normalizePetVideoSizeForWindow(startSize + Math.max(deltaX, deltaY), windowSize);
			if (nextSize === lastSize) return;
			lastSize = nextSize;
			changed = true;
			onSizeChange(nextSize);
		};
		const handlePointerUp = () => {
			window.removeEventListener("pointermove", handlePointerMove);
			window.removeEventListener("pointerup", handlePointerUp);
			if (changed) {
				void window.vettaPet?.setVideoSize(actionId, lastSize);
			}
		};

		window.addEventListener("pointermove", handlePointerMove);
		window.addEventListener("pointerup", handlePointerUp);
	};
	const baseClass = "no-drag pointer-events-auto absolute z-40 size-5 bg-amber-300/25";

	return (
		<>
			<div
				className={`${baseClass} left-0 top-0 cursor-nwse-resize`}
				onPointerDown={handlePointerDown("top-left")}
			/>
			<div
				className={`${baseClass} right-0 top-0 cursor-nesw-resize`}
				onPointerDown={handlePointerDown("top-right")}
			/>
			<div
				className={`${baseClass} bottom-0 left-0 cursor-nesw-resize`}
				onPointerDown={handlePointerDown("bottom-left")}
			/>
			<div
				className={`${baseClass} bottom-0 right-0 cursor-nwse-resize`}
				onPointerDown={handlePointerDown("bottom-right")}
			/>
		</>
	);
}

function SizePanel({
	windowSize,
	videoSize,
}: {
	windowSize: { width: number; height: number };
	videoSize: { width: number; height: number };
}): JSX.Element {
	return (
		<div
			className="no-drag absolute left-2 top-2 z-50 rounded-md border border-cyan-300/50 bg-black/60 p-1 text-[10px] font-medium leading-4 text-white/82 shadow-lg shadow-black/30"
			onPointerDown={(event) => event.stopPropagation()}
		>
			<div className="px-1.5 py-0.5 tabular-nums">
				窗口 {Math.round(windowSize.width)} x {Math.round(windowSize.height)}
			</div>
			<div className="px-1.5 py-0.5 tabular-nums">视频 {videoSize.width} x {videoSize.height}</div>
		</div>
	);
}

export function PetApp(): JSX.Element {
	const videos = useMemo(() => getVideoMap(), []);
	const [actionId, setActionId] = useState<PetActionId | undefined>(() => getInitialAction(videos));
	const [autoMode, setAutoMode] = useState(getInitialAutoMode);
	const [debugFrame, setDebugFrame] = useState(getInitialDebugFrame);
	const [videoSizeByAction, setVideoSizeByAction] = useState(getInitialVideoSizeByAction);
	const [failedVideoSrc, setFailedVideoSrc] = useState<string | undefined>();
	const [windowSize, setWindowSize] = useState(getWindowSize);
	const [videoNaturalSize, setVideoNaturalSize] = useState<{ width: number; height: number } | undefined>();
	const videoRef = useRef<HTMLDivElement>(null);
	const isDraggingRef = useRef(false);
	const action = PET_ACTIONS.find((item) => item.id === actionId);
	const videoSrc = actionId ? videos[actionId] : undefined;
	const shouldShowVideo = videoSrc != null && videoSrc !== failedVideoSrc;
	const selectedVideoSize = actionId ? videoSizeByAction[actionId] : DEFAULT_PET_VIDEO_SIZE;
	const maxVideoSize = Math.min(windowSize.width, windowSize.height);
	const effectiveVideoSize = normalizePetVideoSizeForWindow(selectedVideoSize, maxVideoSize);
	const videoSize = getVideoDisplaySize(videoNaturalSize, effectiveVideoSize);
	const isPointOverVideo = (clientX: number, clientY: number): boolean => {
		const videoBounds = videoRef.current?.getBoundingClientRect();
		return Boolean(
			videoBounds &&
				clientX >= videoBounds.left &&
				clientX <= videoBounds.right &&
				clientY >= videoBounds.top &&
				clientY <= videoBounds.bottom,
		);
	};
	const updateMousePassthrough = (clientX: number, clientY: number) => {
		if (debugFrame || isDraggingRef.current) {
			void window.vettaPet?.setMousePassthrough(false);
			return;
		}
		void window.vettaPet?.setMousePassthrough(!isPointOverVideo(clientX, clientY));
	};
	const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
		event.preventDefault();
		event.stopPropagation();
		if (debugFrame) {
			if (isPointOverVideo(event.clientX, event.clientY) && actionId) {
				void window.vettaPet?.resizeVideoByWheel(actionId, event.deltaY);
				return;
			}
			void window.vettaPet?.resizeByWheel(event.deltaY);
			return;
		}
		if (actionId) {
			void window.vettaPet?.resizeVideoByWheel(actionId, event.deltaY);
		}
	};
	const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (event.button !== 0) return;
		event.preventDefault();
		event.currentTarget.setPointerCapture(event.pointerId);
		isDraggingRef.current = true;
		void window.vettaPet?.setMousePassthrough(false);
		let lastX = event.screenX;
		let lastY = event.screenY;

		const handlePointerMove = (moveEvent: PointerEvent) => {
			const deltaX = moveEvent.screenX - lastX;
			const deltaY = moveEvent.screenY - lastY;
			lastX = moveEvent.screenX;
			lastY = moveEvent.screenY;
			void window.vettaPet?.moveWindowBy(deltaX, deltaY);
		};
		const handlePointerUp = () => {
			window.removeEventListener("pointermove", handlePointerMove);
			window.removeEventListener("pointerup", handlePointerUp);
			isDraggingRef.current = false;
		};

		window.addEventListener("pointermove", handlePointerMove);
		window.addEventListener("pointerup", handlePointerUp);
	};
	const handleVideoSizeChange = (size: number) => {
		if (!actionId) return;
		const nextSize = normalizePetVideoSizeForWindow(size, maxVideoSize);
		setVideoSizeByAction((current) => ({
			...current,
			[actionId]: nextSize,
		}));
	};

	useEffect(() => {
		const handleResize = () => setWindowSize(getWindowSize());
		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
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
			setActionId((current) => pickNextAction(videos, current));
		}, getActionDuration(actionId));
		return () => window.clearTimeout(timer);
	}, [actionId, autoMode, videos]);

	useEffect(() => {
		setFailedVideoSrc(undefined);
		setVideoNaturalSize(undefined);
	}, [actionId]);

	useEffect(() => {
		return window.vettaPet?.onCommand((command) => {
			if (command.type === "set-debug-frame") {
				setDebugFrame(command.enabled);
				return;
			}
			if (command.type === "set-video-size") {
				setVideoSizeByAction((current) => ({
					...current,
					[command.actionId]: command.size,
				}));
				return;
			}
			if (command.type === "set-auto-mode") {
				setAutoMode(command.enabled);
				return;
			}
			setAutoMode(false);
			if (command.type === "set-action") {
				setActionId(command.actionId);
				return;
			}
			setActionId((current) => pickNextAction(videos, current));
		});
	}, [videos]);

	return (
		<div
			className="fixed inset-0 flex cursor-move items-center justify-center overflow-hidden bg-transparent"
			onPointerDown={handlePointerDown}
			onPointerMove={(event) => updateMousePassthrough(event.clientX, event.clientY)}
			onPointerLeave={() => {
				if (!debugFrame) {
					void window.vettaPet?.setMousePassthrough(true);
				}
			}}
			onWheel={handleWheel}
		>
			{debugFrame ? (
				<WindowResizeHandles
					onSizeChange={(size) => setWindowSize({ width: size, height: size })}
					size={windowSize.width}
				/>
			) : null}
			{debugFrame ? (
				<DebugBorder
					color="cyan"
					viewport
				/>
			) : null}
			{shouldShowVideo ? (
				<div
					ref={videoRef}
					className="relative"
					style={{
						width: videoNaturalSize ? `${videoSize.width}px` : "100%",
						height: videoNaturalSize ? `${videoSize.height}px` : "100%",
					}}
				>
					{debugFrame ? <DebugBorder color="amber" /> : null}
					{debugFrame && actionId ? (
						<VideoResizeHandles
							actionId={actionId}
							onSizeChange={handleVideoSizeChange}
							size={effectiveVideoSize}
							windowSize={maxVideoSize}
						/>
					) : null}
					<video
						key={actionId}
						src={videoSrc}
						autoPlay
						loop
						muted
						playsInline
						draggable={false}
						title={action?.description}
						onLoadedMetadata={(event) => {
							setVideoNaturalSize({
								width: event.currentTarget.videoWidth,
								height: event.currentTarget.videoHeight,
							});
						}}
						onError={() => setFailedVideoSrc(videoSrc)}
						className="pointer-events-none h-full w-full select-none object-contain"
					/>
				</div>
			) : (
				<div className="flex h-[148px] w-[148px] select-none items-center justify-center rounded-full border border-white/15 bg-black/25 text-center text-[11px] font-medium leading-5 text-white/70 shadow-2xl shadow-black/35 backdrop-blur-sm">
					桌宠视频
					<br />
					未提供
				</div>
			)}
			{debugFrame ? (
				<SizePanel
					windowSize={windowSize}
					videoSize={videoSize}
				/>
			) : null}
		</div>
	);
}
