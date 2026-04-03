import { memo } from "react";
import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";

function TransferEdgeComponent(props: EdgeProps) {
	const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style = {}, markerEnd } = props;

	const [edgePath] = getBezierPath({
		sourceX,
		sourceY,
		sourcePosition,
		targetX,
		targetY,
		targetPosition,
	});

	return <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />;
}

export const TransferEdge = memo(TransferEdgeComponent);
