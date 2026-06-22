import type { KnowledgeBase, KnowledgeImportDraft, KnowledgeNode } from "@shared/types/knowledge-base";
import { atom } from "jotai";

export type {
	KnowledgeBase,
	KnowledgeImportDraft,
	KnowledgeImportItem,
	KnowledgeNode,
} from "@shared/types/knowledge-base";

const KNOWLEDGE_BASES_STORAGE_KEY = "vetta-knowledge-bases-ui";
const ACTIVE_KNOWLEDGE_BASE_STORAGE_KEY = "vetta-active-knowledge-base";

function readKnowledgeBases(): KnowledgeBase[] {
	try {
		const raw = localStorage.getItem(KNOWLEDGE_BASES_STORAGE_KEY);
		if (!raw) return [];
		const parsed: unknown = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed.filter(isKnowledgeBase) : [];
	} catch {
		return [];
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object";
}

function isKnowledgeNode(value: unknown): value is KnowledgeNode {
	if (!isRecord(value)) return false;
	if (typeof value.id !== "string" || typeof value.name !== "string") return false;
	if (value.type !== "directory" && value.type !== "file") return false;
	if (value.size !== undefined && typeof value.size !== "number") return false;
	if (value.sourcePath !== undefined && typeof value.sourcePath !== "string") return false;
	if (value.children !== undefined) {
		if (!Array.isArray(value.children) || !value.children.every(isKnowledgeNode)) return false;
	}
	return true;
}

function isKnowledgeBase(value: unknown): value is KnowledgeBase {
	return (
		isRecord(value) &&
		typeof value.id === "string" &&
		typeof value.name === "string" &&
		typeof value.description === "string" &&
		typeof value.updatedAt === "number" &&
		Array.isArray(value.nodes) &&
		value.nodes.every(isKnowledgeNode)
	);
}

const knowledgeBasesBaseAtom = atom<KnowledgeBase[]>(readKnowledgeBases());

/**
 * UI 原型期间使用 localStorage 保持多知识库与目录展示不受刷新影响。
 * TODO(knowledge-base-integration): 后端知识库服务接入后，替换为服务端列表与文件树，
 * localStorage 仅保留当前知识库、展开目录等纯 UI 偏好。
 */
export const knowledgeBasesAtom = atom(
	(get) => get(knowledgeBasesBaseAtom),
	(_get, set, next: KnowledgeBase[] | ((current: KnowledgeBase[]) => KnowledgeBase[])) => {
		set(knowledgeBasesBaseAtom, (current) => {
			const value = typeof next === "function" ? next(current) : next;
			localStorage.setItem(KNOWLEDGE_BASES_STORAGE_KEY, JSON.stringify(value));
			return value;
		});
	},
);

const initialActiveKnowledgeBaseId = localStorage.getItem(ACTIVE_KNOWLEDGE_BASE_STORAGE_KEY);
const activeKnowledgeBaseIdBaseAtom = atom<string | null>(initialActiveKnowledgeBaseId);

export const activeKnowledgeBaseIdAtom = atom(
	(get) => {
		const bases = get(knowledgeBasesBaseAtom);
		const remembered = get(activeKnowledgeBaseIdBaseAtom);
		if (remembered && bases.some((base) => base.id === remembered)) return remembered;
		return bases[0]?.id ?? null;
	},
	(_get, set, id: string | null) => {
		set(activeKnowledgeBaseIdBaseAtom, id);
		if (id) {
			localStorage.setItem(ACTIVE_KNOWLEDGE_BASE_STORAGE_KEY, id);
		} else {
			localStorage.removeItem(ACTIVE_KNOWLEDGE_BASE_STORAGE_KEY);
		}
	},
);

/** 全局拖拽与页面文件选择器共用的“智能整理预览”草稿。 */
export const knowledgeImportDraftAtom = atom<KnowledgeImportDraft | null>(null);
