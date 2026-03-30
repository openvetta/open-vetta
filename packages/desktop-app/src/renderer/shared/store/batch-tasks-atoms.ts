import { atom } from "jotai";

export type BatchTaskStatus = "pending" | "running" | "paused" | "completed" | "failed";

export interface BatchTask {
	id: string;
	name: string;
	prompt: string;
	cwd: string;
	status: BatchTaskStatus;
	sessionId?: string;
	sessionPath?: string;
	progress?: number;
	error?: string;
	createdAt: number;
	updatedAt: number;
}

export interface BatchProject {
	id: string;
	name: string;
	prompt: string;
	tasks: BatchTask[];
	createdAt: number;
	updatedAt: number;
}

export interface BatchSession {
	id: string;
	projectId: string;
	taskId: string;
	path: string;
	name: string;
	firstMessage: string;
	modifiedAt: number;
}

export const batchProjectsAtom = atom<BatchProject[]>([]);
export const batchSessionsMapAtom = atom<Map<string, BatchSession[]>>(new Map());
export const selectedBatchProjectIdAtom = atom<string | null>(null);
export const selectedBatchTaskIdAtom = atom<string | null>(null);
export const batchProjectDialogOpenAtom = atom<BatchProject | null | undefined>(undefined);
export const expandedBatchProjectsAtom = atom<Set<string>>(new Set<string>());
