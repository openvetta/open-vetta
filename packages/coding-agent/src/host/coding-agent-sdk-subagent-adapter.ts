import { Type } from "@sinclair/typebox";
import type { AgentMessage, AgentTool } from "@vetta/agent-core";
import type { Message } from "@vetta/ai";
import type { RuntimeToolResult } from "@vetta/runtime-core/kernel";
import type { McpRuntimeToolView } from "@vetta/runtime-mcp";
import type {
	SubagentChildHandle,
	SubagentSnapshot,
	SubagentSpawnRequest,
	SubagentTypeDefinition,
	SubagentTypeRegistryLike,
} from "@vetta/runtime-subagents";
import type { CodingAgentRuntimeToolRegistration } from "../adapters/runtime-core/greenfield.js";
import type { GreenfieldSubagentProfile } from "../composition/greenfield-subagent-runtime.js";
import type {
	GreenfieldSubagentChildFactory,
	GreenfieldSubagentChildFactoryContext,
} from "../composition/greenfield-subagent-session-assembly.js";
import type { ModelRegistry } from "../core/model-registry.js";
import { ALL_SCENARIOS, type ConversationScenario } from "../core/session/tool-scope.js";
import {
	createDefaultSubagentTypeRegistry,
	type SubagentChildHandle as LegacySubagentChildHandle,
	type SubagentSessionFactory as LegacySubagentSessionFactory,
	type SubagentSnapshot as LegacySubagentSnapshot,
	type SubagentSpawnRequest as LegacySubagentSpawnRequest,
	type SubagentTypeDefinition as LegacySubagentTypeDefinition,
	type SubagentTypeRegistryLike as LegacySubagentTypeRegistryLike,
	type SubagentParentContext,
} from "../core/subagents/index.js";

export interface CodingAgentSdkSubagentAdapterOptions {
	readonly typeRegistry?: LegacySubagentTypeRegistryLike;
	readonly sessionFactory?: LegacySubagentSessionFactory;
	readonly modelRegistry: ModelRegistry;
	readonly agentDir?: string;
}

export interface CodingAgentSdkSubagentAdapters {
	readonly typeRegistry: SubagentTypeRegistryLike<GreenfieldSubagentProfile>;
	readonly createChildFactory?: (context: GreenfieldSubagentChildFactoryContext) => GreenfieldSubagentChildFactory;
}

/** 将公开 SDK 的 Legacy 子代理扩展点限制在产品宿主边界，不让具体类型进入 Runtime。 */
export function adaptCodingAgentSdkSubagents(
	options: CodingAgentSdkSubagentAdapterOptions,
): CodingAgentSdkSubagentAdapters | undefined {
	if (!options.typeRegistry && !options.sessionFactory) return undefined;
	const legacyRegistry = options.typeRegistry ?? createDefaultSubagentTypeRegistry();
	const sessionFactory = options.sessionFactory;
	const typeRegistry = new LiveSdkSubagentTypeRegistry(legacyRegistry);
	return {
		typeRegistry,
		createChildFactory: sessionFactory
			? (context) =>
					createLegacyChildFactory({
						context,
						legacyRegistry,
						sessionFactory,
						modelRegistry: options.modelRegistry,
						agentDir: options.agentDir,
					})
			: undefined,
	};
}

class LiveSdkSubagentTypeRegistry implements SubagentTypeRegistryLike<GreenfieldSubagentProfile> {
	constructor(private readonly source: LegacySubagentTypeRegistryLike) {}

	get(id: string): SubagentTypeDefinition<GreenfieldSubagentProfile> | undefined {
		const definition = this.source.get(id);
		return definition ? adaptTypeDefinition(definition) : undefined;
	}

	list(): readonly SubagentTypeDefinition<GreenfieldSubagentProfile>[] {
		return this.source.list().map(adaptTypeDefinition);
	}

	ids(): readonly string[] {
		return this.source.ids();
	}

	describeForTools(): string {
		return this.source.describeForTools();
	}
}

function adaptTypeDefinition(
	definition: LegacySubagentTypeDefinition,
): SubagentTypeDefinition<GreenfieldSubagentProfile> {
	return {
		id: definition.id,
		label: definition.label,
		description: definition.description,
		profile: {
			activation: { mode: "explicit", toolNames: [] },
			inheritParentMcp: definition.inheritParentMcp,
			systemPromptAddon: definition.systemPromptAddon,
			forkParentContext: definition.forkParentContext === true,
			includeTodo: definition.includeTodoTool === true,
			createRuntimeTools: (cwd) => definition.createBuiltinTools(cwd).map((tool) => adaptLegacyBuiltinTool(tool)),
			denyToolNamePrefixes: definition.denyToolNamePrefixes,
		},
	};
}

interface CreateLegacyChildFactoryOptions {
	readonly context: GreenfieldSubagentChildFactoryContext;
	readonly legacyRegistry: LegacySubagentTypeRegistryLike;
	readonly sessionFactory: LegacySubagentSessionFactory;
	readonly modelRegistry: ModelRegistry;
	readonly agentDir?: string;
}

function createLegacyChildFactory(options: CreateLegacyChildFactoryOptions): GreenfieldSubagentChildFactory {
	const reopen = options.sessionFactory.reopen;
	return {
		create: async (request, type, forkContext, signal) => {
			const legacyType = requireLegacyType(options.legacyRegistry, type.id);
			const child = await options.sessionFactory.create(
				toLegacySpawnRequest(request),
				await createParentContext(options, forkContext),
				legacyType,
				signal,
			);
			return adaptLegacyChildHandle(child);
		},
		reopen: reopen
			? async (snapshot, type, forkContext, signal) => {
					const legacyType = requireLegacyType(options.legacyRegistry, type.id);
					const child = await reopen(
						toLegacySnapshot(snapshot),
						await createParentContext(options, forkContext),
						legacyType,
						signal,
					);
					return adaptLegacyChildHandle(child);
				}
			: undefined,
	};
}

async function createParentContext(
	options: CreateLegacyChildFactoryOptions,
	forkContext: readonly Message[] | undefined,
): Promise<SubagentParentContext> {
	const { context } = options;
	const parentSessionId = context.readParentSessionId();
	return {
		parentSessionId,
		parentSessionFile: context.readParentSessionPath(),
		cwd: context.cwd,
		scenario: context.scenario,
		model: context.readModel(),
		thinkingLevel: context.readThinkingLevel(),
		agentDir: options.agentDir,
		modelRegistry: options.modelRegistry,
		parentMcpTools: adaptMcpTools(await context.readInheritedMcpView(), parentSessionId),
		forkContextMessages: forkContext ? ([...forkContext] as AgentMessage[]) : undefined,
	};
}

function adaptMcpTools(view: McpRuntimeToolView, parentSessionId: string): AgentTool[] {
	return view.tools.map(
		({ tool }): AgentTool => ({
			name: tool.name,
			label: tool.label,
			description: tool.description,
			parameters: Type.Unsafe<unknown>({ ...tool.inputSchema }),
			scope_use: ["cli"],
			async execute(toolCallId, input, signal, onUpdate, context) {
				if (!isRecordInput(input)) {
					throw new Error(`Invalid input for inherited MCP tool "${tool.name}"`);
				}
				const effectiveSignal = signal ?? new AbortController().signal;
				const result = await tool.execute({
					sessionId: parentSessionId,
					turnId: `${parentSessionId}:legacy-subagent:${toolCallId}`,
					toolCallId,
					input,
					signal: effectiveSignal,
					onUpdate: onUpdate ? (update) => onUpdate(toLegacyToolResult(update)) : undefined,
					reportPhase: context?.phase,
				});
				return toLegacyToolResult(result);
			},
		}),
	);
}

function isRecordInput(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function adaptLegacyBuiltinTool(tool: AgentTool): CodingAgentRuntimeToolRegistration {
	return {
		tool: {
			name: tool.name,
			label: tool.label,
			description: tool.description,
			inputSchema: tool.parameters,
			async execute(request) {
				const result = await tool.execute(
					request.toolCallId,
					request.input,
					request.signal,
					request.onUpdate ? (update) => request.onUpdate?.(toRuntimeToolResult(update)) : undefined,
					request.reportPhase ? { phase: request.reportPhase } : undefined,
				);
				return toRuntimeToolResult(result);
			},
		},
		scopeUse: (tool.scope_use ?? []).filter(isConversationScenario),
		requires: tool.requires,
		agentModes: tool.agent_mode,
		category: resolveCategory(tool.category),
	};
}

function toLegacyToolResult(result: RuntimeToolResult) {
	return { content: [...result.content], details: result.details };
}

function toRuntimeToolResult(result: Awaited<ReturnType<AgentTool["execute"]>>): RuntimeToolResult {
	return { content: [...result.content], details: result.details };
}

function isConversationScenario(value: string): value is ConversationScenario {
	return ALL_SCENARIOS.some((scenario) => scenario === value);
}

function resolveCategory(category: string | undefined): CodingAgentRuntimeToolRegistration["category"] {
	return category === "core" ||
		category === "doc" ||
		category === "kb-write" ||
		category === "kb-read" ||
		category === "agent-control" ||
		category === "media" ||
		category === "im" ||
		category === "memory" ||
		category === "external"
		? category
		: "external";
}

function requireLegacyType(registry: LegacySubagentTypeRegistryLike, id: string): LegacySubagentTypeDefinition {
	const definition = registry.get(id);
	if (!definition) throw new Error(`SDK subagent type "${id}" is no longer registered`);
	return definition;
}

function toLegacySpawnRequest(request: SubagentSpawnRequest): LegacySubagentSpawnRequest {
	return {
		taskName: request.taskName,
		message: request.message,
		agentType: request.agentType,
		todos: request.todos ? [...request.todos] : undefined,
		title: request.title,
	};
}

function toLegacySnapshot(snapshot: SubagentSnapshot): LegacySubagentSnapshot {
	return {
		...snapshot,
		usage: { ...snapshot.usage },
		todoProgress: snapshot.todoProgress ? { ...snapshot.todoProgress } : undefined,
	};
}

function adaptLegacyChildHandle(child: LegacySubagentChildHandle): SubagentChildHandle {
	const setTodos = child.setTodos;
	const getTodoProgress = child.getTodoProgress;
	const subscribeTodos = child.subscribeTodos;
	return {
		sessionId: child.sessionId,
		sessionFile: child.sessionFile,
		prompt: (text) => child.prompt(text),
		sendMessage: (text) => child.sendMessage(text),
		followUp: (text) => child.followUp(text),
		abort: () => child.abort(),
		waitForIdle: () => child.waitForIdle(),
		isStreaming: () => child.isStreaming(),
		getLastAssistantText: () => child.getLastAssistantText(),
		dispose: () => (child.close ? child.close() : child.dispose()),
		subscribe: (listener) => child.subscribe((event) => listener({ type: event.type })),
		setTodos: setTodos ? (contents) => setTodos([...contents]) : undefined,
		getTodoProgress: getTodoProgress ? () => ({ ...getTodoProgress() }) : undefined,
		subscribeTodos: subscribeTodos
			? (listener) => subscribeTodos((progress) => listener({ ...progress }))
			: undefined,
	};
}
