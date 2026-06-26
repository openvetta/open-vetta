import { PET_ACTIONS, type PetActionId } from "../../../../shared/pet-actions";
import {
	DEFAULT_PET_VIDEO_SCALE,
	normalizePetVideoScale,
	normalizePetVideoSize,
	type PetVideoBaseSizeByAction,
} from "../../../../shared/pet-config";
import { pickIdleAction } from "./pet-action-picker";
import type { PetVideoMap } from "./pet-types";

function getSearchParams(): URLSearchParams {
	return new URLSearchParams(window.location.search);
}

export function getVideoMap(): PetVideoMap {
	const params = getSearchParams();
	const videos: PetVideoMap = {};
	for (const action of PET_ACTIONS) {
		const video = params.get(action.id);
		if (video && video.length > 0) {
			videos[action.id] = video;
		}
	}

	const legacyVideo = params.get("video");
	if (legacyVideo && legacyVideo.length > 0) {
		videos.stoat_work_laptop_typing_desk_cushion = legacyVideo;
	}

	return videos;
}

export function getInitialAutoMode(): boolean {
	return getSearchParams().get("autoMode") !== "false";
}

export function getInitialDebugFrame(): boolean {
	return getSearchParams().get("debugFrame") === "true";
}

export function getInitialVideoScale(): number {
	const scale = Number(getSearchParams().get("videoScale"));
	return normalizePetVideoScale(Number.isFinite(scale) ? scale : DEFAULT_PET_VIDEO_SCALE);
}

export function getInitialVideoBaseSizeByAction(): PetVideoBaseSizeByAction {
	const params = getSearchParams();
	const sizes = {} as PetVideoBaseSizeByAction;
	for (const action of PET_ACTIONS) {
		const baseSize = Number(params.get(`${action.id}VideoBaseSize`) ?? params.get(`${action.id}VideoSize`));
		sizes[action.id] = Number.isFinite(baseSize) ? normalizePetVideoSize(baseSize) : action.videoBaseSize;
	}
	return sizes;
}

export function getInitialAction(videos: PetVideoMap): PetActionId | undefined {
	const initialAction = getSearchParams().get("initialAction");
	if (
		initialAction &&
		PET_ACTIONS.some((action) => action.id === initialAction) &&
		videos[initialAction as PetActionId]
	) {
		return initialAction as PetActionId;
	}
	return pickIdleAction(videos);
}
