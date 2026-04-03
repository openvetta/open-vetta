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
	nodeId: string;
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
	/** 环节完成时上传的成果文件 */
	completionFiles: string[];
	/** 环节完成备注 */
	completionMessage: string;
};

export type FlowTransferEdge = {
	transferId: number;
	sourceNodeId: string;
	targetNodeId: string;
	status: string;
	message: string;
	time: string;
	respondedAt: string | null;
	fileList: string[];
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
	const transfers: FlowTransferEdge[] = [];
	let stepIndex = 0;

	// 构建 userId → stage 信息映射
	const userStageMap = new Map<number, { status: NodeStageStatus; fileList: string[]; message: string }>();
	if (workflowInstance) {
		for (const stage of workflowInstance.stages) {
			for (const memberId of stage.member_ids) {
				userStageMap.set(memberId, {
					status: stage.status as NodeStageStatus,
					fileList: stage.file_list ?? [],
					message: stage.message ?? "",
				});
			}
		}
	}

	function createStepNode(
		userId: number,
		userName: string,
		userAvatar: string,
		status: string,
		time: string,
		isStart: boolean,
	): string {
		const nodeId = `step-${stepIndex++}`;
		const stageInfo = userStageMap.get(userId);
		users.set(nodeId, {
			nodeId,
			userId,
			userName,
			userAvatar,
			isStart,
			status,
			time,
			transfers: [],
			totalFiles: 0,
			stageStatus: stageInfo?.status ?? null,
			completionFiles: stageInfo?.fileList ?? [],
			completionMessage: stageInfo?.message ?? "",
		});
		return nodeId;
	}

	// 跟踪每个用户最新的步骤节点，用于平铺根节点列表的链式连接
	const lastStepByUser = new Map<number, string>();

	function walkNode(node: FlowingHistoryNode, senderStepId: string) {
		// 自发自收（最终环节完成文件）不创建边和新节点，但记录流转详情
		if (node.sender_id === node.receiver_id) {
			const senderNode = users.get(senderStepId)!;
			senderNode.transfers.push({
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
			for (const child of node.children) {
				walkNode(child, senderStepId);
			}
			return;
		}

		// 创建接收方步骤节点
		const receiverStepId = createStepNode(
			node.receiver_id,
			node.receiver_name,
			node.receiver_avatar,
			node.status,
			node.responded_at ?? node.created_at,
			false,
		);
		lastStepByUser.set(node.receiver_id, receiverStepId);

		// 创建边
		transfers.push({
			transferId: node.id,
			sourceNodeId: senderStepId,
			targetNodeId: receiverStepId,
			status: node.status,
			message: node.message,
			time: node.created_at,
			respondedAt: node.responded_at,
			fileList: node.file_list ?? [],
		});

		// 添加流转详情到发送方节点
		const senderNode = users.get(senderStepId)!;
		senderNode.transfers.push({
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

		// 添加流转详情到接收方节点
		const receiverNode = users.get(receiverStepId)!;
		receiverNode.transfers.push({
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

		// 递归处理子节点：接收方变为下一次流转的发送方
		for (const child of node.children) {
			walkNode(child, receiverStepId);
		}
	}

	for (const root of history) {
		// 查找发送方最新的步骤节点，实现平铺根节点的链式连接
		let senderStepId = lastStepByUser.get(root.sender_id);
		if (!senderStepId) {
			const isFirst = lastStepByUser.size === 0;
			senderStepId = createStepNode(
				root.sender_id,
				root.sender_name,
				root.sender_avatar,
				isFirst ? "accepted" : root.status,
				root.created_at,
				isFirst,
			);
			lastStepByUser.set(root.sender_id, senderStepId);
		}
		walkNode(root, senderStepId);
	}

	// 计算每个节点的文件总数
	for (const [, user] of users) {
		user.totalFiles = user.transfers
			.filter((d) => d.direction === "out")
			.reduce((sum, d) => sum + d.fileList.length, 0);
	}

	return { users, transfers };
}
