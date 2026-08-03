import type { Message } from "@vetta/ai";
import type {
	ConversationDocument,
	GreenfieldRuntimeDocumentParticipant,
	GreenfieldRuntimeDocumentParticipantContext,
	RuntimeSubagentSnapshot,
} from "@vetta/runtime-core";
import type {
	AgentFeature,
	AgentFeatureDefinition,
	RuntimeToolDefinition,
	StoredSessionEvent,
} from "@vetta/runtime-core/kernel";
import {
	isValidTaskName,
	type SubagentChildHandle,
	SubagentCoordinator,
	type SubagentLifecycle,
	type SubagentNotificationPayload,
	type SubagentSnapshot,
	type SubagentSpawnRequest,
	type SubagentTypeDefinition,
	SubagentTypeRegistry,
	type SubagentTypeRegistryLike,
	taskPath,
} from "@vetta/runtime-subagents";
import type { CodingToolActivation } from "@vetta/runtime-tools/coding";
import {
	type CodingAgentRuntimeToolRegistration,
	createCodingAgentSubagentRuntimeToolRegistrations,
} from "../adapters/runtime-core/greenfield.js";
import { EXPLORER_SYSTEM_PROMPT } from "../core/subagents/types/explorer.js";
import { WORKFLOW_SYSTEM_PROMPT } from "../core/subagents/types/workflow.js";
import type { GreenfieldSubagentWorkRuntime } from "./greenfield-session-peripherals.js";
import { GreenfieldSubagentStatePersistence } from "./greenfield-subagent-state-persistence.js";

export const GREENFIELD_SUBAGENT_TYPE_EXPLORER = "explorer";
export const GREENFIELD_SUBAGENT_TYPE_WORKFLOW = "workflow";

export interface GreenfieldSubagentProfile {
	readonly activation: CodingToolActivation;
	readonly inheritParentMcp: boolean;
	readonly systemPromptAddon: string;
	readonly forkParentContext: boolean;
	readonly includeTodo: boolean;
	readonly createRuntimeTools?: (cwd: string) => readonly CodingAgentRuntimeToolRegistration[];
	readonly denyToolNamePrefixes?: readonly string[];
}

export interface GreenfieldSubagentRuntimeOptions {
	readonly parentSessionId: string;
	readonly maxConcurrent?: number;
	readonly lifecycle?: SubagentLifecycle;
	readonly typeRegistry?: SubagentTypeRegistryLike<GreenfieldSubagentProfile>;
	readonly readParentMessages: () => Promise<readonly Message[]>;
	readonly createChild: (
		request: SubagentSpawnRequest,
		type: SubagentTypeDefinition<GreenfieldSubagentProfile>,
		forkContext: readonly Message[] | undefined,
		signal?: AbortSignal,
	) => Promise<SubagentChildHandle>;
	readonly reopenChild?: (
		snapshot: SubagentSnapshot,
		type: SubagentTypeDefinition<GreenfieldSubagentProfile>,
		forkContext: readonly Message[] | undefined,
		signal?: AbortSignal,
	) => Promise<SubagentChildHandle>;
	readonly onNotify?: (payload: SubagentNotificationPayload) => void;
	readonly onUpdate?: (agents: readonly SubagentSnapshot[]) => void;
	readonly validateRecoveredChild?: (snapshot: SubagentSnapshot) => Promise<string | undefined>;
	readonly onRecoveryIssue?: (message: string) => void;
}

/**
 * Greenfield Session-local 子代理能力。
 *
 * 调度器只认识 Child Handle；具体 Session、模型、工具、存储和 MCP 继承由
 * Composition Root 注入的 Child Factory 决定。
 */
export class GreenfieldSubagentRuntime implements GreenfieldSubagentWorkRuntime, GreenfieldRuntimeDocumentParticipant {
	readonly feature: AgentFeatureDefinition;
	private readonly coordinator: SubagentCoordinator<GreenfieldSubagentProfile>;
	private readonly persistence: GreenfieldSubagentStatePersistence;
	private readonly tools: readonly RuntimeToolDefinition[];
	private disposed = false;

	constructor(options: GreenfieldSubagentRuntimeOptions) {
		const reopenChild = options.reopenChild;
		const registry = options.typeRegistry ?? createDefaultGreenfieldSubagentTypeRegistry();
		this.coordinator = new SubagentCoordinator({
			parentSessionId: options.parentSessionId,
			typeRegistry: registry,
			maxConcurrent: options.maxConcurrent,
			lifecycle: options.lifecycle,
			onNotify: options.onNotify,
			onUpdate: (agents) => {
				this.persistence.recordSnapshots(agents);
				options.onUpdate?.(agents);
			},
			onDeliveryClaimed: (marker) => this.persistence.recordDelivery(marker),
			factory: {
				create: async (request, type, signal) =>
					options.createChild(
						request,
						type,
						type.profile.forkParentContext ? [...(await options.readParentMessages())] : undefined,
						signal,
					),
				reopen: reopenChild
					? async (snapshot, type, signal) => reopenChild(snapshot, type, undefined, signal)
					: undefined,
			},
		});
		this.persistence = new GreenfieldSubagentStatePersistence({
			restore: async (state) => {
				const agents = await prepareRecoveredAgents(state.agents, registry, options);
				try {
					this.coordinator.restore({ agents, delivered: state.delivered });
				} catch (error) {
					options.onRecoveryIssue?.(error instanceof Error ? error.message : String(error));
					this.coordinator.restore({ agents: [], delivered: [] });
				}
			},
			onRecoveryIssue: options.onRecoveryIssue,
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

	initialize(document: ConversationDocument, context: GreenfieldRuntimeDocumentParticipantContext): Promise<void> {
		return this.persistence.initialize(document, context);
	}

	onDocumentChanged(document: ConversationDocument): Promise<void> {
		return this.persistence.onDocumentChanged(document);
	}

	onSessionEvent(event: StoredSessionEvent): Promise<void> {
		return this.persistence.onSessionEvent(event);
	}

	async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		await this.coordinator.dispose();
		await this.persistence.dispose();
	}
}

async function prepareRecoveredAgents(
	agents: readonly SubagentSnapshot[],
	registry: SubagentTypeRegistryLike<GreenfieldSubagentProfile>,
	options: GreenfieldSubagentRuntimeOptions,
): Promise<SubagentSnapshot[]> {
	const recovered: SubagentSnapshot[] = [];
	for (const snapshot of agents) {
		if (
			snapshot.parentSessionId !== options.parentSessionId ||
			!isValidTaskName(snapshot.taskName) ||
			snapshot.path !== taskPath(snapshot.taskName)
		) {
			options.onRecoveryIssue?.(`Ignoring recovered subagent "${snapshot.id}" with invalid ownership`);
			continue;
		}
		if (!registry.get(snapshot.agentType)) {
			recovered.push(recoveryFailure(snapshot, `Subagent type "${snapshot.agentType}" is no longer registered`));
			continue;
		}
		if (!snapshot.sessionFile && (snapshot.status === "completed" || snapshot.status === "interrupted")) {
			recovered.push(recoveryFailure(snapshot, "Recovered subagent has no child session transcript"));
			continue;
		}
		const validationIssue = snapshot.sessionFile ? await options.validateRecoveredChild?.(snapshot) : undefined;
		recovered.push(validationIssue ? recoveryFailure(snapshot, validationIssue) : snapshot);
	}
	return recovered;
}

export function createDefaultGreenfieldSubagentTypeRegistry(): SubagentTypeRegistry<GreenfieldSubagentProfile> {
	return new SubagentTypeRegistry<GreenfieldSubagentProfile>().register(explorerType()).register(workflowType());
}

function recoveryFailure(snapshot: SubagentSnapshot, errorMessage: string): SubagentSnapshot {
	return {
		...snapshot,
		status: "failed",
		endedAt: Date.now(),
		errorMessage,
		generation: snapshot.generation + 1,
		usage: { ...snapshot.usage },
		todoProgress: snapshot.todoProgress ? { ...snapshot.todoProgress } : undefined,
	};
}

function explorerType(): SubagentTypeDefinition<GreenfieldSubagentProfile> {
	return {
		id: GREENFIELD_SUBAGENT_TYPE_EXPLORER,
		label: "Explorer",
		description:
			"Read-only information gathering: codebase recon, local docs, structure, and parent MCP search tools when available. Never writes files.",
		profile: {
			inheritParentMcp: true,
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
			inheritParentMcp: true,
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
