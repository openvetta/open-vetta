import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
export type NodeStageStatus = "completed" | "in_progress" | "pending" | "returned" | null;

export type FlowUserNodeData = {
	nodeId: string;
	userId: number;
	userName: string;
	userAvatar: string;
	isStart: boolean;
	status: string;
	time: string;
	totalFiles: number;
	stageStatus: NodeStageStatus;
};


function statusLabel(status: string) {
	switch (status) {
		case "pending":
			return "待处理";
		case "accepted":
			return "已接受";
		case "rejected":
			return "已拒绝";
		default:
			return status;
	}
}

function statusBadgeClass(status: string) {
	switch (status) {
		case "accepted":
			return "border-teal-500/40 bg-teal-500/10 text-teal-300";
		case "rejected":
			return "border-red-500/40 bg-red-500/10 text-red-300";
		default:
			return "border-border bg-muted/30 text-muted-foreground";
	}
}

function formatTime(dateStr: string) {
	return new Date(dateStr).toLocaleDateString("zh-CN", {
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	});
}

/** 根据工作流阶段状态返回节点容器样式 */
function stageCardClass(stageStatus: NodeStageStatus): string {
	switch (stageStatus) {
		case "completed":
			return "border-emerald-600/60 ring-2 ring-emerald-500/25 bg-emerald-50 dark:bg-emerald-500/5";
		case "in_progress":
			return "border-blue-600/60 ring-2 ring-blue-500/25 bg-blue-50 dark:bg-blue-500/5";
		case "returned":
			return "border-red-600/60 ring-2 ring-red-500/25 bg-red-50 dark:bg-red-500/5";
		case "pending":
			return "border-border/30 bg-muted/50 opacity-60";
		default:
			return "";
	}
}

/** 根据工作流阶段状态返回 handle 颜色 */
function stageHandleClass(stageStatus: NodeStageStatus): string {
	switch (stageStatus) {
		case "completed":
			return "!bg-emerald-500";
		case "in_progress":
			return "!bg-blue-500";
		case "returned":
			return "!bg-red-500";
		default:
			return "!bg-muted-foreground";
	}
}

export type UserNodeType = Node<FlowUserNodeData, "userNode">;

function UserNodeViewComponent({ data }: NodeProps<UserNodeType>) {
	const isStart = data.isStart;
	const ss = data.stageStatus;
	const hasStage = ss !== null;

	// 节点容器样式：有工作流阶段时用阶段颜色，否则用原逻辑
	const cardClass = hasStage
		? stageCardClass(ss)
		: isStart
			? "border-primary/50 ring-2 ring-primary/20 bg-primary/5"
			: "border-border/50 bg-card";

	const handleClass = `!h-2 !w-2 ${stageHandleClass(ss)}`;

	return (
		<div className="relative">
			<div className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 shadow-sm ${cardClass}`}>
				<Handle id="left" type="target" position={Position.Left} className={handleClass} />
				<Handle id="right" type="source" position={Position.Right} className={handleClass} />

				{/* Avatar — 完成状态加绿色勾 */}
				<div className="relative h-7 w-7 shrink-0">
					<div className="h-full w-full overflow-hidden rounded-full bg-muted">
						{data.userAvatar ? (
							<img src={data.userAvatar} alt={data.userName} className="h-full w-full object-cover" />
						) : (
							<div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
								{data.userName.slice(0, 2)}
							</div>
						)}
					</div>
					{ss === "completed" && (
						<div className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500">
							<span className="icon-[mdi--check] text-[10px] text-white" />
						</div>
					)}
				</div>

				<div className="flex flex-col gap-0.5">
					<div className="flex items-center gap-1.5">
						<span className="text-[12px] font-medium leading-none text-foreground">{data.userName}</span>
						{isStart && (
							<span className="rounded border border-primary/40 bg-primary/10 px-1 text-[9px] text-primary">
								起点
							</span>
						)}
					</div>
					<div className="flex items-center gap-1.5">
						<span className={`rounded border px-1 text-[9px] ${statusBadgeClass(data.status)}`}>
							{statusLabel(data.status)}
						</span>
						<span className="text-[9px] text-muted-foreground">{formatTime(data.time)}</span>
					</div>
				</div>
			</div>
			{data.totalFiles > 0 && (
				<div className="absolute left-1/2 top-full mt-1 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap text-[9px] text-muted-foreground/70">
					<span className="icon-[mdi--file-outline] text-[10px]" />
					{data.totalFiles} 个文件
				</div>
			)}
		</div>
	);
}

export const UserNodeView = memo(UserNodeViewComponent);
