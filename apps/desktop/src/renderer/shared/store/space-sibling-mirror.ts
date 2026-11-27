import type { SpaceSiblingMirrorSnapshot } from "@preload/api";
import { type SpaceState, spaceShowsSiblingProjects, spacesAtom } from "./spaces";

/**
 * 主进程推导「会话能看见哪些同空间兄弟项目」所需的最小归属（ADR-0159）。
 * 不含选中空间与各空间的上次位置，切换空间不会触发推送。
 */
export function toSpaceSiblingMirror(state: SpaceState): SpaceSiblingMirrorSnapshot {
	return {
		spaces: state.spaces.map((space) => ({ id: space.id, siblingProjects: spaceShowsSiblingProjects(space) })),
		projects: { ...state.projects },
		conversations: { ...state.conversations },
	};
}

interface MirrorStore {
	get(atom: typeof spacesAtom): SpaceState;
	sub(atom: typeof spacesAtom, listener: () => void): () => void;
}

export interface SpaceSiblingMirrorSyncOptions {
	readonly retryDelayMs?: number;
	readonly onError?: (error: unknown) => void;
}

/**
 * 把空间归属镜像推给主进程：启动时推一次，之后每次归属或开关变化再推。
 *
 * 推送串行进行，只发最新一份；内容未变不重复发送；失败后延时重试，直到成功或被更新的
 * 内容取代。Renderer 仍是空间配置的唯一写入方，主进程只读。
 */
export function syncSpaceSiblingMirror(
	store: MirrorStore,
	push: (mirror: SpaceSiblingMirrorSnapshot) => Promise<void>,
	options: SpaceSiblingMirrorSyncOptions = {},
): () => void {
	const retryDelayMs = options.retryDelayMs ?? 3_000;
	let active = true;
	let delivered: string | undefined;
	let inFlight = false;
	let retryTimer: ReturnType<typeof setTimeout> | undefined;

	const flush = (): void => {
		if (!active || inFlight) return;
		if (retryTimer !== undefined) {
			clearTimeout(retryTimer);
			retryTimer = undefined;
		}
		const mirror = toSpaceSiblingMirror(store.get(spacesAtom));
		const key = JSON.stringify(mirror);
		if (key === delivered) return;
		inFlight = true;
		push(mirror).then(
			() => {
				inFlight = false;
				delivered = key;
				flush();
			},
			(error: unknown) => {
				inFlight = false;
				options.onError?.(error);
				if (active) retryTimer = setTimeout(flush, retryDelayMs);
			},
		);
	};

	const unsubscribe = store.sub(spacesAtom, flush);
	flush();
	return () => {
		active = false;
		unsubscribe();
		if (retryTimer !== undefined) clearTimeout(retryTimer);
	};
}
