import { Button } from "@shared/components/ui/button";
import { flowingPendingListAtom } from "@shared/store/atoms";
import type { FlowingPanelViewProps } from "@vetta/theme-ui/flowing";
import { useAtomValue } from "jotai";
import { useFlowingReceive } from "./useFlowingReceive";

function timeAgo(dateStr: string): string {
	const diff = Date.now() - new Date(dateStr).getTime();
	const minutes = Math.floor(diff / 60000);
	if (minutes < 1) return "刚刚";
	if (minutes < 60) return `${minutes} 分钟前`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours} 小时前`;
	const days = Math.floor(hours / 24);
	return `${days} 天前`;
}

export function useFlowingPanelModel(): FlowingPanelViewProps {
	const pendingList = useAtomValue(flowingPendingListAtom);
	const { processing, accept, reject } = useFlowingReceive();

	return {
		labels: { empty: "暂无待处理流转" },
		items: pendingList.map((t) => ({
			id: t.id,
			senderName: t.sender_name,
			projectName: t.project_name,
			message: t.message,
			fileCount: t.file_list.length,
			timeAgo: timeAgo(t.created_at),
			createdAtTitle: new Date(t.created_at).toLocaleString("zh-CN"),
			rejectButton: (
				<Button
					size="xs"
					variant="ghost"
					className="flex-1 text-muted-foreground hover:text-destructive"
					onClick={() => reject(t)}
					disabled={processing}
				>
					拒绝
				</Button>
			),
			acceptButton: (
				<Button size="xs" className="flex-1" onClick={() => accept(t)} disabled={processing}>
					{processing ? (
						<>
							<span className="icon-[mdi--loading] animate-spin" data-icon="inline-start" />
							处理中
						</>
					) : (
						<>
							<span className="icon-[mdi--check] text-xs" data-icon="inline-start" />
							接受
						</>
					)}
				</Button>
			),
		})),
	};
}
