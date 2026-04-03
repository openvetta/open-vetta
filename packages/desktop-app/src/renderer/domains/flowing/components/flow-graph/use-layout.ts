import dagre from "@dagrejs/dagre";
import type { WorkflowInstance } from "@shared/lib/api";
import { type Edge, type Node, Position } from "@xyflow/react";
import { useMemo } from "react";
import { type FlowingHistoryNode, type FlowTransferEdge, type FlowUserNode, parseHistoryToGraph } from "./types";

const NODE_WIDTH = 200;
const NODE_HEIGHT = 76;

function buildDagreLayout(
	users: Map<string, FlowUserNode>,
	transfers: FlowTransferEdge[],
): { nodes: Node[]; edges: Edge[] } {
	const g = new dagre.graphlib.Graph();
	g.setDefaultEdgeLabel(() => ({}));
	g.setGraph({ rankdir: "LR", nodesep: 50, ranksep: 100, marginx: 30, marginy: 30 });

	for (const [key, user] of users) {
		g.setNode(key, { width: NODE_WIDTH, height: NODE_HEIGHT, ...user });
	}

	for (const t of transfers) {
		g.setEdge(t.sourceNodeId, t.targetNodeId);
	}

	dagre.layout(g);

	const nodes: Node[] = [];
	for (const [key, user] of users) {
		const nodeWithPos = g.node(key);
		nodes.push({
			id: key,
			type: "userNode",
			position: { x: nodeWithPos.x - NODE_WIDTH / 2, y: nodeWithPos.y - NODE_HEIGHT / 2 },
			data: { ...user },
			sourcePosition: Position.Right,
			targetPosition: Position.Left,
		});
	}

	const edges: Edge[] = transfers.map((t) => ({
		id: `e-${t.transferId}`,
		source: t.sourceNodeId,
		target: t.targetNodeId,
		sourceHandle: "right",
		targetHandle: "left",
		type: "transferEdge",
		animated: t.status === "pending",
		markerEnd: { type: "arrowclosed" as const },
		data: {
			status: t.status,
		},
	}));

	return { nodes, edges };
}

export function useFlowLayout(history: FlowingHistoryNode[], workflowInstance?: WorkflowInstance | null) {
	return useMemo(() => {
		if (history.length === 0) return { nodes: [], edges: [] };
		const { users, transfers } = parseHistoryToGraph(history, workflowInstance);
		return buildDagreLayout(users, transfers);
	}, [history, workflowInstance]);
}
