import { useEffect, useMemo, useState } from "react";
import { PET_ACTIONS, type PetActionId } from "../../../../shared/pet-actions";
import type { PetBridge } from "../../../../shared/pet-ipc";

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

export function PetApp(): JSX.Element {
	const videos = useMemo(() => getVideoMap(), []);
	const [actionId, setActionId] = useState<PetActionId | undefined>(() => getInitialAction(videos));
	const [autoMode, setAutoMode] = useState(getInitialAutoMode);
	const [failedVideoSrc, setFailedVideoSrc] = useState<string | undefined>();
	const action = PET_ACTIONS.find((item) => item.id === actionId);
	const videoSrc = actionId ? videos[actionId] : undefined;
	const shouldShowVideo = videoSrc != null && videoSrc !== failedVideoSrc;

	useEffect(() => {
		if (!autoMode || !actionId) return;
		const timer = window.setTimeout(() => {
			setActionId((current) => pickNextAction(videos, current));
		}, getActionDuration(actionId));
		return () => window.clearTimeout(timer);
	}, [actionId, autoMode, videos]);

	useEffect(() => {
		setFailedVideoSrc(undefined);
	}, [actionId]);

	useEffect(() => {
		return window.vettaPet?.onCommand((command) => {
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
		<div className="drag-region flex h-screen w-screen items-center justify-center overflow-hidden bg-transparent">
			{shouldShowVideo ? (
				<video
					key={actionId}
					src={videoSrc}
					autoPlay
					loop
					muted
					playsInline
					draggable={false}
					title={action?.description}
					onError={() => setFailedVideoSrc(videoSrc)}
					className="h-full w-full select-none object-contain"
				/>
			) : (
				<div className="flex h-[148px] w-[148px] select-none items-center justify-center rounded-full border border-white/15 bg-black/25 text-center text-[11px] font-medium leading-5 text-white/70 shadow-2xl shadow-black/35 backdrop-blur-sm">
					桌宠视频
					<br />
					未提供
				</div>
			)}
		</div>
	);
}
