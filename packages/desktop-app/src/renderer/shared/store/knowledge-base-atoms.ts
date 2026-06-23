import type { KnowledgeBase, KnowledgeImportDraft } from "@shared/types/knowledge-base";
import { atom } from "jotai";

export type {
	KnowledgeBase,
	KnowledgeImportDraft,
	KnowledgeNode,
} from "@shared/types/knowledge-base";

const ACTIVE_KNOWLEDGE_BASE_STORAGE_KEY = "vetta-active-knowledge-base";

/**
 * 知识库列表：磁盘 ~/.vetta/knowledges/raws/ 是唯一真相源。
 * 仅缓存上一次从磁盘读到的快照，刷新/进页时由 refreshKnowledgeBasesAtom 重读。
 */
export const knowledgeBasesAtom = atom<KnowledgeBase[]>([]);

/** 反向重建入口：从磁盘重读全部知识库并刷新 UI。 */
export const refreshKnowledgeBasesAtom = atom(null, async (_get, set) => {
	const bases = await window.vetta.knowledge.list();
	set(knowledgeBasesAtom, bases);
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
