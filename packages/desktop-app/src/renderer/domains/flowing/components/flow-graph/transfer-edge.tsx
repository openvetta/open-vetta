import { memo } from "react";
import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";

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

	if (isReturn) {
		const midX = (sourceX + targetX) / 2;
		const midY = Math.max(sourceY, targetY) + RETURN_OFFSET;
		edgePath = `M ${sourceX},${sourceY} Q ${midX},${midY} ${targetX},${targetY}`;
	} else {
		[edgePath] = getBezierPath({
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

	return <BaseEdge path={edgePath} markerEnd={markerEnd} style={edgeStyle} />;
}

export const TransferEdge = memo(TransferEdgeComponent);
