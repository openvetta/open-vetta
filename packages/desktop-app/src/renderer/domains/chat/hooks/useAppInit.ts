import { useBatchTasks } from "@domains/batch-tasks/hooks/useBatchTasks";
import { useProjects } from "@domains/project/hooks/useProjects";
import { fetchServerInfo } from "@shared/lib/api";
import {
	defaultConversationCwdAtom,
	deployModeAtom,
	selectedModelAtom,
	sessionExecutionModeAtom,
	workspacePathAtom,
} from "@shared/store/atoms";
import { useSetAtom } from "jotai";
import { useEffect } from "react";

export function useAppInit(): void {
	const setWorkspacePath = useSetAtom(workspacePathAtom);
	const setDefaultConversationCwd = useSetAtom(defaultConversationCwdAtom);
	const setSelectedModel = useSetAtom(selectedModelAtom);
	const setSessionExecutionMode = useSetAtom(sessionExecutionModeAtom);
	const setDeployMode = useSetAtom(deployModeAtom);
	const { refreshProjects } = useProjects();
	const { refreshProjects: refreshBatchProjects } = useBatchTasks();

	useEffect(() => {
		// Fetch deploy mode from server
		void fetchServerInfo()
			.then((info) => setDeployMode(info.deploy_mode))
			.catch(console.error);
		// Sync workspace path from config file
		void window.vetta.config.get().then((config) => {
			if (config.workspacePath) {
				setWorkspacePath(config.workspacePath);
				localStorage.setItem("vetta-workspace-path", config.workspacePath);
			}
			if (config.defaultConversationCwd) {
				setDefaultConversationCwd(config.defaultConversationCwd);
			}
			const executionMode = config.defaultExecutionMode ?? "full-access";
			setSessionExecutionMode(executionMode);
			localStorage.setItem("vetta-session-execution-mode", executionMode);
		});
		// Load default model if no model selected
		void window.vetta.models.get().then((modelsConfig) => {
			const saved = localStorage.getItem("vetta-selected-model");
			if (!saved && modelsConfig.defaultModel) {
				setSelectedModel(modelsConfig.defaultModel);
				localStorage.setItem("vetta-selected-model", modelsConfig.defaultModel);
			}
		});
		void refreshProjects().catch(console.error);
		void refreshBatchProjects().catch(console.error);
		// 远程模型 & credits 余额已由 useAuth 在 token 变化时统一拉取，这里不再重复。
		// 注意：此处之前有一段 cleanup `currentUnsubscribe?.()`，但 useAppInit
		// 挂在 RootLayout 上、与应用同生命周期，cleanup 永远不会触发——已删除。
		// session 订阅的清理统一由 useSessionManager.openSession 管理。

		// Dev-only memory/DOM probe：偶发 Oilpan OOM 排查用。每 15s 打一行，
		// 给后续诊断留曲线。生产打包时 import.meta.env.DEV 是 false，整段被
		// tree-shake 掉，零成本。
		if (import.meta.env.DEV) {
			const probeId = window.setInterval(() => {
				const domNodes = document.getElementsByTagName("*").length;
				const detached = document.querySelectorAll("[data-virtuoso-scroller]").length;
				const mem = (
					performance as unknown as {
						memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
					}
				).memory;
				const used = mem ? (mem.usedJSHeapSize / 1024 / 1024).toFixed(1) : "?";
				const total = mem ? (mem.totalJSHeapSize / 1024 / 1024).toFixed(1) : "?";
				const limit = mem ? (mem.jsHeapSizeLimit / 1024 / 1024).toFixed(0) : "?";
				console.log(
					`[probe] dom=${domNodes} virtuosoScrollers=${detached} jsHeap=${used}/${total}MB (limit ${limit}MB) uptime=${Math.round(performance.now() / 1000)}s`,
				);
			}, 15000);
			return () => window.clearInterval(probeId);
		}
	}, [
		setWorkspacePath,
		setDefaultConversationCwd,
		setSelectedModel,
		setSessionExecutionMode,
		setDeployMode,
		refreshProjects,
		refreshBatchProjects,
	]);
}
