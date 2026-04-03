import { useEffect, useState } from "react";
import { useAtomValue } from "jotai";
import { authTokenAtom, workflowInstanceAtom } from "@shared/store/atoms";
import { fetchFlowingHistory } from "@shared/lib/api";
import { FlowGraph, type FlowingHistoryNode } from "./flow-graph";

type FlowingWorkflowProps = {
	flowingId: number;
};

export function FlowingWorkflow({ flowingId }: FlowingWorkflowProps) {
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

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center gap-2.5">
				<div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/60">
					<span className="icon-[mdi--transit-connection-variant] h-3.5 w-3.5 text-muted-foreground" />
				</div>
				<h2 className="text-[13px] font-semibold text-foreground">流转历程</h2>
			</div>

			{loading ? (
				<div className="flex h-[280px] items-center justify-center rounded-xl border border-border/30 bg-muted/10">
					<span className="icon-[mdi--loading] h-5 w-5 animate-spin text-muted-foreground/50" />
				</div>
			) : error ? (
				<div className="flex h-[280px] items-center justify-center rounded-xl border border-border/30 bg-muted/10">
					<span className="text-[12px] text-muted-foreground/50">{error}</span>
				</div>
			) : history.length === 0 ? (
				<div className="flex h-[280px] items-center justify-center rounded-xl border border-border/30 bg-muted/10">
					<span className="text-[12px] text-muted-foreground/50">暂无传输记录</span>
				</div>
			) : (
				<div className="h-[280px]">
					<FlowGraph history={history} workflowInstance={workflowInstance} />
				</div>
			)}
		</div>
	);
}
