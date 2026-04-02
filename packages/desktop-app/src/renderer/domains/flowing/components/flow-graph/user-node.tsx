import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { FlowUserNode } from "./types";

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

export type UserNodeType = Node<FlowUserNode, "userNode">;

function UserNodeComponent({ data }: NodeProps<UserNodeType>) {
	const isStart = data.isStart;

	return (
		<div className="relative">
			<div
				className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 shadow-sm ${
					isStart ? "border-primary/50 ring-2 ring-primary/20 bg-primary/5" : "border-border/50 bg-card"
				}`}
			>
				<Handle id="left" type="target" position={Position.Left} className="!h-2 !w-2 !bg-muted-foreground" />
				<Handle id="right" type="source" position={Position.Right} className="!h-2 !w-2 !bg-muted-foreground" />
				<Handle id="bottom-out" type="source" position={Position.Bottom} className="!h-2 !w-2 !bg-muted-foreground" />
				<Handle id="bottom-in" type="target" position={Position.Bottom} className="!h-2 !w-2 !bg-muted-foreground" />

				{/* Avatar */}
				<div className="h-7 w-7 shrink-0 overflow-hidden rounded-full bg-muted">
					{data.userAvatar ? (
						<img src={data.userAvatar} alt={data.userName} className="h-full w-full object-cover" />
					) : (
						<div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
							{data.userName.slice(0, 2)}
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

export const UserNode = memo(UserNodeComponent);
