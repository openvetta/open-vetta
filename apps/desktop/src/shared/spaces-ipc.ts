/**
 * 工作空间存储的 IPC 合同（ADR-0160）。
 *
 * 空间与归属由主进程持有在 `~/.vetta/spaces.v1.json`；Renderer 的 localStorage 只是同形缓存
 * 与界面状态（选中空间、各空间上次位置）。这里只放两侧都要用的类型与通道名。
 */

export interface StoredSpaceIcon {
	readonly kind: string;
	readonly value: string;
}

export interface StoredSpace {
	readonly id: string;
	readonly name: string;
	readonly icon: StoredSpaceIcon;
	/** 只有明确关闭时才为 `false`；缺省视为开启（ADR-0159）。 */
	readonly siblingProjects?: boolean;
}

/** 跨安装共享的空间数据：不含选中空间与上次位置。 */
export interface SharedSpaceData {
	readonly spaces: readonly StoredSpace[];
	/** 项目路径 → 空间 id。 */
	readonly projects: Readonly<Record<string, string>>;
	/** 独立会话文件路径或独立 Team 会话 id → 空间 id。 */
	readonly conversations: Readonly<Record<string, string>>;
}

export interface SpaceStoreSnapshot {
	/** 每次写入递增；仅用于诊断，不参与冲突裁决。 */
	readonly revision: number;
	readonly data: SharedSpaceData;
	/** 文件来自更新的版本、无法安全写入时为 true；Renderer 此时继续只用本地缓存。 */
	readonly readOnly?: boolean;
}

/** 启动握手：主进程据此决定导入、合并、以本地为准还是以文件为准。 */
export interface SpaceSyncRequest {
	/** 本 userData 的稳定随机 id，用来记住「这份本地数据是否已经导入过当前文件」。 */
	readonly sourceId: string;
	readonly local: SharedSpaceData;
	/** 本地在同步之外被改过（降级期间、主进程不可用时）。 */
	readonly localDirty: boolean;
}

export const SPACES_CHANNELS = {
	SYNC: "vetta:spaces:sync",
	SAVE: "vetta:spaces:save",
	/** main → renderer：载荷为 {@link SpaceStoreSnapshot}。 */
	CHANGED: "vetta:spaces:changed",
} as const;
