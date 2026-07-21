import type { PluginOfficialApi, PluginOfficialKnowledgeProcessingSettings } from "@vetta-org/plugin-sdk";

function knowledgeProcessing(
	config: Awaited<ReturnType<typeof window.vetta.config.get>>,
): PluginOfficialKnowledgeProcessingSettings {
	return { ...(config.knowledgeBase ?? {}) };
}

export function createOfficialKnowledgeApi(assertOfficial: () => void): PluginOfficialApi["knowledge"] {
	return {
		list: async () => {
			assertOfficial();
			return window.vetta.knowledge.list();
		},
		fileStatuses: async () => {
			assertOfficial();
			return window.vetta.knowledge.fileStatuses();
		},
		isProcessing: async () => {
			assertOfficial();
			return window.vetta.knowledge.isProcessing();
		},
		getProcessing: async () => {
			assertOfficial();
			return knowledgeProcessing(await window.vetta.config.get());
		},
		create: async (name) => {
			assertOfficial();
			await window.vetta.knowledge.create(name);
		},
		rename: async (name, newName) => {
			assertOfficial();
			await window.vetta.knowledge.rename(name, newName);
		},
		delete: async (name) => {
			assertOfficial();
			await window.vetta.knowledge.delete(name);
		},
		addFiles: async (kbId, paths, move = false) => {
			assertOfficial();
			await window.vetta.knowledge.addFiles(kbId, paths, move);
		},
		deleteEntry: async (kbId, relPath) => {
			assertOfficial();
			await window.vetta.knowledge.deleteEntry(kbId, relPath);
		},
		scanNow: async () => {
			assertOfficial();
			return window.vetta.knowledge.scanNow();
		},
		retryFailed: async () => {
			assertOfficial();
			return window.vetta.knowledge.retryFailed();
		},
		setProcessing: async (data) => {
			assertOfficial();
			const config = await window.vetta.config.get();
			const kb = { ...config.knowledgeBase };
			if (data.enabled !== undefined) kb.enabled = data.enabled;
			if (data.pollIntervalMinutes !== undefined) kb.pollIntervalMinutes = data.pollIntervalMinutes;
			if (data.processingModelKey === null) delete kb.processingModelKey;
			else if (data.processingModelKey !== undefined) kb.processingModelKey = data.processingModelKey;
			if (data.processingModelReasoningLevel === null) delete kb.processingModelReasoningLevel;
			else if (data.processingModelReasoningLevel !== undefined) {
				kb.processingModelReasoningLevel = data.processingModelReasoningLevel;
			}
			if (data.agentConcurrency !== undefined) kb.agentConcurrency = data.agentConcurrency;
			if (data.ocrConcurrency !== undefined) kb.ocrConcurrency = data.ocrConcurrency;
			await window.vetta.config.set({ knowledgeBase: kb });
			await window.vetta.knowledge.reload();
			return knowledgeProcessing(await window.vetta.config.get());
		},
	};
}
