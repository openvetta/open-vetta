import { useBatchTasks } from "@domains/batch-tasks/hooks/useBatchTasks";
import { useProjects } from "@domains/project/hooks/useProjects";
import { fetchServerInfo } from "@shared/lib/api";
import {
	defaultConversationCwdAtom,
	deployModeAtom,
	remoteProvidersAtom,
	selectedModelAtom,
	sessionExecutionModeAtom,
	workspacePathAtom,
} from "@shared/store/atoms";
import { creditsBalanceAtom, creditsUnlimitedAtom } from "@shared/store/auth-atoms";
import { useSetAtom } from "jotai";
import { useEffect } from "react";
import { currentUnsubscribe, setCurrentUnsubscribe } from "../services/chat-service";

export function useAppInit(): void {
	const setWorkspacePath = useSetAtom(workspacePathAtom);
	const setDefaultConversationCwd = useSetAtom(defaultConversationCwdAtom);
	const setSelectedModel = useSetAtom(selectedModelAtom);
	const setSessionExecutionMode = useSetAtom(sessionExecutionModeAtom);
	const setRemoteProviders = useSetAtom(remoteProvidersAtom);
	const setDeployMode = useSetAtom(deployModeAtom);
	const setCreditsBalance = useSetAtom(creditsBalanceAtom);
	const setCreditsUnlimited = useSetAtom(creditsUnlimitedAtom);
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
		// Fetch remote models on startup
		void window.vetta.models.fetchRemote().then((result) => {
			if (result.providers && Object.keys(result.providers).length > 0) {
				setRemoteProviders(result.providers);
			}
		});
		// Fetch credits balance
		void window.vetta.credits.getBalance().then((result) => {
			setCreditsBalance(result.balance);
			setCreditsUnlimited(result.unlimited ?? false);
		});
		return () => {
			currentUnsubscribe?.();
			setCurrentUnsubscribe(null);
		};
	}, [
		setWorkspacePath,
		setDefaultConversationCwd,
		setSelectedModel,
		setSessionExecutionMode,
		setRemoteProviders,
		setDeployMode,
		setCreditsBalance,
		setCreditsUnlimited,
		refreshProjects,
		refreshBatchProjects,
	]);
}
