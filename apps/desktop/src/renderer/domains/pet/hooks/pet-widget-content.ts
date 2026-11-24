import type { PetContentSize, PetVideoHitbox } from "../../../../shared/pet-ipc";

export function clientRectToHitbox(
	rect: { left: number; top: number; right: number; bottom: number },
	viewport: { width: number; height: number },
): PetVideoHitbox | undefined {
	const left = Math.max(0, rect.left);
	const top = Math.max(0, rect.top);
	const right = Math.min(viewport.width, rect.right);
	const bottom = Math.min(viewport.height, rect.bottom);
	if (right <= left || bottom <= top) return undefined;
	return {
		x: left,
		y: top,
		width: right - left,
		height: bottom - top,
	};
}

/** 上报给主进程的内容尺寸：桌宠窗口始终贴合这块内容。 */
export function measurePetContentSize(shell: { width: number; height: number }): PetContentSize {
	return {
		width: Math.max(1, Math.ceil(shell.width)),
		height: Math.max(1, Math.ceil(shell.height)),
	};
}

export function samePetHitbox(left?: PetVideoHitbox, right?: PetVideoHitbox): boolean {
	if (left === right) return true;
	if (!left || !right) return false;
	return left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height;
}

export function samePetContentSize(left?: PetContentSize, right?: PetContentSize): boolean {
	if (left === right) return true;
	if (!left || !right) return false;
	return left.width === right.width && left.height === right.height;
}
