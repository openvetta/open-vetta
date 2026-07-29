import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import {
	assessRuntimeHostSessionAssembly,
	type ConversationScenario,
	type GreenfieldRuntimeSession,
	type RuntimeHostSessionAssembly,
	type RuntimeHostSessionAssemblyAssessment,
	type RuntimeHostSessionBackend,
	type RuntimeSessionCreateRequest,
} from "@vetta/runtime-core";
import type { GreenfieldCliSessionOptions, GreenfieldRuntimeComposition } from "./greenfield-runtime-composition.js";
import { resolveGreenfieldSessionIdFromPath } from "./rpc/greenfield-conversation-path.js";

export interface GreenfieldRuntimeHostSessionBackendOptions {
	readonly composition: GreenfieldRuntimeComposition;
	readonly conversationDir: string;
	readonly cwd: string;
	readonly agentDir?: string;
	readonly scenario: ConversationScenario;
	readonly enableSubagents: boolean;
	readonly serverUrl?: string;
}

/**
 * 将 RuntimeHost 的实现无关请求适配到一个已组合的 Greenfield Backend。
 *
 * 组合根固定的参数必须相等；尚未接线的宿主能力必须显式失败，禁止静默丢失。
 */
export class GreenfieldRuntimeHostSessionBackend implements RuntimeHostSessionBackend {
	private readonly sessions = new Map<string, GreenfieldRuntimeSession>();
	private readonly assessments = new Map<string, RuntimeHostSessionAssemblyAssessment>();

	constructor(private readonly options: GreenfieldRuntimeHostSessionBackendOptions) {}

	async createAssembly(request: RuntimeSessionCreateRequest): Promise<RuntimeHostSessionAssembly> {
		this.assertSupportedRequest(request);
		const sessionPath = request.sessionPath?.trim();
		const sessionOptions = this.toSessionOptions(request);
		const session = sessionPath
			? await this.options.composition.backend.resume(sessionOptions)
			: await this.options.composition.backend.create(sessionOptions);
		const assessment = assessRuntimeHostSessionAssembly(session.createRuntimeHostAssemblyCandidate());
		if (!assessment.ready) {
			await session.dispose();
			throw new Error(`Greenfield RuntimeHost assembly is incomplete: ${assessment.missingPorts.join(", ")}`);
		}

		const sessionId = session.sessionId;
		this.sessions.set(sessionId, session);
		this.assessments.set(sessionId, assessment);
		const lifecycle = assessment.assembly.lifecycle;
		return {
			...assessment.assembly,
			lifecycle: {
				...lifecycle,
				dispose: async () => {
					try {
						await lifecycle.dispose();
					} finally {
						this.sessions.delete(sessionId);
						this.assessments.delete(sessionId);
					}
				},
			},
		};
	}

	readSession(sessionId: string): GreenfieldRuntimeSession | undefined {
		return this.sessions.get(sessionId);
	}

	readAssessment(sessionId: string): RuntimeHostSessionAssemblyAssessment | undefined {
		return this.assessments.get(sessionId);
	}

	private toSessionOptions(request: RuntimeSessionCreateRequest): GreenfieldCliSessionOptions {
		const sessionPath = request.sessionPath?.trim();
		const sessionId = sessionPath
			? resolveGreenfieldSessionIdFromPath(this.options.conversationDir, sessionPath)
			: randomUUID();
		if (!sessionId) {
			throw new Error(`Greenfield session path is invalid: ${request.sessionPath}`);
		}
		return {
			sessionId,
			cwd: request.cwd ?? this.options.cwd,
			model: request.model,
			thinkingLevel: request.thinkingLevel,
			agentMode: request.agentMode,
			executionMode: request.executionMode,
			env: request.env,
			enableBackgroundTasks: request.enableBackgroundTasks,
			includeAgentSkills: request.includeAgentSkills,
			sandboxHostPath: request.sandboxHostPath,
			linuxBubblewrapPath: request.linuxBubblewrapPath,
			macosSandboxExecPath: request.macosSandboxExecPath,
			systemPromptAddon: request.appendSystemPrompt,
		};
	}

	private assertSupportedRequest(request: RuntimeSessionCreateRequest): void {
		assertSamePath("cwd", request.cwd, this.options.cwd);
		assertSamePath("sessionDir", request.sessionDir, this.options.conversationDir);
		assertSamePath("agentDir", request.agentDir, this.options.agentDir);
		if (request.scenario !== undefined && request.scenario !== this.options.scenario) {
			throw new Error(
				`Greenfield RuntimeHost scenario mismatch: expected ${this.options.scenario}, received ${request.scenario}`,
			);
		}
		if (request.enableSubagents !== this.options.enableSubagents) {
			throw new Error(
				`Greenfield RuntimeHost subagent mismatch: expected ${this.options.enableSubagents}, received ${request.enableSubagents}`,
			);
		}
		if (request.serverUrl !== undefined && request.serverUrl !== this.options.serverUrl) {
			throw new Error("Greenfield RuntimeHost serverUrl is not supported by this composition");
		}
		const unsupported = [
			request.agentPlugins !== undefined ? "agentPlugins" : undefined,
			request.invokePluginTool !== undefined ? "invokePluginTool" : undefined,
			request.invokePluginContinuation !== undefined ? "invokePluginContinuation" : undefined,
			request.invokePluginSystemPrompt !== undefined ? "invokePluginSystemPrompt" : undefined,
			request.askUserQuestion !== undefined ? "askUserQuestion" : undefined,
		].filter((name): name is string => name !== undefined);
		if (unsupported.length > 0) {
			throw new Error(`Greenfield RuntimeHost request capabilities are not supported: ${unsupported.join(", ")}`);
		}
	}
}

function assertSamePath(name: string, requested: string | undefined, configured: string | undefined): void {
	if (requested === undefined) return;
	if (configured !== undefined && resolve(requested) === resolve(configured)) return;
	throw new Error(
		`Greenfield RuntimeHost ${name} mismatch: expected ${configured ?? "<unset>"}, received ${requested}`,
	);
}
