import { useCallback, useState } from "react";
import {
	ReactFlow,
	Background,
	Controls,
	useNodesState,
	useEdgesState,
	type Node,
	type NodeTypes,
	type EdgeTypes,
} from "@xyflow/react";
import { useFlowLayout } from "./use-layout";
import { UserNode } from "./user-node";
import { TransferEdge } from "./transfer-edge";
import { NodeDetailDialog } from "./node-detail-dialog";
import type { FlowingHistoryNode, FlowUserNode } from "./types";

import "@xyflow/react/dist/style.css";

const nodeTypes: NodeTypes = { userNode: UserNode };
const edgeTypes: EdgeTypes = { transferEdge: TransferEdge };

type FlowGraphProps = {
	history: FlowingHistoryNode[];
};

export function FlowGraph({ history }: FlowGraphProps) {
	const { nodes: layoutNodes, edges: layoutEdges } = useFlowLayout(history);
	const [nodes, , onNodesChange] = useNodesState(layoutNodes);
	const [edges, , onEdgesChange] = useEdgesState(layoutEdges);
	const [selectedNode, setSelectedNode] = useState<FlowUserNode | null>(null);

	const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
		setSelectedNode(node.data as unknown as FlowUserNode);
	}, []);

	return (
		<div className="h-full w-full rounded-xl border border-border/30 bg-muted/10">
			<ReactFlow
				nodes={nodes}
				edges={edges}
				onNodesChange={onNodesChange}
				onEdgesChange={onEdgesChange}
				onNodeClick={handleNodeClick}
				nodeTypes={nodeTypes}
				edgeTypes={edgeTypes}
				proOptions={{ hideAttribution: true }}
				fitView
				fitViewOptions={{ padding: 0.3 }}
				nodesDraggable={false}
				nodesConnectable={false}
				elementsSelectable={false}
				minZoom={0.3}
				maxZoom={2}
			>
				<Background gap={16} size={1} />
				<Controls className="[&>button]:!border-border/50 [&>button]:!bg-card [&>button]:!fill-foreground [&>button:hover]:!bg-accent" />
			</ReactFlow>
			<NodeDetailDialog
				open={selectedNode !== null}
				onOpenChange={(open) => { if (!open) setSelectedNode(null); }}
				node={selectedNode}
			/>
		</div>
	);
}

export type { FlowingHistoryNode } from "./types";
