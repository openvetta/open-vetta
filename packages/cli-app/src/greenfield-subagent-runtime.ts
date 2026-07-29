import type { Message } from "@vetta/ai";
import { EXPLORER_SYSTEM_PROMPT, WORKFLOW_SYSTEM_PROMPT } from "@vetta/coding-agent";
import { createCodingAgentSubagentRuntimeToolRegistrations } from "@vetta/coding-agent/runtime-host/greenfield";
import type { RuntimeSubagentSnapshot } from "@vetta/runtime-core";
import type { AgentFeature, AgentFeatureDefinition, RuntimeToolDefinition } from "@vetta/runtime-core/kernel";
import {
	type SubagentChildHandle,
	SubagentCoordinator,
	type SubagentLifecycle,
	type SubagentNotificationPayload,
	type SubagentSnapshot,
	type SubagentSpawnRequest,
	type SubagentTypeDefinition,
	SubagentTypeRegistry,
} from "@vetta/runtime-subagents";
import type { CodingToolActivation } from "@vetta/runtime-tools/coding";
import type { GreenfieldSubagentWorkRuntime } from "./greenfield-session-peripherals.js";

export const GREENFIELD_SUBAGENT_TYPE_EXPLORER = "explorer";
export const GREENFIELD_SUBAGENT_TYPE_WORKFLOW = "workflow";

export interface GreenfieldSubagentProfile {
	readonly activation: CodingToolActivation;
	readonly systemPromptAddon: string;
	readonly forkParentContext: boolean;
	readonly includeTodo: boolean;
}

export interface GreenfieldSubagentRuntimeOptions {
	readonly parentSessionId: string;
	readonly maxConcurrent?: number;
	readonly lifecycle?: SubagentLifecycle;
	readonly readParentMessages: () => Promise<readonly Message[]>;
	readonly createChild: (
		request: SubagentSpawnRequest,
		type: SubagentTypeDefinition<GreenfieldSubagentProfile>,
		forkContext: readonly Message[] | undefined,
	) => Promise<SubagentChildHandle>;
	readonly reopenChild?: (
		snapshot: SubagentSnapshot,
		type: SubagentTypeDefinition<GreenfieldSubagentProfile>,
		forkContext: readonly Message[] | undefined,
	) => Promise<SubagentChildHandle>;
	readonly onNotify?: (payload: SubagentNotificationPayload) => void;
	readonly onUpdate?: (agents: readonly SubagentSnapshot[]) => void;
}

/**
 * Greenfield Session-local 子代理能力。
 *
 * 调度器只认识 Child Handle；具体 Session、模型、工具、存储和 MCP 继承由
 * Composition Root 注入的 Child Factory 决定。
 */
export class GreenfieldSubagentRuntime implements GreenfieldSubagentWorkRuntime {
	readonly feature: AgentFeatureDefinition;
	private readonly coordinator: SubagentCoordinator<GreenfieldSubagentProfile>;
	private readonly tools: readonly RuntimeToolDefinition[];

	constructor(options: GreenfieldSubagentRuntimeOptions) {
		const reopenChild = options.reopenChild;
		const registry = new SubagentTypeRegistry<GreenfieldSubagentProfile>()
			.register(explorerType())
			.register(workflowType());
		this.coordinator = new SubagentCoordinator({
			parentSessionId: options.parentSessionId,
			typeRegistry: registry,
			maxConcurrent: options.maxConcurrent,
			lifecycle: options.lifecycle,
			onNotify: options.onNotify,
			onUpdate: options.onUpdate,
			factory: {
				create: async (request, type) =>
					options.createChild(
						request,
						type,
						type.profile.forkParentContext ? [...(await options.readParentMessages())] : undefined,
					),
				reopen: reopenChild
					? async (snapshot, type) =>
							reopenChild(
								snapshot,
								type,
								type.profile.forkParentContext ? [...(await options.readParentMessages())] : undefined,
							)
					: undefined,
			},
		});
		this.tools = createCodingAgentSubagentRuntimeToolRegistrations(() => this.coordinator).map(({ tool }) => tool);
		this.feature = {
			id: "coding-agent-subagents",
			prepare: async (): Promise<AgentFeature> => ({
				contribute: async () => ({ tools: this.tools }),
				dispose: async () => {},
			}),
		};
	}

	readTools(): readonly RuntimeToolDefinition[] {
		return this.tools;
	}

	clearFinished(): number {
		return this.coordinator.clearFinished();
	}

	list(): readonly RuntimeSubagentSnapshot[] {
		return this.coordinator.list().map(toRuntimeSnapshot);
	}

	interrupt(target: string): RuntimeSubagentSnapshot | undefined {
		if (!this.coordinator.get(target)) return undefined;
		return toRuntimeSnapshot(this.coordinator.interrupt(target));
	}

	async dispose(): Promise<void> {
		await this.coordinator.dispose();
	}
}

function explorerType(): SubagentTypeDefinition<GreenfieldSubagentProfile> {
	return {
		id: GREENFIELD_SUBAGENT_TYPE_EXPLORER,
		label: "Explorer",
		description:
			"Read-only information gathering: codebase recon, local docs, structure, and parent MCP search tools when available. Never writes files.",
		profile: {
			activation: {
				mode: "explicit",
				toolNames: ["read", "grep", "glob", "find", "ls", "dir_tree"],
			},
			systemPromptAddon: EXPLORER_SYSTEM_PROMPT,
			forkParentContext: false,
			includeTodo: false,
		},
	};
}

function workflowType(): SubagentTypeDefinition<GreenfieldSubagentProfile> {
	return {
		id: GREENFIELD_SUBAGENT_TYPE_WORKFLOW,
		label: "Workflow",
		description:
			"Todo-driven parallel worker: inherits a snapshot of the parent context, executes a dispatched todo list with full coding tools in the shared cwd. Spawn via dispatch_workflows.",
		profile: {
			activation: { mode: "scope", scope: "cli" },
			systemPromptAddon: WORKFLOW_SYSTEM_PROMPT,
			forkParentContext: true,
			includeTodo: true,
		},
	};
}

function toRuntimeSnapshot(snapshot: SubagentSnapshot): RuntimeSubagentSnapshot {
	return {
		...snapshot,
		usage: { ...snapshot.usage },
		todoProgress: snapshot.todoProgress ? { ...snapshot.todoProgress } : undefined,
	};
}
