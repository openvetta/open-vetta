import { authTokenAtom, workflowInstanceAtom } from "@shared/store/atoms";
import { fetchFlowingHistory } from "@shared/lib/api";
import type { FlowingWorkflowViewProps } from "@vetta/theme-ui/flowing";
import { useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { FlowGraph, type FlowingHistoryNode } from "../components/flow-graph";

export function useFlowingWorkflowModel(flowingId: number): FlowingWorkflowViewProps | null {
	const token = useAtomValue(authTokenAtom);
	const workflowInstance = useAtomValue(workflowInstanceAtom);
	const [history, setHistory] = useState<FlowingHistoryNode[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!token) return;
		setLoading(true);
		setError(null);
		fetchFlowingHistory(token, flowingId)
			.then((data) => {
				setHistory(data.history as FlowingHistoryNode[]);
			})
			.catch((err) => {
				setError(err instanceof Error ? err.message : "加载流转历程失败");
			})
			.finally(() => setLoading(false));
	}, [token, flowingId]);

	if (!token) return null;

	return {
		labels: {
			title: "流转历程",
			errorFallback: "加载流转历程失败",
			empty: "暂无传输记录",
		},
		loading,
		error,
		empty: history.length === 0,
		graph: <FlowGraph history={history} workflowInstance={workflowInstance} />,
	};
}
