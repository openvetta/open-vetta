import type { KnowledgeBase, KnowledgeFileStatus, KnowledgeImportDraft } from "@shared/types/knowledge-base";
import { atom } from "jotai";

export type {
	KnowledgeBase,
	KnowledgeFileStatus,
	KnowledgeImportDraft,
	KnowledgeNode,
	KnowledgeProcessStatus,
} from "@shared/types/knowledge-base";

const ACTIVE_KNOWLEDGE_BASE_STORAGE_KEY = "vetta-active-knowledge-base";
const KNOWLEDGE_VIEW_MODE_STORAGE_KEY = "vetta-knowledge-view-mode";

/** 文件区视图：宫格 / 列表。 */
export type KnowledgeViewMode = "grid" | "list";

/**
 * 知识库列表：磁盘 ~/.vetta/knowledges/raws/ 是唯一真相源。
 * 仅缓存上一次从磁盘读到的快照，刷新/进页时由 refreshKnowledgeBasesAtom 重读。
 */
export const knowledgeBasesAtom = atom<KnowledgeBase[]>([]);

/**
 * 文件加工态：按 source_path（`${kbId}/${node.id}`）索引，由 manifest + raws hash 推导。
 * 与知识库列表同源刷新。
 */
export const knowledgeFileStatusesAtom = atom<Record<string, KnowledgeFileStatus>>({});

/**
 * 首次加载中：仅当尚无任何缓存（首次进页）时用于骨架屏。
 * 刷新已有数据时保持旧快照、不显示骨架，避免闪烁。
 */
export const knowledgeLoadingAtom = atom(false);

/**
 * 反向重建入口：从磁盘重读全部知识库与加工态并刷新 UI。
 * 文件列表先出（list 返回即渲染），加工态角标随后填充——加工态扫描较慢，
 * 不阻塞列表渲染，避免「空屏等两个请求都回来」。
 */
export const refreshKnowledgeBasesAtom = atom(null, async (_get, set) => {
	set(knowledgeLoadingAtom, true);
	try {
		set(knowledgeBasesAtom, await window.vetta.knowledge.list());
	} finally {
		set(knowledgeLoadingAtom, false);
	}
	void window.vetta.knowledge
		.fileStatuses()
		.then((statuses) => set(knowledgeFileStatusesAtom, statuses))
		.catch(() => {});
});

const activeKnowledgeBaseIdBaseAtom = atom<string | null>(localStorage.getItem(ACTIVE_KNOWLEDGE_BASE_STORAGE_KEY));

/** 当前选中知识库 id（纯 UI 偏好，存 localStorage）。 */
export const activeKnowledgeBaseIdAtom = atom(
	(get) => {
		const bases = get(knowledgeBasesAtom);
		const remembered = get(activeKnowledgeBaseIdBaseAtom);
		if (remembered && bases.some((base) => base.id === remembered)) return remembered;
		return bases[0]?.id ?? null;
	},
	(_get, set, id: string | null) => {
		set(activeKnowledgeBaseIdBaseAtom, id);
		if (id) localStorage.setItem(ACTIVE_KNOWLEDGE_BASE_STORAGE_KEY, id);
		else localStorage.removeItem(ACTIVE_KNOWLEDGE_BASE_STORAGE_KEY);
	},
);

/** 待导入草稿（拖入/选择文件或仅创建库）。 */
export const knowledgeImportDraftAtom = atom<KnowledgeImportDraft | null>(null);

/**
 * 一次性跳转目标：「待加工文件」弹窗点击某项时写入，KnowledgeContentsPanel 消费后清空。
 * fileId 为相对 raws/<kb>/ 的 posix 路径（= KnowledgeNode.id），用于定位所在目录并高亮滚动。
 */
export const knowledgeNavTargetAtom = atom<{ fileId: string } | null>(null);

const knowledgeViewModeBaseAtom = atom<KnowledgeViewMode>(
	localStorage.getItem(KNOWLEDGE_VIEW_MODE_STORAGE_KEY) === "list" ? "list" : "grid",
);

/** 文件区视图偏好（纯 UI 偏好，存 localStorage）。 */
export const knowledgeViewModeAtom = atom(
	(get) => get(knowledgeViewModeBaseAtom),
	(_get, set, mode: KnowledgeViewMode) => {
		set(knowledgeViewModeBaseAtom, mode);
		localStorage.setItem(KNOWLEDGE_VIEW_MODE_STORAGE_KEY, mode);
	},
);
