import { useProjects } from "@domains/project/hooks/useProjects";
import {
	downloadFlowingFile,
	type FlowingTransferVO,
	fetchWorkflowInstanceByFlowing,
	respondFlowing,
} from "@shared/lib/api";
import { authTokenAtom, flowingPendingCountAtom, flowingPendingListAtom } from "@shared/store/atoms";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useState } from "react";

export function useFlowingReceive(): {
	processing: boolean;
	accept: (transfer: FlowingTransferVO) => Promise<boolean>;
	reject: (transfer: FlowingTransferVO) => Promise<boolean>;
} {
	const token = useAtomValue(authTokenAtom);
	const setPendingList = useSetAtom(flowingPendingListAtom);
	const setPendingCount = useSetAtom(flowingPendingCountAtom);
	const { refreshProjects } = useProjects();
	const [processing, setProcessing] = useState(false);

	const accept = useCallback(
		async (transfer: FlowingTransferVO): Promise<boolean> => {
			if (!token) return false;
			setProcessing(true);
			try {
				// 1. 调用 API 接受
				await respondFlowing(token, transfer.id, "accept");

				// 2. 下载文件
				const zipBuffer = await downloadFlowingFile(token, transfer.id);

				// 3. 查找本地是否有匹配的 flowingId 项目
				const config = await window.vetta.config.get();
				const existingProject = await window.vetta.flowing.findProjectByFlowingId(
					transfer.flowing_id,
					config.projects,
				);

				let destDir: string;
				if (existingProject) {
					// 合并到已有项目
					destDir = existingProject;
				} else {
					// 创建新项目
					let projectName = transfer.project_name;
					const workspacePath = config.workspacePath;

					// 检查同名冲突（按路径末段比较，兼容不同操作系统路径分隔符）
					let suffix = 0;
					let candidateName = projectName;
					while (
						config.projects.some((p) => p.path.split(/[/\\]/).pop() === candidateName || p.name === candidateName)
					) {
						suffix++;
						candidateName = `${projectName}_${suffix}`;
					}
					projectName = candidateName;

					destDir = `${workspacePath}/${projectName}`;

					// 添加到项目列表，保存用户可见的项目名称
					await window.vetta.config.set({
						projects: [...config.projects, { path: destDir, name: projectName }],
					});
				}

				// 4. 解压文件
				await window.vetta.flowing.unpackFiles(zipBuffer, destDir);

				// 5. 写 meta.json（如果流转关联了工作流，则包含 workflowInstanceId）
				const metaData: Record<string, unknown> = {
					type: "flowing",
					flowingId: transfer.flowing_id,
				};

				// 检查该 flowing 是否绑定了工作流实例
				try {
					const instance = await fetchWorkflowInstanceByFlowing(token, transfer.flowing_id);
					if (instance?.id) {
						metaData.workflowInstanceId = instance.id;
					}
				} catch {
					// 未绑定工作流，忽略
				}

				await window.vetta.flowing.writeMeta(destDir, metaData);

				// 6. 从本地待处理列表中移除
				setPendingList((prev) => prev.filter((t) => t.id !== transfer.id));
				setPendingCount((prev) => Math.max(0, prev - 1));

				// 7. 刷新项目列表
				await refreshProjects();

				return true;
			} catch (err) {
				console.error("接受流转失败:", err);
				return false;
			} finally {
				setProcessing(false);
			}
		},
		[token, setPendingList, setPendingCount, refreshProjects],
	);

	const reject = useCallback(
		async (transfer: FlowingTransferVO): Promise<boolean> => {
			if (!token) return false;
			setProcessing(true);
			try {
				await respondFlowing(token, transfer.id, "reject");
				// 从本地待处理列表中移除
				setPendingList((prev) => prev.filter((t) => t.id !== transfer.id));
				setPendingCount((prev) => Math.max(0, prev - 1));
				return true;
			} catch (err) {
				console.error("拒绝流转失败:", err);
				return false;
			} finally {
				setProcessing(false);
			}
		},
		[token, setPendingList, setPendingCount],
	);

	return { processing, accept, reject };
}
