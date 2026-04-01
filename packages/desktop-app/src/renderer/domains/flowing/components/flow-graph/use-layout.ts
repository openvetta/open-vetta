import dagre from "@dagrejs/dagre";
import { type Edge, type Node, Position } from "@xyflow/react";
import { useMemo } from "react";
import { type FlowingHistoryNode, type FlowTransferEdge, type FlowUserNode, parseHistoryToGraph } from "./types";

const NODE_WIDTH = 200;
const NODE_HEIGHT = 56;

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
		if (!t.isReturn) {
			g.setEdge(String(t.senderId), String(t.receiverId));
		}
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
		source: String(t.senderId),
		target: String(t.receiverId),
		sourceHandle: t.isReturn ? "bottom-out" : "right",
		targetHandle: t.isReturn ? "bottom-in" : "left",
		type: "transferEdge",
		animated: t.status === "pending",
		markerEnd: { type: "arrowclosed" as const },
		data: { status: t.status, message: t.message, isReturn: t.isReturn, count: t.count },
	}));

	return { nodes, edges };
}

export function useFlowLayout(history: FlowingHistoryNode[]) {
	return useMemo(() => {
		if (history.length === 0) return { nodes: [], edges: [] };
		const { users, transfers } = parseHistoryToGraph(history);
		return buildDagreLayout(users, transfers);
	}, [history]);
}
