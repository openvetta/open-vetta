import type { RuntimeHostSessionAssembly } from "@vetta/runtime-core";

export function createTeamRuntimeTestAssembly(
	sessionId: string,
	sessionPath: string | undefined,
): RuntimeHostSessionAssembly {
	return {
		lifecycle: { sessionId, sessionPath, dispose: async () => {} },
		historyReader: { readHistory: () => [] },
		historyController: {
			navigateForEdit: async () => ({ text: "", cancelled: false }),
			switchBranch: async () => ({ leafId: "" }),
			appendBranchSummary: async () => ({ entryId: "" }),
			deleteMessage: async () => ({ leafId: null }),
			replaceLastUserMessage: async () => ({ leafId: null }),
			forkSession: async () => ({ path: "", text: "" }),
			setName: async () => {},
		},
		executionController: { isBusy: () => false, reconfigure: async () => {} },
		workspaceView: { readWorkingDirectory: () => undefined },
		configurationController: { setSteeringMode: () => {}, setFollowUpMode: () => {} },
		modelController: { selectModel: async () => {}, setThinkingLevel: () => {}, refreshAuth: async () => {} },
		modelView: {
			readCurrentModel: () => undefined,
			refreshAvailableModels: () => {},
			readAvailableModels: () => [],
			resolveApiKey: async () => undefined,
		},
		corePorts: {
			turnControl: {
				prompt: async () => undefined,
				promptWhenAvailable: async () => undefined,
				continue: async () => {},
				retry: async () => {},
				abort: async () => {},
			},
			eventStream: { subscribe: () => () => {} },
			stateReader: {
				readState: () => ({
					thinkingLevel: "off",
					activeToolNames: [],
					isStreaming: false,
					messageCount: 0,
					contextPercent: 0,
					contextWindow: 0,
				}),
				readMessages: () => [],
			},
		},
	};
}
