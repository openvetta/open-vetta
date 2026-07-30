import type {
	AgentPluginRuntimeConfig,
	RuntimeSessionBackgroundWorkController,
	RuntimeSessionConfigurationController,
	RuntimeSubagentSnapshot,
} from "@vetta/runtime-core";
import type { AgentSession } from "@vetta/runtime-core/kernel";
import type { BackgroundCommandService } from "@vetta/runtime-tools/coding";

/** Coding Agent Greenfield Session 的外围能力组合合同。 */
export interface GreenfieldSubagentWorkRuntime {
	clearFinished(): number;
	list(): readonly RuntimeSubagentSnapshot[];
	interrupt(target: string): RuntimeSubagentSnapshot | undefined;
}

export interface GreenfieldAgentPluginReconfiguration {
	reconfigureAgentPlugins(agentPlugins: AgentPluginRuntimeConfig | undefined): Promise<void>;
}

/** Session-local 动态配置事实源；Prompt、Plugin 与宿主 Controller 共享同一实例。 */
export class GreenfieldSessionConfigurationState {
	private agentMode: string | undefined;
	private pluginOverride: AgentPluginRuntimeConfig | undefined;
	private hasPluginOverride = false;

	constructor(
		initialAgentMode: string | undefined,
		private readonly readBaseAgentPlugins: () => AgentPluginRuntimeConfig | undefined,
	) {
		this.agentMode = initialAgentMode;
	}

	readAgentMode(): string | undefined {
		return this.agentMode;
	}

	readAgentPlugins(): AgentPluginRuntimeConfig | undefined {
		return this.hasPluginOverride ? this.pluginOverride : this.readBaseAgentPlugins();
	}

	createController(
		session: AgentSession,
		pluginReconfiguration?: GreenfieldAgentPluginReconfiguration,
	): RuntimeSessionConfigurationController {
		return {
			setSteeringMode: (mode) => session.setSteeringMode(mode),
			setFollowUpMode: (mode) => session.setFollowUpMode(mode),
			reconfigureAgentPlugins: async (agentPlugins) => {
				await pluginReconfiguration?.reconfigureAgentPlugins(agentPlugins);
				this.pluginOverride = agentPlugins;
				this.hasPluginOverride = true;
			},
			setAgentMode: (mode) => {
				this.agentMode = mode;
			},
		};
	}
}

/** Runtime BackgroundCommandService 到宿主工作面板合同的无状态投影。 */
export class GreenfieldBackgroundWorkController implements RuntimeSessionBackgroundWorkController {
	constructor(
		private readonly backgroundService: BackgroundCommandService,
		private readonly subagents?: GreenfieldSubagentWorkRuntime,
	) {}

	clearFinished(): number {
		return this.backgroundService.clearFinished() + (this.subagents?.clearFinished() ?? 0);
	}

	killTask(taskId: string): boolean {
		return this.backgroundService.stop(taskId, "user");
	}

	readTasks(): ReturnType<RuntimeSessionBackgroundWorkController["readTasks"]> {
		return this.backgroundService.list().map((task) => ({ ...task }));
	}

	readSubagents(): readonly RuntimeSubagentSnapshot[] {
		return this.subagents?.list().map((subagent) => ({ ...subagent, usage: { ...subagent.usage } })) ?? [];
	}

	interruptSubagent(target: string): RuntimeSubagentSnapshot | undefined {
		return this.subagents?.interrupt(target);
	}
}
