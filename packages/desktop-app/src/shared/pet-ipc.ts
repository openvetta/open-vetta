import type { PetActionId } from "./pet-actions.js";

export const PET_COMMAND_CHANNEL = "vetta:pet:command";
export const PET_RESIZE_BY_WHEEL_CHANNEL = "vetta:pet:resize-by-wheel";
export const PET_RESIZE_VIDEO_BY_WHEEL_CHANNEL = "vetta:pet:resize-video-by-wheel";
export const PET_MOVE_WINDOW_BY_CHANNEL = "vetta:pet:move-window-by";
export const PET_BEGIN_WINDOW_RESIZE_CHANNEL = "vetta:pet:begin-window-resize";
export const PET_SET_WINDOW_SIZE_CHANNEL = "vetta:pet:set-window-size";
export const PET_END_WINDOW_RESIZE_CHANNEL = "vetta:pet:end-window-resize";
export const PET_SET_VIDEO_BASE_SIZE_CHANNEL = "vetta:pet:set-video-base-size";
export const PET_SET_MOUSE_PASSTHROUGH_CHANNEL = "vetta:pet:set-mouse-passthrough";
export const PET_SET_VIDEO_HITBOX_CHANNEL = "vetta:pet:set-video-hitbox";

export type PetResizeCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export type PetVideoHitbox = {
	x: number;
	y: number;
	width: number;
	height: number;
};

export type PetCommand =
	| {
			type: "set-action";
			actionId: PetActionId;
	  }
	| {
			type: "random-action";
	  }
	| {
			type: "set-auto-mode";
			enabled: boolean;
	  }
	| {
			type: "set-debug-frame";
			enabled: boolean;
	  }
	| {
			type: "set-video-scale";
			scale: number;
	  }
	| {
			type: "set-video-base-size";
			actionId: PetActionId;
			baseSize: number;
	  };

export type PetCommandListener = (command: PetCommand) => void;

export type PetBridge = {
	onCommand(listener: PetCommandListener): () => void;
	resizeByWheel(deltaY: number): Promise<void>;
	resizeVideoByWheel(actionId: PetActionId, deltaY: number): Promise<void>;
	moveWindowBy(deltaX: number, deltaY: number): Promise<void>;
	beginWindowResize(corner: PetResizeCorner): Promise<void>;
	setWindowSize(size: number, corner?: PetResizeCorner): Promise<void>;
	endWindowResize(size: number): Promise<void>;
	setVideoBaseSize(actionId: PetActionId, baseSize: number): Promise<void>;
	setMousePassthrough(enabled: boolean): Promise<void>;
	setVideoHitbox(hitbox: PetVideoHitbox | undefined): Promise<void>;
};
