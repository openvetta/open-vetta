import type { AgentSession } from "../../core/agent-session.js";
import type { ToolDefinition } from "../../core/extensions/types.js";
import { createImSendAttachmentTool } from "../../core/tools/im-send-attachment/index.js";
import { createMemoryTool } from "../../core/tools/memory/index.js";
import type {
	RpcBashCapability,
	RpcCommandDiscoveryCapability,
	RpcContextCapability,
	RpcMemoryCapability,
	RpcModelCapability,
	RpcQueueCapability,
	RpcRetryCapability,
	RpcSessionCapabilities,
	RpcSessionInitialization,
	RpcSessionManagementCapability,
	RpcStateCapability,
	RpcTurnCapability,
} from "./rpc-session-capabilities.js";
import type { RpcSlashCommand } from "./rpc-types.js";

export class LegacyRpcSessionAdapter implements RpcSessionCapabilities {
	readonly turn: RpcTurnCapability;
	readonly state: RpcStateCapability;
	readonly model: RpcModelCapability;
	readonly queue: RpcQueueCapability;
	readonly context: RpcContextCapability;
	readonly memory: RpcMemoryCapability;
	readonly retry: RpcRetryCapability;
	readonly bash: RpcBashCapability;
	readonly session: RpcSessionManagementCapability;
	readonly commands: RpcCommandDiscoveryCapability;

	constructor(private readonly agentSession: AgentSession) {
		this.turn = {
			prompt: (message, options) => this.agentSession.prompt(message, options),
			steer: (message, images) => this.agentSession.steer(message, images),
			followUp: (message, images) => this.agentSession.followUp(message, images),
			abort: () => this.agentSession.abort(),
		};
		this.state = {
			readState: () => ({
				model: this.agentSession.model,
				thinkingLevel: this.agentSession.thinkingLevel,
				isStreaming: this.agentSession.isStreaming,
				isCompacting: this.agentSession.isCompacting,
				steeringMode: this.agentSession.steeringMode,
				followUpMode: this.agentSession.followUpMode,
				sessionFile: this.agentSession.sessionFile,
				sessionId: this.agentSession.sessionId,
				sessionName: this.agentSession.sessionName,
				autoCompactionEnabled: this.agentSession.autoCompactionEnabled,
				messageCount: this.agentSession.messages.length,
				pendingMessageCount: this.agentSession.pendingMessageCount,
			}),
			readMessages: () => this.agentSession.messages,
		};
		this.model = {
			selectModel: async (provider, modelId) => {
				const models = await this.agentSession.modelRegistry.getAvailable();
				const model = models.find((candidate) => candidate.provider === provider && candidate.id === modelId);
				if (!model) return undefined;
				await this.agentSession.setModel(model);
				return model;
			},
			cycleModel: () => this.agentSession.cycleModel(),
			readAvailableModels: async () => {
				const models = await this.agentSession.modelRegistry.getAvailable();
				return models.map((model) => ({
					...model,
					remote: this.agentSession.modelRegistry.isRemote(model),
				}));
			},
			setThinkingLevel: (level) => this.agentSession.setThinkingLevel(level),
			cycleThinkingLevel: () => this.agentSession.cycleThinkingLevel(),
		};
		this.queue = {
			setSteeringMode: (mode) => this.agentSession.setSteeringMode(mode),
			setFollowUpMode: (mode) => this.agentSession.setFollowUpMode(mode),
		};
		this.context = {
			compact: (customInstructions) => this.agentSession.compact(customInstructions),
			setAutoCompactionEnabled: (enabled) => this.agentSession.setAutoCompactionEnabled(enabled),
		};
		this.memory = {
			flushMemory: () => this.agentSession.flushMemory(),
		};
		this.retry = {
			setAutoRetryEnabled: (enabled) => this.agentSession.setAutoRetryEnabled(enabled),
			abortRetry: () => this.agentSession.abortRetry(),
		};
		this.bash = {
			execute: (command) => this.agentSession.executeBash(command),
			abort: () => this.agentSession.abortBash(),
		};
		this.session = {
			newSession: async (parentSession) => {
				const options = parentSession ? { parentSession } : undefined;
				return this.agentSession.newSession(options);
			},
			switchSession: (sessionPath) => this.agentSession.switchSession(sessionPath),
			fork: async (entryId) => {
				const result = await this.agentSession.fork(entryId);
				return { text: result.selectedText, cancelled: result.cancelled };
			},
			readForkMessages: () => this.agentSession.getUserMessagesForForking(),
			readLastAssistantText: () => this.agentSession.getLastAssistantText(),
			setName: (name) => this.agentSession.setSessionName(name),
			readStats: () => this.agentSession.getSessionStats(),
			exportHtml: (outputPath) => this.agentSession.exportToHtml(outputPath),
		};
		this.commands = {
			readCommands: () => this.readCommands(),
		};
	}

	async initialize(input: RpcSessionInitialization): Promise<void> {
		const customTools: ToolDefinition[] = [];
		if (input.hostBridge) {
			customTools.push(createImSendAttachmentTool(input.hostBridge) as unknown as ToolDefinition);
		}
		if (this.agentSession.memoryMode && this.agentSession.memoryFile) {
			customTools.push(
				createMemoryTool(
					this.agentSession.memoryFile,
					this.agentSession.memoryCharLimit,
				) as unknown as ToolDefinition,
			);
		}
		if (customTools.length > 0) {
			this.agentSession.reconfigureCustomTools(customTools);
		}

		await this.agentSession.bindExtensions({
			uiContext: input.uiContext,
			commandContextActions: {
				waitForIdle: () => this.agentSession.agent.waitForIdle(),
				newSession: async (options) => {
					const success = await this.agentSession.newSession(options);
					return { cancelled: !success };
				},
				fork: async (entryId) => {
					const result = await this.agentSession.fork(entryId);
					return { cancelled: result.cancelled };
				},
				navigateTree: async (targetId, options) => {
					const result = await this.agentSession.navigateTree(targetId, {
						summarize: options?.summarize,
						customInstructions: options?.customInstructions,
						replaceInstructions: options?.replaceInstructions,
						label: options?.label,
					});
					return { cancelled: result.cancelled };
				},
				switchSession: async (sessionPath) => {
					const success = await this.agentSession.switchSession(sessionPath);
					return { cancelled: !success };
				},
				reload: () => this.agentSession.reload(),
			},
			shutdownHandler: input.onShutdownRequested,
			onError: input.onExtensionError,
		});
	}

	subscribe(listener: (event: unknown) => void): () => void {
		return this.agentSession.subscribe(listener);
	}

	async shutdown(): Promise<void> {
		const runner = this.agentSession.extensionRunner;
		if (runner?.hasHandlers("session_shutdown")) {
			await runner.emit({ type: "session_shutdown" });
		}
	}

	private readCommands(): readonly RpcSlashCommand[] {
		const commands: RpcSlashCommand[] = [];
		for (const { command, extensionPath } of this.agentSession.extensionRunner?.getRegisteredCommandsWithPaths() ??
			[]) {
			commands.push({
				name: command.name,
				description: command.description,
				source: "extension",
				path: extensionPath,
			});
		}
		for (const template of this.agentSession.promptTemplates) {
			commands.push({
				name: template.name,
				description: template.description,
				source: "prompt",
				location: template.source as RpcSlashCommand["location"],
				path: template.filePath,
			});
		}
		for (const skill of this.agentSession.resourceLoader.getSkills().skills) {
			commands.push({
				name: `skill:${skill.name}`,
				description: skill.description,
				source: "skill",
				location: skill.source as RpcSlashCommand["location"],
				path: skill.filePath,
			});
		}
		return commands;
	}
}
