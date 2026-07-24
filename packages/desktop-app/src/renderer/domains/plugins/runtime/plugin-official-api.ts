import type { InstalledPlugin } from "@preload/api";
import type { PluginOfficialApi } from "@vetta-org/plugin-sdk";
import { createOfficialAgentApi } from "./plugin-official-agent";
import { createOfficialAppearanceApi } from "./plugin-official-appearance";
import { createOfficialBatchTasksApi } from "./plugin-official-batch-tasks";
import { createOfficialDownloadsApi } from "./plugin-official-downloads";
import { createOfficialGeneralApi } from "./plugin-official-general";
import { createOfficialImApi } from "./plugin-official-im";
import { createOfficialKnowledgeApi } from "./plugin-official-knowledge";
import { createOfficialMcpApi } from "./plugin-official-mcp";
import { createOfficialModelsApi } from "./plugin-official-models";
import { createOfficialNavigationApi } from "./plugin-official-navigation";
import { createOfficialPluginsApi } from "./plugin-official-plugins";
import { createOfficialProjectsApi } from "./plugin-official-projects";
import { createOfficialSchedulerApi } from "./plugin-official-scheduler";
import { createOfficialShortcutsApi } from "./plugin-official-shortcuts";
import { createOfficialSkillsApi } from "./plugin-official-skills";
import { createOfficialUpdaterApi } from "./plugin-official-updater";
import { createOfficialWebhookApi } from "./plugin-official-webhook";

export function createPluginOfficialApi(plugin: InstalledPlugin, capabilitySessionId: string): PluginOfficialApi {
	const assertOfficial = (): void => {
		if (plugin.trustLevel !== "official") {
			throw new Error(`Plugin ${plugin.id} is not allowed to use official host capabilities`);
		}
	};

	return {
		general: createOfficialGeneralApi(assertOfficial),
		agent: createOfficialAgentApi(assertOfficial),
		downloads: createOfficialDownloadsApi(assertOfficial, capabilitySessionId),
		updater: createOfficialUpdaterApi(assertOfficial),
		webhook: createOfficialWebhookApi(assertOfficial, capabilitySessionId),
		skills: createOfficialSkillsApi(assertOfficial),
		shortcuts: createOfficialShortcutsApi(assertOfficial),
		im: createOfficialImApi(assertOfficial),
		mcp: createOfficialMcpApi(assertOfficial),
		models: createOfficialModelsApi(assertOfficial),
		projects: createOfficialProjectsApi(assertOfficial, capabilitySessionId),
		plugins: createOfficialPluginsApi(assertOfficial),
		knowledge: createOfficialKnowledgeApi(assertOfficial),
		batchTasks: createOfficialBatchTasksApi(assertOfficial),
		scheduler: createOfficialSchedulerApi(assertOfficial, capabilitySessionId),
		appearance: createOfficialAppearanceApi(assertOfficial),
		navigation: createOfficialNavigationApi(assertOfficial),
	};
}
