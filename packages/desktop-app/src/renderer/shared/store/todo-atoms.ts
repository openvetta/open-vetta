import { atom } from "jotai";

export interface TodoItem {
	id: number;
	content: string;
	status: "pending" | "in_progress" | "done";
}

/**
 * 当前会话的 todo 列表。
 * 由后端 todo_update 事件驱动更新，按项目 cwd 隔离。
 * Map<cwd, TodoItem[]>
 */
export const todoItemsByCwdAtom = atom<Map<string, TodoItem[]>>(new Map());

/**
 * 派生原子：当前项目是否有 todo items。
 * 用于控制活动面板 tab 的动态显示。
 */
export function getTodoItemsForCwd(map: Map<string, TodoItem[]>, cwd: string | null): TodoItem[] {
	if (!cwd) return [];
	return map.get(cwd) ?? [];
}
