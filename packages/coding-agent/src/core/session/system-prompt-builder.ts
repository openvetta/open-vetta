/**
 * System prompt + personalization assembly.
 *
 * Extracted from AgentSession. Pure functions over explicitly-passed session
 * state; the facade keeps thin wrappers and the lazy-rebuild signature logic.
 */

import type { AgentTool } from "@vetta/agent-core";
import type { McpManager } from "../mcp/index.js";
import { renderMemoryForPrompt } from "../memory/memory-store.js";
import { getPersonaPrompt } from "../personas.js";
import type { ResourceLoader } from "../resource-loader.js";
import type { SettingsManager } from "../settings-manager.js";
import {
	type AgentPluginRuntimeConfig,
	type BuildSystemPromptOptions,
	buildSystemPrompt,
	buildSystemPromptDraft,
	type SystemPromptDraft,
} from "../system-prompt.js";

/**
 * Build the personalization (persona + custom instructions) append block.
 * Order: persona first, custom instructions second; default persona contributes
 * an empty string. Returns undefined when both are empty.
 */
export function buildPersonalizationBlock(settingsManager: SettingsManager): string | undefined {
	const { personaId, customPrompt } = settingsManager.getPersonalization();
	const parts: string[] = [];
	const personaPrompt = getPersonaPrompt(personaId);
	if (personaPrompt.trim()) parts.push(personaPrompt.trim());
	if (customPrompt.trim()) parts.push(customPrompt.trim());
	return parts.length > 0 ? parts.join("\n\n") : undefined;
}

/** Personalization signature, used for lazy-rebuild change detection. */
export function personalizationSig(settingsManager: SettingsManager): string {
	const { personaId, customPrompt } = settingsManager.getPersonalization();
	return `${personaId} ${customPrompt}`;
}

/** Dependencies required to rebuild the base system prompt. */
export interface SystemPromptDeps {
	toolNames: string[];
	baseToolRegistry: Map<string, AgentTool>;
	resourceLoader: ResourceLoader;
	mcpManager: McpManager | undefined;
	cwd: string;
	settingsManager: SettingsManager;
	memoryMode: boolean;
	memoryFile: string | undefined;
	memorySnapshot: string;
	memoryCharLimit: number;
	agentPlugins?: AgentPluginRuntimeConfig;
}

function resolveSystemPromptOptions(deps: SystemPromptDeps): BuildSystemPromptOptions {
	const validToolNames = deps.toolNames.filter((name) => deps.baseToolRegistry.has(name));
	const loaderSystemPrompt = deps.resourceLoader.getSystemPrompt();
	const loaderAppendSystemPrompt = deps.resourceLoader.getAppendSystemPrompt();
	const appendSystemPrompt = loaderAppendSystemPrompt.length > 0 ? loaderAppendSystemPrompt.join("\n\n") : undefined;
	const loadedSkills = deps.resourceLoader.getSkills().skills;
	const loadedContextFiles = deps.resourceLoader.getAgentsFiles().agentsFiles;

	// Collect MCP tool information for system prompt
	const mcpTools =
		deps.mcpManager
			?.getTools()
			.filter((tool) => deps.toolNames.includes(tool.name))
			.map((tool) => ({
				name: tool.name,
				description: tool.description || `Tool from MCP server`,
			})) ?? [];

	const memory =
		deps.memoryMode && deps.memoryFile
			? renderMemoryForPrompt(deps.memoryFile, deps.memorySnapshot, deps.memoryCharLimit)
			: undefined;

	const personalization = buildPersonalizationBlock(deps.settingsManager);

	return {
		cwd: deps.cwd,
		skills: loadedSkills,
		contextFiles: loadedContextFiles,
		customPrompt: loaderSystemPrompt,
		appendSystemPrompt,
		selectedTools: validToolNames,
		mcpTools,
		memory,
		personalization,
		agentPlugins: deps.agentPlugins,
	};
}

/** Rebuild the base system prompt from current session state. */
export function rebuildSystemPrompt(deps: SystemPromptDeps): string {
	return buildSystemPrompt(resolveSystemPromptOptions(deps));
}

export function rebuildSystemPromptDraft(deps: SystemPromptDeps): SystemPromptDraft {
	return buildSystemPromptDraft(resolveSystemPromptOptions(deps));
}
