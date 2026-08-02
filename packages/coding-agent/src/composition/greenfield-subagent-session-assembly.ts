import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { Message } from "@vetta/ai";
import type { EcosystemHookRuntime } from "@vetta/ecosystem-adapter";
import type {
	ConversationScenario,
	GreenfieldRuntimeResourceContext,
	GreenfieldRuntimeSession,
	SessionConfig,
} from "@vetta/runtime-core";
import type { SessionContextRecord } from "@vetta/runtime-core/kernel";
import type { McpRuntimeToolView } from "@vetta/runtime-mcp";
import { FileConversationRepository } from "@vetta/runtime-storage/conversation";
import type {
	SubagentChildHandle,
	SubagentLifecycle,
	SubagentSnapshot,
	SubagentSpawnRequest,
	SubagentTypeDefinition,
} from "@vetta/runtime-subagents";
import type { CodingToolActivation } from "@vetta/runtime-tools/coding";
import { createGreenfieldSubagentChildHandle } from "./greenfield-subagent-child.js";
import { type GreenfieldSubagentProfile, GreenfieldSubagentRuntime } from "./greenfield-subagent-runtime.js";

export interface GreenfieldSubagentChildSessionOptions {
	readonly sessionId: string;
	readonly cwd: string;
	readonly parentSessionPath: string;
	readonly systemPromptAddon: string;
	readonly forkContextMessages?: readonly Message[];
	readonly initialTodos?: readonly string[];
}

export interface GreenfieldSubagentChildCompositionRequest {
	readonly conversationDir: string;
	readonly cwd: string;
	readonly initialModel: NonNullable<SessionConfig["model"]>;
	readonly initialThinkingLevel: NonNullable<SessionConfig["thinkingLevel"]>;
	readonly activation: CodingToolActivation;
	readonly inheritedMcpView: McpRuntimeToolView;
}

export interface GreenfieldSubagentChildComposition {
	createSession(options: GreenfieldSubagentChildSessionOptions): Promise<GreenfieldRuntimeSession>;
	resumeSession(options: GreenfieldSubagentChildSessionOptions): Promise<GreenfieldRuntimeSession>;
	appendSessionContext(sessionId: string, records: readonly SessionContextRecord[]): void;
	deliverSessionContext(sessionId: string, records: readonly SessionContextRecord[]): Promise<void>;
	dispose(): Promise<void>;
}

export interface GreenfieldSubagentSessionAssemblyOptions {
	readonly enabled: boolean;
	readonly maxConcurrent?: number;
	readonly cwd: string;
	readonly scenario: ConversationScenario;
	readonly readParentSessionId: () => string;
	readonly readParentSessionPath: () => string;
	readonly readParentMessages: () => Promise<readonly Message[]>;
	readonly readModel: () => NonNullable<SessionConfig["model"]>;
	readonly readThinkingLevel: () => NonNullable<SessionConfig["thinkingLevel"]>;
	readonly readInheritedMcpView: () => Promise<McpRuntimeToolView>;
	readonly createChildComposition: (
		request: GreenfieldSubagentChildCompositionRequest,
	) => Promise<GreenfieldSubagentChildComposition>;
	readonly hookRuntime: Pick<
		EcosystemHookRuntime,
		"recordAdditionalContexts" | "runSubagentStart" | "runSubagentStop"
	>;
	readonly resourceContext: Pick<GreenfieldRuntimeResourceContext, "deliverAsyncContext" | "reportObservation">;
}

/** 组装单个父 Session 的 Subagent 能力；Composition Root 只提供宿主端口。 */
export function createGreenfieldSubagentSessionAssembly(
	options: GreenfieldSubagentSessionAssemblyOptions,
): GreenfieldSubagentRuntime | undefined {
	if (!options.enabled) return undefined;

	const lifecycle = createSubagentLifecycle(options);
	return new GreenfieldSubagentRuntime({
		parentSessionId: options.readParentSessionId(),
		maxConcurrent: options.maxConcurrent,
		lifecycle,
		readParentMessages: options.readParentMessages,
		createChild: (request, type, forkContext) => openChild("create", request, type, forkContext, options),
		reopenChild: (snapshot, type, forkContext) => openChild("resume", snapshot, type, forkContext, options),
		validateRecoveredChild: (snapshot) =>
			validateRecoveredSubagentTranscript(snapshot, options.readParentSessionPath()),
		onRecoveryIssue: (message) => {
			console.warn("[greenfield-runtime] subagent recovery issue", message);
		},
		onNotify: (payload) => {
			void options.resourceContext
				.deliverAsyncContext([
					{
						type: "subagent-notification",
						content: [{ type: "text", text: payload.text }],
						modelVisible: true,
						display: true,
					},
				])
				.catch((error: unknown) => {
					console.warn("[greenfield-runtime] failed to deliver subagent notification", error);
				});
		},
		onUpdate: (agents) => {
			void options.resourceContext
				.reportObservation({
					type: "subagents_update",
					agents: agents.map(toSubagentInfo),
					source: "tool",
				})
				.catch((error: unknown) => {
					console.warn("[greenfield-runtime] failed to publish subagent observation", error);
				});
		},
	});
}

async function openChild(
	operation: "create" | "resume",
	requestOrSnapshot: SubagentSpawnRequest | SubagentSnapshot,
	type: SubagentTypeDefinition<GreenfieldSubagentProfile>,
	forkContext: readonly Message[] | undefined,
	options: GreenfieldSubagentSessionAssemblyOptions,
): Promise<SubagentChildHandle> {
	const childSessionId = operation === "create" ? randomUUID() : (requestOrSnapshot as SubagentSnapshot).id;
	const snapshot = operation === "resume" ? (requestOrSnapshot as SubagentSnapshot) : undefined;
	const parentSessionId = options.readParentSessionId();
	const childConversationDir = snapshot?.sessionFile
		? dirname(snapshot.sessionFile)
		: join(dirname(options.readParentSessionPath()), ".subagents", parentSessionId);
	const inheritedMcpView = type.profile.inheritParentMcp ? await options.readInheritedMcpView() : EMPTY_MCP_TOOL_VIEW;
	const childComposition = await options.createChildComposition({
		conversationDir: childConversationDir,
		cwd: options.cwd,
		initialModel: options.readModel(),
		initialThinkingLevel: options.readThinkingLevel(),
		activation: withInheritedMcpTools(withScenario(type.profile.activation, options.scenario), inheritedMcpView),
		inheritedMcpView,
	});
	try {
		const childOptions: GreenfieldSubagentChildSessionOptions = {
			sessionId: childSessionId,
			cwd: options.cwd,
			parentSessionPath: options.readParentSessionPath(),
			systemPromptAddon: type.profile.systemPromptAddon,
			forkContextMessages: operation === "create" ? forkContext : undefined,
			initialTodos:
				operation === "create" && type.profile.includeTodo
					? (requestOrSnapshot as SubagentSpawnRequest).todos
					: undefined,
		};
		const childSession =
			operation === "create"
				? await childComposition.createSession(childOptions)
				: await childComposition.resumeSession(childOptions);
		const childSessionFile = childSession.createCoreAssembly().lifecycle.sessionPath;
		return createGreenfieldSubagentChildHandle({
			session: childSession,
			sessionFile: childSessionFile,
			appendContext: (records) => childComposition.appendSessionContext(childSession.sessionId, records),
			deliverContext: (records) => childComposition.deliverSessionContext(childSession.sessionId, records),
			disposeComposition: () => childComposition.dispose(),
		});
	} catch (error) {
		await childComposition.dispose();
		throw error;
	}
}

function createSubagentLifecycle(options: GreenfieldSubagentSessionAssemblyOptions): SubagentLifecycle {
	return {
		beforeStart: async ({ id, agentType, message }) => {
			const outcome = await options.hookRuntime.runSubagentStart(
				{ agentId: id, agentType },
				`${options.readParentSessionId()}:subagent-start:${id}`,
			);
			await options.hookRuntime.recordAdditionalContexts(outcome.additionalContexts);
			if (outcome.shouldStop || outcome.shouldBlock) {
				return {
					blockedReason:
						outcome.stopReason ?? outcome.blockReason ?? "SubagentStart ecosystem hook blocked subagent spawn",
				};
			}
			return outcome.additionalContexts.length > 0
				? { message: `${outcome.additionalContexts.join("\n\n")}\n\n${message}` }
				: undefined;
		},
		beforeStop: async ({
			id,
			agentType,
			generation,
			stopHookActive,
			lastAssistantText,
			sessionFile,
			interrupted,
		}) => {
			const outcome = await options.hookRuntime.runSubagentStop({
				agentId: id,
				agentType,
				turnId: `${options.readParentSessionId()}:subagent-stop:${id}:${generation}`,
				stopHookActive,
				lastAssistantMessage: lastAssistantText ?? null,
				agentTranscriptPath: sessionFile ?? null,
			});
			await options.hookRuntime.recordAdditionalContexts(outcome.additionalContexts);
			if (!interrupted && outcome.shouldBlock && !outcome.shouldStop && outcome.continuationFragments.length > 0) {
				return { continuation: outcome.continuationFragments.join("\n\n") };
			}
			return undefined;
		},
	};
}

function withInheritedMcpTools(
	activation: CodingToolActivation,
	inheritedView: McpRuntimeToolView,
): CodingToolActivation {
	if (activation.mode === "scope" || inheritedView.tools.length === 0) return activation;
	return {
		mode: "explicit",
		toolNames: [...new Set([...activation.toolNames, ...inheritedView.tools.map(({ tool }) => tool.name)])],
	};
}

function withScenario(activation: CodingToolActivation, scenario: ConversationScenario): CodingToolActivation {
	return activation.mode === "scope" ? { ...activation, scope: scenario } : activation;
}

function toSubagentInfo(snapshot: SubagentSnapshot): Omit<SubagentSnapshot, "usage"> {
	const { usage: _usage, ...info } = snapshot;
	return info;
}

async function validateRecoveredSubagentTranscript(
	snapshot: SubagentSnapshot,
	parentSessionPath: string,
): Promise<string | undefined> {
	const sessionFile = snapshot.sessionFile;
	if (!sessionFile) return "Recovered subagent has no child session transcript";
	const expectedDirectory = resolve(dirname(parentSessionPath), ".subagents", snapshot.parentSessionId);
	const resolvedSessionFile = resolve(sessionFile);
	const childRepository = new FileConversationRepository({ rootDir: expectedDirectory });
	const expectedSessionFile = childRepository.resolveConversationPath(snapshot.id);
	await childRepository.close();
	if (resolvedSessionFile !== expectedSessionFile) {
		return "Recovered subagent transcript does not match the parent-owned session path";
	}
	try {
		const metadata = await stat(resolvedSessionFile);
		return metadata.isFile() ? undefined : "Recovered subagent transcript is not a file";
	} catch {
		return "Recovered subagent transcript is missing";
	}
}

const EMPTY_MCP_TOOL_VIEW: McpRuntimeToolView = Object.freeze({ tools: Object.freeze([]) });
