import { atom } from "jotai";
import type { ExecutionModeOverride, SelectedSkill, SessionExecutionMode } from "./chat-atoms";

export interface ScheduledTask {
	id: string;
	name: string;
	prompt: string;
	cron: string;
	/** Whether this task runs only once and disables itself after execution */
	isOnce: boolean;
	enabled: boolean;
	/** Project working directory this task is associated with */
	cwd: string;
	modelKey?: string;
	executionMode?: ExecutionModeOverride;
	/** 任务级技能/场景。运行时主进程会在 prompt 前注入 `/skill:` 或 `/scene:` 行。 */
	skill?: SelectedSkill;
	createdAt: number;
	updatedAt: number;
	lastRunAt: number | null;
	lastRunStatus: "success" | "failed" | null;
}

export interface TaskExecutionRecord {
	id: string;
	taskId: string;
	sessionId: string;
	/** Session file path for navigating to the conversation */
	sessionPath?: string;
	/** Project working directory */
	cwd?: string;
	startedAt: number;
	completedAt: number | null;
	status: "running" | "success" | "failed" | "aborted";
	prompt: string;
	responsePreview: string;
	error?: string;
	durationMs?: number;
	executionMode?: SessionExecutionMode;
}

export const scheduledTasksAtom = atom<ScheduledTask[]>([]);
export const selectedTaskIdAtom = atom<string | null>(null);
export const selectedRecordIdAtom = atom<string | null>(null);
export const formOpenAtom = atom<ScheduledTask | null | undefined>(undefined);
