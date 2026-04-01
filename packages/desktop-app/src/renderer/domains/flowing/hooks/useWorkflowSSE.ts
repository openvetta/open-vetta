import { useSSEEvent } from "@shared/hooks/useSSEEvent";
import type { WorkflowInstance } from "@shared/lib/api";
import { workflowInstanceAtom } from "@shared/store/atoms";
import { useSetAtom } from "jotai";
import { useCallback } from "react";

export function useWorkflowSSE(): void {
	const setInstance = useSetAtom(workflowInstanceAtom);

	// 工作流启动
	useSSEEvent(
		"workflow:started",
		useCallback(
			(data: unknown) => {
				setInstance(data as WorkflowInstance);
			},
			[setInstance],
		),
	);

	// 进入新阶段
	useSSEEvent(
		"workflow:stage_entered",
		useCallback(
			(data: unknown) => {
				setInstance(data as WorkflowInstance);
			},
			[setInstance],
		),
	);

	// 阶段被退回
	useSSEEvent(
		"workflow:returned",
		useCallback(
			(data: unknown) => {
				setInstance(data as WorkflowInstance);
			},
			[setInstance],
		),
	);

	// 完成被撤回
	useSSEEvent(
		"workflow:revoked",
		useCallback(
			(data: unknown) => {
				setInstance(data as WorkflowInstance);
			},
			[setInstance],
		),
	);

	// 工作流完成
	useSSEEvent(
		"workflow:completed",
		useCallback(
			(data: unknown) => {
				setInstance(data as WorkflowInstance);
			},
			[setInstance],
		),
	);

	// 工作流终止
	useSSEEvent(
		"workflow:terminated",
		useCallback(
			(data: unknown) => {
				setInstance(data as WorkflowInstance);
			},
			[setInstance],
		),
	);
}
