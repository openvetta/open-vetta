import { useSSEEvent } from "@shared/hooks/useSSEEvent";
import type { FlowingTransferVO } from "@shared/lib/api";
import { flowingPendingCountAtom, flowingPendingListAtom } from "@shared/store/atoms";
import { useSetAtom } from "jotai";
import { useCallback } from "react";

export function useFlowingSSE(): void {
	const setPendingList = useSetAtom(flowingPendingListAtom);
	const setPendingCount = useSetAtom(flowingPendingCountAtom);

	// 收到新的流转请求
	useSSEEvent(
		"flowing:incoming",
		useCallback(
			(data: unknown) => {
				const transfer = data as FlowingTransferVO;
				setPendingList((prev) => [transfer, ...prev]);
				setPendingCount((prev) => prev + 1);
			},
			[setPendingList, setPendingCount],
		),
	);

	// 对方接受了流转
	useSSEEvent(
		"flowing:accepted",
		useCallback(
			(data: unknown) => {
				const transfer = data as FlowingTransferVO;
				// 从 pending list 中移除（如果在的话）
				setPendingList((prev) => prev.filter((t) => t.id !== transfer.id));
			},
			[setPendingList],
		),
	);

	// 对方拒绝了流转
	useSSEEvent(
		"flowing:rejected",
		useCallback(
			(data: unknown) => {
				const transfer = data as FlowingTransferVO;
				setPendingList((prev) => prev.filter((t) => t.id !== transfer.id));
			},
			[setPendingList],
		),
	);
}
