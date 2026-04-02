import type { FlowingTransferVO, WorkflowInstance } from "@shared/lib/api";

/** API 实际返回的树形结构（FlowingTransferVO + children） */
export interface FlowingHistoryNode extends FlowingTransferVO {
	children: FlowingHistoryNode[];
}

export type TransferDetail = {
	transferId: number;
	direction: "in" | "out";
	counterpartId: number;
	counterpartName: string;
	counterpartAvatar: string;
	message: string;
	fileList: string[];
	status: string;
	createdAt: string;
	respondedAt: string | null;
};

/** 节点在工作流中的阶段状态 */
export type NodeStageStatus = "completed" | "in_progress" | "pending" | "returned" | null;

export type FlowUserNode = {
	userId: number;
	userName: string;
	userAvatar: string;
	isStart: boolean;
	status: string;
	time: string;
	transfers: TransferDetail[];
	totalFiles: number;
	/** 工作流阶段状态（仅工作流类型流转有值） */
	stageStatus: NodeStageStatus;
};

export type FlowTransferEdge = {
	transferId: number;
	senderId: number;
	receiverId: number;
	status: string;
	message: string;
	time: string;
	respondedAt: string | null;
	fileList: string[];
	isReturn: boolean;
	count: number;
};

export type ParsedFlowData = {
	users: Map<string, FlowUserNode>;
	transfers: FlowTransferEdge[];
};

export function parseHistoryToGraph(
	history: FlowingHistoryNode[],
	workflowInstance?: WorkflowInstance | null,
): ParsedFlowData {
	const users = new Map<string, FlowUserNode>();
	const edgeMap = new Map<string, FlowTransferEdge>();
	const seenDirections = new Set<string>();
	const userTransfers = new Map<string, TransferDetail[]>();

	// 构建 userId → stageStatus 映射
	const userStageMap = new Map<number, NodeStageStatus>();
	if (workflowInstance) {
		for (const stage of workflowInstance.stages) {
			for (const memberId of stage.member_ids) {
				userStageMap.set(memberId, stage.status as NodeStageStatus);
			}
		}
	}

	function ensureUser(id: number, name: string, avatar: string, status: string, time: string, isStart: boolean) {
		const key = String(id);
		const existing = users.get(key);
		if (!existing) {
			users.set(key, {
				userId: id,
				userName: name,
				userAvatar: avatar,
				isStart,
				status,
				time,
				transfers: [],
				totalFiles: 0,
				stageStatus: userStageMap.get(id) ?? null,
			});
		} else {
			if (new Date(time) > new Date(existing.time)) {
				existing.status = status;
				existing.time = time;
			}
			if (isStart) existing.isStart = true;
		}
		if (!userTransfers.has(key)) {
			userTransfers.set(key, []);
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

		// Collect transfer details per user
		const senderKey = String(node.sender_id);
		const receiverKey = String(node.receiver_id);

		userTransfers.get(senderKey)!.push({
			transferId: node.id,
			direction: "out",
			counterpartId: node.receiver_id,
			counterpartName: node.receiver_name,
			counterpartAvatar: node.receiver_avatar,
			message: node.message,
			fileList: node.file_list ?? [],
			status: node.status,
			createdAt: node.created_at,
			respondedAt: node.responded_at,
		});

		userTransfers.get(receiverKey)!.push({
			transferId: node.id,
			direction: "in",
			counterpartId: node.sender_id,
			counterpartName: node.sender_name,
			counterpartAvatar: node.sender_avatar,
			message: node.message,
			fileList: node.file_list ?? [],
			status: node.status,
			createdAt: node.created_at,
			respondedAt: node.responded_at,
		});

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
				existing.respondedAt = node.responded_at;
				existing.fileList = node.file_list;
				existing.transferId = node.id;
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
				respondedAt: node.responded_at,
				fileList: node.file_list ?? [],
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

	// Merge transfer details and total file counts into user nodes
	for (const [key, user] of users) {
		const details = userTransfers.get(key) ?? [];
		user.transfers = details;
		user.totalFiles = details.filter((d) => d.direction === "out").reduce((sum, d) => sum + d.fileList.length, 0);
	}

	return { users, transfers: Array.from(edgeMap.values()) };
}
