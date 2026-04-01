import type { FlowingTransferVO } from "@shared/lib/api";

/** API 实际返回的树形结构（FlowingTransferVO + children） */
export interface FlowingHistoryNode extends FlowingTransferVO {
	children: FlowingHistoryNode[];
}

export type FlowUserNode = {
	userId: number;
	userName: string;
	userAvatar: string;
	isStart: boolean;
	status: string;
	time: string;
};

export type FlowTransferEdge = {
	transferId: number;
	senderId: number;
	receiverId: number;
	status: string;
	message: string;
	time: string;
	isReturn: boolean;
	count: number;
};

export type ParsedFlowData = {
	users: Map<string, FlowUserNode>;
	transfers: FlowTransferEdge[];
};

export function parseHistoryToGraph(history: FlowingHistoryNode[]): ParsedFlowData {
	const users = new Map<string, FlowUserNode>();
	const edgeMap = new Map<string, FlowTransferEdge>();
	const seenDirections = new Set<string>();

	function ensureUser(id: number, name: string, avatar: string, status: string, time: string, isStart: boolean) {
		const key = String(id);
		const existing = users.get(key);
		if (!existing) {
			users.set(key, { userId: id, userName: name, userAvatar: avatar, isStart, status, time });
		} else {
			if (new Date(time) > new Date(existing.time)) {
				existing.status = status;
				existing.time = time;
			}
			if (isStart) existing.isStart = true;
		}
	}

	function processTransfer(node: FlowingHistoryNode) {
		ensureUser(node.sender_id, node.sender_name, node.sender_avatar, node.status, node.created_at, false);
		ensureUser(
			node.receiver_id,
			node.receiver_name,
			node.receiver_avatar,
			node.status,
			node.responded_at ?? node.created_at,
			false,
		);

		const forwardKey = `${node.sender_id}->${node.receiver_id}`;
		const reverseKey = `${node.receiver_id}->${node.sender_id}`;
		const isReturn = seenDirections.has(reverseKey);
		seenDirections.add(forwardKey);

		const existing = edgeMap.get(forwardKey);
		if (existing) {
			existing.count += 1;
			if (new Date(node.created_at) > new Date(existing.time)) {
				existing.status = node.status;
				existing.time = node.created_at;
				if (node.message) existing.message = node.message;
			}
		} else {
			edgeMap.set(forwardKey, {
				transferId: node.id,
				senderId: node.sender_id,
				receiverId: node.receiver_id,
				status: node.status,
				message: node.message,
				time: node.created_at,
				isReturn,
				count: 1,
			});
		}
	}

	function walk(node: FlowingHistoryNode) {
		processTransfer(node);
		for (const child of node.children) {
			walk(child);
		}
	}

	if (history.length > 0) {
		const first = history[0];
		ensureUser(first.sender_id, first.sender_name, first.sender_avatar, "accepted", first.created_at, true);
	}

	for (const root of history) {
		walk(root);
	}

	return { users, transfers: Array.from(edgeMap.values()) };
}
