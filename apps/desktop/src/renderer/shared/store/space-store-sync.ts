import {
	type SharedSpaceData,
	type SpaceStoreSnapshot,
	type SpaceSyncRequest,
	sharedSpaceDataKey,
} from "@/shared/spaces-ipc";
import { readSpaces, type SpaceState, spacesAtom } from "./spaces";

/**
 * 工作空间的无感迁移与同步（ADR-0160）。
 *
 * 事实源是主进程的 `~/.vetta/spaces.v1.json`；`spacesAtom` 背后的 localStorage 保持原键原结构，
 * 作为首帧同步读取的缓存，也让降级后的旧版本看到最新分组。选中空间与各空间上次位置只属于
 * 本应用，不进入共享存储。
 */

const SOURCE_ID_KEY = "vetta.desktop-spaces.source-id";
const SYNCED_KEY = "vetta.desktop-spaces.synced.v1";

export interface SpaceStorePort {
	sync(request: SpaceSyncRequest): Promise<SpaceStoreSnapshot>;
	save(data: SharedSpaceData): Promise<SpaceStoreSnapshot>;
	onChanged(handler: (snapshot: SpaceStoreSnapshot) => void): () => void;
}

interface SpacesStore {
	get(atom: typeof spacesAtom): SpaceState;
	set(atom: typeof spacesAtom, value: SpaceState): void;
	sub(atom: typeof spacesAtom, listener: () => void): () => void;
}

export interface SpaceStoreSyncOptions {
	readonly storage?: Pick<Storage, "getItem" | "setItem">;
	readonly retryDelayMs?: number;
	readonly createId?: () => string;
	readonly onError?: (error: unknown) => void;
}

/** 共享部分：空间与归属。 */
export function sharedSpacePart(state: SpaceState): SharedSpaceData {
	return {
		spaces: state.spaces.map((space) => ({
			id: space.id,
			name: space.name,
			icon: { kind: space.icon.kind, value: space.icon.value },
			...(space.siblingProjects === false ? { siblingProjects: false } : {}),
		})),
		projects: { ...state.projects },
		conversations: { ...state.conversations },
	};
}

/** 把共享数据套进本地状态，保留本应用的选中空间与上次位置（失效的由 readSpaces 清理）。 */
export function applySharedSpaceData(state: SpaceState, data: SharedSpaceData): SpaceState {
	return readSpaces({
		spaces: data.spaces,
		projects: data.projects,
		conversations: data.conversations,
		selected: state.selected,
		locations: state.locations,
	});
}

/** 短哈希：只用来判断「本地自上次同步后是否被改过」，不需要抗碰撞。 */
function fingerprint(value: string): string {
	let h1 = 0xdeadbeef;
	let h2 = 0x41c6ce57;
	for (let index = 0; index < value.length; index += 1) {
		const code = value.charCodeAt(index);
		h1 = Math.imul(h1 ^ code, 2654435761);
		h2 = Math.imul(h2 ^ code, 1597334677);
	}
	h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
	return `${(h2 >>> 0).toString(16)}${(h1 >>> 0).toString(16)}:${value.length}`;
}

function safeGet(storage: SpaceStoreSyncOptions["storage"], key: string): string | null {
	try {
		return storage?.getItem(key) ?? null;
	} catch {
		return null;
	}
}

function safeSet(storage: SpaceStoreSyncOptions["storage"], key: string, value: string): void {
	try {
		storage?.setItem(key, value);
	} catch {
		// 存不下只会让下次启动多判一次「本地被改过」，以本地为准，不丢数据。
	}
}

/**
 * 启动握手 + 运行期双向同步。
 *
 * - 握手前后界面都只读本地缓存，首帧不闪；握手期间的本地改动以本地为准补交。
 * - 运行期改动变化即保存（IPC 按序投递，主进程串行写入）；收到的广播在本地仍有未完成的
 *   保存时忽略，避免旧结果把刚做的修改闪回。
 * - 任何失败只记日志并延时重试，界面照常可用。
 */
export function startSpaceStoreSync(
	store: SpacesStore,
	port: SpaceStorePort,
	options: SpaceStoreSyncOptions = {},
): () => void {
	const storage = options.storage ?? (typeof localStorage === "undefined" ? undefined : localStorage);
	const retryDelayMs = options.retryDelayMs ?? 3_000;
	let active = true;
	let phase: "handshake" | "live" | "read-only" = "handshake";
	let confirmedKey: string | undefined;
	let pendingSaves = 0;
	let saveSequence = 0;
	let retryTimer: ReturnType<typeof setTimeout> | undefined;

	const sourceId = (() => {
		const existing = safeGet(storage, SOURCE_ID_KEY);
		if (existing) return existing;
		const created = options.createId?.() ?? crypto.randomUUID();
		safeSet(storage, SOURCE_ID_KEY, created);
		return created;
	})();

	const localData = (): SharedSpaceData => sharedSpacePart(store.get(spacesAtom));

	/** 主进程确认了这份内容：记下来，并在与本地不同时套进本地。 */
	const adopt = (data: SharedSpaceData): void => {
		const current = store.get(spacesAtom);
		const next = applySharedSpaceData(current, data);
		const key = sharedSpaceDataKey(sharedSpacePart(next));
		confirmedKey = key;
		safeSet(storage, SYNCED_KEY, fingerprint(key));
		if (sharedSpaceDataKey(sharedSpacePart(current)) !== key) store.set(spacesAtom, next);
	};

	const scheduleRetry = (run: () => void): void => {
		if (!active || retryTimer !== undefined) return;
		retryTimer = setTimeout(() => {
			retryTimer = undefined;
			run();
		}, retryDelayMs);
	};

	const save = (): void => {
		if (!active || phase !== "live") return;
		const data = localData();
		const key = sharedSpaceDataKey(data);
		if (key === confirmedKey) return;
		const sequence = ++saveSequence;
		pendingSaves += 1;
		port.save(data).then(
			(snapshot) => {
				pendingSaves -= 1;
				if (!active) return;
				if (snapshot.readOnly) {
					phase = "read-only";
					return;
				}
				// 只有最后一次保存的结果代表当前状态；更早的结果会把刚做的修改闪回。
				if (sequence === saveSequence) adopt(snapshot.data);
			},
			(error: unknown) => {
				pendingSaves -= 1;
				options.onError?.(error);
				if (sequence === saveSequence) scheduleRetry(save);
			},
		);
	};

	const handshake = (): void => {
		if (!active) return;
		const local = localData();
		const localKey = sharedSpaceDataKey(local);
		const synced = safeGet(storage, SYNCED_KEY);
		const localDirty = synced !== null && synced !== fingerprint(localKey);
		port.sync({ sourceId, local, localDirty }).then(
			(snapshot) => {
				if (!active) return;
				if (snapshot.readOnly) {
					// 共享文件来自更新的版本：继续只用本地缓存，不覆盖它。
					phase = "read-only";
					return;
				}
				phase = "live";
				if (sharedSpaceDataKey(localData()) !== localKey) {
					// 握手期间用户又改了：主进程已收下握手时的版本，再把最新的本地补交上去。
					confirmedKey = sharedSpaceDataKey(snapshot.data);
					save();
					return;
				}
				adopt(snapshot.data);
			},
			(error: unknown) => {
				options.onError?.(error);
				scheduleRetry(handshake);
			},
		);
	};

	const unsubscribeChanged = port.onChanged((snapshot) => {
		if (!active || phase !== "live" || pendingSaves > 0 || snapshot.readOnly) return;
		adopt(snapshot.data);
	});
	const unsubscribeLocal = store.sub(spacesAtom, save);
	handshake();

	return () => {
		active = false;
		unsubscribeChanged();
		unsubscribeLocal();
		if (retryTimer !== undefined) clearTimeout(retryTimer);
	};
}
