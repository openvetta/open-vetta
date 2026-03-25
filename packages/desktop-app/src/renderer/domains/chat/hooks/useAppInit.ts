import { useProjects } from "@domains/project/hooks/useProjects";
import { remoteProvidersAtom, selectedModelAtom, workspacePathAtom } from "@shared/store/atoms";
import { useSetAtom } from "jotai";
import { useEffect } from "react";
import { currentUnsubscribe, setCurrentUnsubscribe } from "../services/chat-service";

export function useAppInit(): void {
	const setWorkspacePath = useSetAtom(workspacePathAtom);
	const setSelectedModel = useSetAtom(selectedModelAtom);
	const setRemoteProviders = useSetAtom(remoteProvidersAtom);
	const { refreshProjects } = useProjects();

	useEffect(() => {
		// Sync workspace path from config file
		void window.vetta.config.get().then((config) => {
			if (config.workspacePath) {
				setWorkspacePath(config.workspacePath);
				localStorage.setItem("vetta-workspace-path", config.workspacePath);
			}
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
		// Fetch remote models on startup
		void window.vetta.models.fetchRemote().then((result) => {
			if (result.providers && Object.keys(result.providers).length > 0) {
				setRemoteProviders(result.providers);
			}
		});
		return () => {
			currentUnsubscribe?.();
			setCurrentUnsubscribe(null);
		};
	}, [setWorkspacePath, setSelectedModel, setRemoteProviders, refreshProjects]);
}
