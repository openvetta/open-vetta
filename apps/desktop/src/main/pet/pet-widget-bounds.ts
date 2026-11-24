import type { PetContentSize } from "../../shared/pet-ipc.js";

export type PetRect = {
	x: number;
	y: number;
	width: number;
	height: number;
};

export function squarePetContent(size: number): PetContentSize {
	const edge = Math.max(1, Math.round(size));
	return { width: edge, height: edge };
}

export function normalizePetContentSize(content: number | PetContentSize): PetContentSize {
	if (typeof content === "number") return squarePetContent(content);
	return {
		width: Math.max(1, Math.ceil(content.width)),
		height: Math.max(1, Math.ceil(content.height)),
	};
}

function clampRectIntoArea(rect: PetRect, area: PetRect): PetRect {
	const maxX = area.x + Math.max(0, area.width - rect.width);
	const maxY = area.y + Math.max(0, area.height - rect.height);
	return {
		x: Math.min(Math.max(Math.round(rect.x), area.x), maxX),
		y: Math.min(Math.max(Math.round(rect.y), area.y), maxY),
		width: rect.width,
		height: rect.height,
	};
}

/**
 * 桌宠窗口与画面同尺寸，所以窗口 bounds 就是精灵的屏幕位置。
 * 期望位置先按内容尺寸换算出 rect，再夹进工作区，避免整只精灵跑到屏幕外。
 */
export function petWindowBoundsForScreen(input: {
	workArea: PetRect;
	screen: { x: number; y: number };
	content: PetContentSize;
}): PetRect {
	return clampRectIntoArea(
		{ x: input.screen.x, y: input.screen.y, width: input.content.width, height: input.content.height },
		input.workArea,
	);
}

/** 拖动锚定精灵中心：由锚点和内容尺寸反推窗口 bounds。 */
export function petWindowBoundsForAnchor(input: {
	workArea: PetRect;
	anchor: { x: number; y: number };
	content: PetContentSize;
}): PetRect {
	return petWindowBoundsForScreen({
		workArea: input.workArea,
		content: input.content,
		screen: {
			x: input.anchor.x - input.content.width / 2,
			y: input.anchor.y - input.content.height / 2,
		},
	});
}

export function initialPetVideoScreen(workArea: PetRect, size: number, margin: number): PetRect {
	const edge = Math.max(1, Math.round(size));
	return {
		x: workArea.x + workArea.width - edge - margin,
		y: workArea.y + workArea.height - edge - margin,
		width: edge,
		height: edge,
	};
}

export function videoScreenRectFromWindow(windowBounds: PetRect, hitbox: PetRect | undefined): PetRect {
	if (hitbox && hitbox.width > 0 && hitbox.height > 0) {
		return {
			x: windowBounds.x + hitbox.x,
			y: windowBounds.y + hitbox.y,
			width: hitbox.width,
			height: hitbox.height,
		};
	}
	return {
		x: windowBounds.x,
		y: windowBounds.y,
		width: windowBounds.width,
		height: windowBounds.height,
	};
}
