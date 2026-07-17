import { atom } from "jotai";

/** Mirrors runtime-core SubagentInfo / coding-agent SubagentSnapshot. */
export interface SubagentTask {
	id: string;
	taskName: string;
	path: string;
	agentType: string;
	status: "pending" | "running" | "completed" | "failed" | "interrupted";
	task: string;
	parentSessionId: string;
	sessionFile?: string;
	startedAt: number;
	endedAt?: number;
	finalText?: string;
	errorMessage?: string;
	generation: number;
}

/**
 * Subagent children for the root session.
 * Driven by subagents_update full snapshots, keyed by sessionId.
 */
export const subagentsBySessionAtom = atom<Map<string, SubagentTask[]>>(new Map());

export function getSubagentsForSession(
	map: Map<string, SubagentTask[]>,
	sessionId: string | null | undefined,
): SubagentTask[] {
	if (!sessionId) return [];
	return map.get(sessionId) ?? [];
}

export function isSubagentActive(status: SubagentTask["status"]): boolean {
	return status === "pending" || status === "running";
}
