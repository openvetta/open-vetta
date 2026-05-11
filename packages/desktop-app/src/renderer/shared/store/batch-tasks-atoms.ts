import { atom } from "jotai";
import type { ExecutionModeOverride, SessionExecutionMode } from "./chat-atoms";

export type BatchTaskStatus = "pending" | "running" | "paused" | "completed" | "failed";

export interface BatchTask {
	id: string;
	name: string;
	cwd: string;
	sourcePath: string;
	status: BatchTaskStatus;
	sessionId?: string;
	sessionPath?: string;
	executionMode?: SessionExecutionMode;
	error?: string;
	createdAt: number;
	updatedAt: number;
}

export interface BatchProject {
	id: string;
	name: string;
	prompt: string;
	/** Project-level model key in "provider/modelId" format */
	modelKey?: string;
	executionMode?: ExecutionModeOverride;
	concurrency: number;
	artifactPatterns?: string[];
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

export interface BatchTaskState {
	taskId: string;
	status: BatchTaskStatus;
	sessionId?: string;
	sessionPath?: string;
	executionMode?: SessionExecutionMode;
	error?: string;
	startedAt?: number;
	completedAt?: number;
	lastModified: number;
}

export const batchProjectsAtom = atom<BatchProject[]>([]);
export const batchSessionsMapAtom = atom<Map<string, BatchSession[]>>(new Map());
export const selectedBatchProjectIdAtom = atom<string | null>(null);
export const selectedBatchTaskIdAtom = atom<string | null>(null);
export const batchProjectDialogOpenAtom = atom<BatchProject | null | undefined>(undefined);
export const expandedBatchProjectsAtom = atom<Set<string>>(new Set<string>());
export const batchProjectsOffsetAtom = atom<number>(0);
export const batchProjectsHasMoreAtom = atom<boolean>(true);
export const batchTaskStatesAtom = atom<Record<string, Record<string, BatchTaskState>>>({});
