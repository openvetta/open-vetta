import { memo } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";

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

const RETURN_OFFSET = 80;

type TransferEdgeData = {
	status: string;
	isReturn: boolean;
	count: number;
};

function TransferEdgeComponent(props: EdgeProps) {
	const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style = {}, markerEnd, data } = props;

	const d = data as unknown as TransferEdgeData;
	const isReturn = d?.isReturn ?? false;

	let edgePath: string;
	let labelX: number;
	let labelY: number;

	if (isReturn) {
		const midX = (sourceX + targetX) / 2;
		const midY = Math.max(sourceY, targetY) + RETURN_OFFSET;
		edgePath = `M ${sourceX},${sourceY} Q ${midX},${midY} ${targetX},${targetY}`;
		labelX = midX;
		labelY = midY - 10;
	} else {
		[edgePath, labelX, labelY] = getBezierPath({
			sourceX,
			sourceY,
			sourcePosition,
			targetX,
			targetY,
			targetPosition,
		});
	}

	const edgeStyle = {
		...style,
		...(isReturn ? { strokeDasharray: "6 3", stroke: "#ef4444" } : {}),
	};

	return (
		<>
			<BaseEdge path={edgePath} markerEnd={markerEnd} style={edgeStyle} />
			<EdgeLabelRenderer>
				<div
					className="pointer-events-auto absolute flex flex-col items-center gap-0.5"
					style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }}
				>
					{d?.status && (
						<span
							className={`rounded border px-1 py-0 text-[9px] bg-background ${statusBadgeClass(d.status)}`}
						>
							{isReturn ? "折返 - " : ""}
							{statusLabel(d.status)}
							{(d.count ?? 1) > 1 ? ` x${d.count}` : ""}
						</span>
					)}
				</div>
			</EdgeLabelRenderer>
		</>
	);
}

export const TransferEdge = memo(TransferEdgeComponent);
