import { resolve } from "node:path";
import { FileConversationRuntimeSessionCatalog } from "@vetta/runtime-storage/conversation";
import {
	createGreenfieldRuntimeComposition,
	type GreenfieldCliSessionOptions,
	type GreenfieldRuntimeComposition,
	type GreenfieldRuntimeCompositionOptions,
} from "../../../../cli-app/src/greenfield-runtime-composition.js";
import { GreenfieldRuntimeHostSessionBackend } from "../../../../cli-app/src/greenfield-runtime-host-session-backend.js";
import {
	CatalogRoutedRuntimeHostSessionBackend,
	type ConversationScenario,
	type GreenfieldRuntimeSession,
	RuntimeHost,
	type RuntimeHostSessionAssemblyAssessment,
} from "../../../../runtime-core/src/index.js";

export type DesktopGreenfieldSessionOptions = Pick<
	GreenfieldCliSessionOptions,
	| "cwd"
	| "model"
	| "thinkingLevel"
	| "agentMode"
	| "executionMode"
	| "env"
	| "enableBackgroundTasks"
	| "includeAgentSkills"
	| "systemPromptAddon"
>;

export interface DesktopGreenfieldSessionCandidate {
	readonly session: GreenfieldRuntimeSession;
	readonly assessment: RuntimeHostSessionAssemblyAssessment;
}

/**
 * Desktop 的非生产 Greenfield 组合。
 *
 * Candidate 已经穿过真实 RuntimeHost 与格式路由门禁；生产 runtime.ts 仍显式
 * 使用 Legacy Backend，不会因本对象存在而切换默认实现。
 */
export class DesktopGreenfieldRuntimeCandidate {
	constructor(
		private readonly composition: GreenfieldRuntimeComposition,
		private readonly runtime: RuntimeHost,
		private readonly backend: GreenfieldRuntimeHostSessionBackend,
		private readonly conversationDir: string,
		private readonly cwd: string,
		private readonly agentDir: string | undefined,
		private readonly scenario: ConversationScenario,
	) {}

	async createSession(options: DesktopGreenfieldSessionOptions = {}): Promise<DesktopGreenfieldSessionCandidate> {
		this.assertWorkspace(options.cwd);
		const result = await this.runtime.createSession(this.toSessionConfig(options));
		return this.readCandidate(result.sessionId);
	}

	async resumeSession(
		sessionPath: string,
		options: DesktopGreenfieldSessionOptions = {},
	): Promise<DesktopGreenfieldSessionCandidate> {
		this.assertWorkspace(options.cwd);
		const result = await this.runtime.createSession({
			...this.toSessionConfig(options),
			sessionPath,
		});
		return this.readCandidate(result.sessionId);
	}

	disposeSession(sessionId: string): Promise<void> {
		return this.runtime.disposeSession(sessionId);
	}

	async dispose(): Promise<void> {
		await this.runtime.disposeAllSessions();
		await this.composition.dispose();
	}

	private toSessionConfig(options: DesktopGreenfieldSessionOptions) {
		return {
			cwd: this.cwd,
			agentDir: this.agentDir,
			sessionDir: this.conversationDir,
			model: options.model,
			thinkingLevel: options.thinkingLevel,
			scenario: this.scenario,
			agentMode: options.agentMode,
			executionMode: options.executionMode,
			appendSystemPrompt: options.systemPromptAddon,
			env: options.env ? { ...options.env } : undefined,
			enableBackgroundTasks: options.enableBackgroundTasks,
			includeAgentSkills: options.includeAgentSkills,
		};
	}

	private readCandidate(sessionId: string): DesktopGreenfieldSessionCandidate {
		const session = this.backend.readSession(sessionId);
		const assessment = this.backend.readAssessment(sessionId);
		if (!session || !assessment) {
			throw new Error(`Greenfield RuntimeHost candidate was not retained: ${sessionId}`);
		}
		return { session, assessment };
	}

	private assertWorkspace(cwd: string | undefined): void {
		if (cwd !== undefined && resolve(cwd) !== resolve(this.cwd)) {
			throw new Error("Greenfield candidate session cwd must match its workspace-scoped composition");
		}
	}
}

export async function createDesktopGreenfieldRuntimeCandidate(
	options: GreenfieldRuntimeCompositionOptions,
): Promise<DesktopGreenfieldRuntimeCandidate> {
	const scenario = options.scenario ?? "conversation";
	const enableSubagents = isInteractiveScenario(scenario);
	if (options.enableSubagents !== undefined && options.enableSubagents !== enableSubagents) {
		throw new Error(
			`Desktop Greenfield candidate subagent setting conflicts with RuntimeHost scenario policy: ${scenario}`,
		);
	}
	const composition = await createGreenfieldRuntimeComposition({
		...options,
		scenario,
		enableSubagents,
	});
	const cwd = options.cwd ?? process.cwd();
	const catalog = new FileConversationRuntimeSessionCatalog({
		roots: [{ cwd, sessionDir: options.conversationDir }],
		ownershipManager: options.conversationOwnershipManager,
	});
	const backend = new GreenfieldRuntimeHostSessionBackend({
		composition,
		conversationDir: options.conversationDir,
		cwd,
		agentDir: options.agentDir,
		scenario,
		enableSubagents,
	});
	const routedBackend = new CatalogRoutedRuntimeHostSessionBackend({
		defaultBackend: backend,
		routes: [{ catalog, backend }],
	});
	const runtime = new RuntimeHost({
		sessionBackend: routedBackend,
		sessionCatalog: catalog,
	});
	return new DesktopGreenfieldRuntimeCandidate(
		composition,
		runtime,
		backend,
		options.conversationDir,
		cwd,
		options.agentDir,
		scenario,
	);
}

function isInteractiveScenario(scenario: ConversationScenario): boolean {
	return scenario === "conversation" || scenario === "project" || scenario === "cli";
}
