import type { PetActionId } from "./pet-actions.js";

export const PET_COMMAND_CHANNEL = "vetta:pet:command";
export const PET_CONFIG_CHANGED_CHANNEL = "vetta:pet:config-changed";
export const PET_RESIZE_BY_WHEEL_CHANNEL = "vetta:pet:resize-by-wheel";
export const PET_RESIZE_VIDEO_BY_WHEEL_CHANNEL = "vetta:pet:resize-video-by-wheel";
export const PET_BEGIN_WINDOW_MOVE_CHANNEL = "vetta:pet:begin-window-move";
export const PET_MOVE_WINDOW_BY_CHANNEL = "vetta:pet:move-window-by";
export const PET_END_WINDOW_MOVE_CHANNEL = "vetta:pet:end-window-move";
export const PET_BEGIN_WINDOW_RESIZE_CHANNEL = "vetta:pet:begin-window-resize";
export const PET_SET_WINDOW_SIZE_CHANNEL = "vetta:pet:set-window-size";
export const PET_SET_CONTENT_SIZE_CHANNEL = "vetta:pet:set-content-size";
export const PET_END_WINDOW_RESIZE_CHANNEL = "vetta:pet:end-window-resize";
export const PET_SET_VIDEO_BASE_SIZE_CHANNEL = "vetta:pet:set-video-base-size";
export const PET_SET_MOUSE_PASSTHROUGH_CHANNEL = "vetta:pet:set-mouse-passthrough";
export const PET_SET_VIDEO_HITBOX_CHANNEL = "vetta:pet:set-video-hitbox";

export type PetResizeCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type PetCommandSource = "app" | "user" | "config";
export type PetActivityState = "idle" | "thinking" | "working" | "waiting_input" | "success" | "error" | "paused";

export type PetVideoHitbox = {
	x: number;
	y: number;
	width: number;
	height: number;
};

/** 桌宠窗口贴合的内容尺寸，由渲染层按实际画面测量后上报。 */
export type PetContentSize = {
	width: number;
	height: number;
};

export type PetCommand =
	| {
			type: "set-state";
			state: PetActivityState;
			actionId: PetActionId;
			sessionId?: string;
	  }
	| {
			type: "set-action";
			actionId: PetActionId;
			source?: PetCommandSource;
			holdMs?: number;
	  }
	| {
			type: "random-action";
			source?: PetCommandSource;
			holdMs?: number;
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
	  }
	| {
			// 系统锁屏或休眠时暂停桌宠视频解码，解锁或唤醒后恢复。
			type: "set-playback";
			playing: boolean;
	  };

export type PetCommandListener = (command: PetCommand) => void;

export type PetBridge = {
	onCommand(listener: PetCommandListener): () => void;
	resizeByWheel(deltaY: number): Promise<void>;
	resizeVideoByWheel(actionId: PetActionId, deltaY: number): Promise<void>;
	beginWindowMove(): Promise<void>;
	moveWindow(): Promise<void>;
	endWindowMove(): Promise<void>;
	beginWindowResize(corner: PetResizeCorner): Promise<void>;
	setWindowSize(size: number, corner?: PetResizeCorner): Promise<void>;
	setContentSize(content: number | PetContentSize): Promise<void>;
	endWindowResize(size: number): Promise<void>;
	setVideoBaseSize(actionId: PetActionId, baseSize: number): Promise<void>;
	setMousePassthrough(enabled: boolean): Promise<void>;
	setVideoHitbox(hitbox: PetVideoHitbox | undefined): Promise<void>;
};
