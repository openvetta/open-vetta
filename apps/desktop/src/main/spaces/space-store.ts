import {
	type SharedSpaceData,
	type SpaceStoreSnapshot,
	type SpaceSyncRequest,
	type StoredSpace,
	sharedSpaceDataKey,
} from "../../shared/spaces-ipc.js";

export { sharedSpaceDataKey };

/**
 * 工作空间存储（ADR-0160）：`~/.vetta/spaces.v1.json` 的唯一写入方。
 *
 * - 所有读写串行进行，内容未变不写盘、不广播；
 * - 启动握手（{@link SpaceStore.sync}）裁决导入 / 合并 / 以本地为准 / 以文件为准；
 * - 文件来自更新的版本时只读，绝不覆盖；文件损坏时先备份再按「不存在」处理。
 */

export const SPACE_STORE_SCHEMA_VERSION = 1;
const MAIN_SPACE = "main";

export interface SpaceStoreFileIo {
	/** 文件不存在时返回 `undefined`。 */
	read(): Promise<string | undefined>;
	/** 原子写入。 */
	write(content: string): Promise<void>;
	/** 把损坏的文件挪到旁边留档。 */
	backupCorrupt(content: string): Promise<void>;
}

export interface SpaceStoreLogger {
	warn(message: string, details?: unknown): void;
}

export interface SpaceStoreOptions {
	readonly io: SpaceStoreFileIo;
	readonly onChanged?: (snapshot: SpaceStoreSnapshot) => void;
	readonly log?: SpaceStoreLogger;
}

interface StoreDocument {
	readonly schemaVersion: number;
	readonly revision: number;
	readonly data: SharedSpaceData;
	readonly importedSources: readonly string[];
}

type LoadedState =
	| { readonly kind: "absent" }
	| { readonly kind: "ready"; readonly document: StoreDocument }
	/** 来自更新版本的文件：保留原样、不写入。 */
	| { readonly kind: "future"; readonly raw: string };

export const EMPTY_SHARED_SPACE_DATA: SharedSpaceData = Object.freeze({
	spaces: Object.freeze([]),
	projects: Object.freeze({}),
	conversations: Object.freeze({}),
});

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function defineEntry(target: Record<string, string>, key: string, value: string): void {
	Object.defineProperty(target, key, { value, enumerable: true, configurable: true, writable: true });
}

/** 结构校验 + 清洗：坏条目逐条丢弃；归属只保留指向现存自定义空间的。图标名是否认识由 Renderer 判断。 */
export function sanitizeSharedSpaceData(value: unknown): SharedSpaceData {
	if (!isRecord(value)) return EMPTY_SHARED_SPACE_DATA;
	const spaces: StoredSpace[] = [];
	const ids = new Set<string>();
	for (const item of Array.isArray(value.spaces) ? value.spaces : []) {
		if (!isRecord(item)) continue;
		const { id, name, icon } = item;
		if (typeof id !== "string" || !id || id === MAIN_SPACE || ids.has(id)) continue;
		if (typeof name !== "string" || !name.trim()) continue;
		if (!isRecord(icon) || typeof icon.kind !== "string" || typeof icon.value !== "string") continue;
		ids.add(id);
		spaces.push({
			id,
			name,
			icon: { kind: icon.kind, value: icon.value },
			...(item.siblingProjects === false ? { siblingProjects: false } : {}),
		});
	}
	const memberships = (entries: unknown): Record<string, string> => {
		const result: Record<string, string> = {};
		if (!isRecord(entries)) return result;
		for (const [key, spaceId] of Object.entries(entries)) {
			if (key && typeof spaceId === "string" && ids.has(spaceId)) defineEntry(result, key, spaceId);
		}
		return result;
	};
	return { spaces, projects: memberships(value.projects), conversations: memberships(value.conversations) };
}

/**
 * 把 `incoming` 并入 `base`：空间按 id 取并集（base 的顺序在前），归属冲突以 base 为准。
 */
export function mergeSharedSpaceData(base: SharedSpaceData, incoming: SharedSpaceData): SharedSpaceData {
	const ids = new Set(base.spaces.map(({ id }) => id));
	const spaces = [...base.spaces, ...incoming.spaces.filter(({ id }) => !ids.has(id))];
	const merge = (left: Readonly<Record<string, string>>, right: Readonly<Record<string, string>>) => {
		const result: Record<string, string> = {};
		for (const [key, value] of Object.entries(right)) defineEntry(result, key, value);
		for (const [key, value] of Object.entries(left)) defineEntry(result, key, value);
		return result;
	};
	return sanitizeSharedSpaceData({
		spaces,
		projects: merge(base.projects, incoming.projects),
		conversations: merge(base.conversations, incoming.conversations),
	});
}

function parseDocument(raw: string): LoadedState | "corrupt" {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return "corrupt";
	}
	if (!isRecord(parsed) || typeof parsed.schemaVersion !== "number") return "corrupt";
	if (parsed.schemaVersion > SPACE_STORE_SCHEMA_VERSION) return { kind: "future", raw };
	if (parsed.schemaVersion !== SPACE_STORE_SCHEMA_VERSION) return "corrupt";
	const sources = Array.isArray(parsed.importedSources)
		? parsed.importedSources.filter((source): source is string => typeof source === "string" && source.length > 0)
		: [];
	return {
		kind: "ready",
		document: {
			schemaVersion: SPACE_STORE_SCHEMA_VERSION,
			revision: typeof parsed.revision === "number" && Number.isFinite(parsed.revision) ? parsed.revision : 0,
			data: sanitizeSharedSpaceData(parsed.data),
			importedSources: [...new Set(sources)],
		},
	};
}

function snapshotOf(document: StoreDocument): SpaceStoreSnapshot {
	return { revision: document.revision, data: document.data };
}

export class SpaceStore {
	private state: LoadedState | undefined;
	private tail: Promise<unknown> = Promise.resolve();

	constructor(private readonly options: SpaceStoreOptions) {}

	/** 当前快照；文件不存在时为空数据。 */
	read(): Promise<SpaceStoreSnapshot> {
		return this.enqueue(async () => {
			const state = await this.load();
			if (state.kind === "ready") return snapshotOf(state.document);
			return { revision: 0, data: EMPTY_SHARED_SPACE_DATA, ...(state.kind === "future" ? { readOnly: true } : {}) };
		});
	}

	/** 启动握手：见 ADR-0160 决策 3。 */
	sync(request: SpaceSyncRequest): Promise<SpaceStoreSnapshot> {
		return this.enqueue(async () => {
			const local = sanitizeSharedSpaceData(request.local);
			const state = await this.load();
			if (state.kind === "future") {
				this.options.log?.warn("space store was written by a newer version; keeping it read-only");
				return { revision: 0, data: local, readOnly: true };
			}
			if (state.kind === "absent") {
				return this.commit(undefined, local, [request.sourceId]);
			}
			const current = state.document;
			if (!current.importedSources.includes(request.sourceId)) {
				return this.commit(current, mergeSharedSpaceData(current.data, local), [
					...current.importedSources,
					request.sourceId,
				]);
			}
			if (request.localDirty) return this.commit(current, local, current.importedSources);
			return snapshotOf(current);
		});
	}

	/** 运行期保存：整份替换共享数据。 */
	save(data: SharedSpaceData): Promise<SpaceStoreSnapshot> {
		return this.enqueue(async () => {
			const next = sanitizeSharedSpaceData(data);
			const state = await this.load();
			if (state.kind === "future") return { revision: 0, data: next, readOnly: true };
			return this.commit(state.kind === "ready" ? state.document : undefined, next, undefined);
		});
	}

	/** 文件被别的进程改写后重新读取；内容确有变化才广播。 */
	reloadFromDisk(): Promise<void> {
		return this.enqueue(async () => {
			const previous = this.state;
			this.state = undefined;
			const next = await this.load();
			if (next.kind !== "ready") return;
			const before = previous?.kind === "ready" ? sharedSpaceDataKey(previous.document.data) : undefined;
			if (before !== sharedSpaceDataKey(next.document.data)) this.notify(snapshotOf(next.document));
		});
	}

	private async commit(
		current: StoreDocument | undefined,
		data: SharedSpaceData,
		importedSources: readonly string[] | undefined,
	): Promise<SpaceStoreSnapshot> {
		const sources = importedSources ?? current?.importedSources ?? [];
		const unchanged =
			current !== undefined &&
			sharedSpaceDataKey(current.data) === sharedSpaceDataKey(data) &&
			current.importedSources.length === sources.length;
		if (unchanged) return snapshotOf(current);
		const document: StoreDocument = {
			schemaVersion: SPACE_STORE_SCHEMA_VERSION,
			revision: (current?.revision ?? 0) + 1,
			data,
			importedSources: sources,
		};
		await this.options.io.write(`${JSON.stringify(document, null, "\t")}\n`);
		this.state = { kind: "ready", document };
		const snapshot = snapshotOf(document);
		if (!current || sharedSpaceDataKey(current.data) !== sharedSpaceDataKey(data)) this.notify(snapshot);
		return snapshot;
	}

	private notify(snapshot: SpaceStoreSnapshot): void {
		try {
			this.options.onChanged?.(snapshot);
		} catch (error) {
			this.options.log?.warn("space store change listener failed", error);
		}
	}

	private async load(): Promise<LoadedState> {
		if (this.state) return this.state;
		const raw = await this.options.io.read();
		if (raw === undefined) {
			this.state = { kind: "absent" };
			return this.state;
		}
		const parsed = parseDocument(raw);
		if (parsed === "corrupt") {
			this.options.log?.warn("space store file is corrupt; backing it up and starting over");
			await this.options.io.backupCorrupt(raw).catch((error: unknown) => {
				this.options.log?.warn("failed to back up corrupt space store", error);
			});
			this.state = { kind: "absent" };
			return this.state;
		}
		this.state = parsed;
		return parsed;
	}

	private enqueue<T>(operation: () => Promise<T>): Promise<T> {
		const run = this.tail.then(operation, operation);
		this.tail = run.catch(() => undefined);
		return run;
	}
}
