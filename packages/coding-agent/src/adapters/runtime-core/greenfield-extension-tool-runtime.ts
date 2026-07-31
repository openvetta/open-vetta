import type { Static, TSchema } from "@sinclair/typebox";
import type {
	ModelCallFrame,
	ModelCallFrameCompositionContext,
	RuntimeToolDefinition,
} from "@vetta/runtime-core/kernel";
import {
	CODING_TOOL_SCOPES,
	type CodingToolActivation,
	selectCodingToolRegistrations,
} from "@vetta/runtime-tools/coding";
import type { ExtensionRunner } from "../../core/extensions/runner.js";
import type { Extension, RegisteredTool } from "../../core/extensions/types.js";
import {
	type CodingAgentRuntimeToolRegistration,
	resolveCodingAgentRuntimeToolCategory,
} from "./greenfield-tool-adapter.js";

export interface CodingAgentGreenfieldExtensionToolSurface {
	readonly frame: ModelCallFrame;
	readonly availableTools: ReadonlyMap<string, RuntimeToolDefinition>;
}

/**
 * 进程级 Extension Tool 注册表与 Session Runner 绑定。
 *
 * 注册定义在 Composition 创建时按 Legacy first-wins 规则冻结；执行上下文按 request.sessionId
 * 解析到对应 Session Runner。工具只在当前模型调用 Frame 中覆盖同名能力，不进入 Runtime Core。
 */
export class CodingAgentGreenfieldExtensionToolRuntime {
	private registrations: readonly CodingAgentRuntimeToolRegistration[] = [];
	private registrationsByName: ReadonlyMap<string, CodingAgentRuntimeToolRegistration> = new Map();
	private readonly runners = new Map<string, ExtensionRunner>();

	constructor(extensions: readonly Extension[]) {
		this.refresh(extensions);
	}

	refresh(extensions: readonly Extension[]): void {
		this.registrations = Object.freeze(collectRegisteredTools(extensions).map((tool) => this.adaptTool(tool)));
		this.registrationsByName = new Map(
			this.registrations.map((registration) => [registration.tool.name, registration]),
		);
	}

	hasTools(): boolean {
		return this.registrations.length > 0;
	}

	hasTool(toolName: string): boolean {
		return this.registrationsByName.has(toolName);
	}

	readAvailableTools(): ReadonlyMap<string, RuntimeToolDefinition> {
		return new Map(this.registrations.map(({ tool }) => [tool.name, tool]));
	}

	readActiveToolNames(activation: CodingToolActivation): readonly string[] {
		return selectCodingToolRegistrations(this.registrations, activation).map(({ tool }) => tool.name);
	}

	compose(
		context: ModelCallFrameCompositionContext,
		baseAvailableTools: ReadonlyMap<string, RuntimeToolDefinition>,
		activation: CodingToolActivation,
	): CodingAgentGreenfieldExtensionToolSurface {
		const availableTools = new Map(baseAvailableTools);
		const activeTools = new Map(context.frame.tools);
		const selected = new Set(this.readActiveToolNames(activation));

		for (const { tool } of this.registrations) {
			availableTools.set(tool.name, tool);
			activeTools.delete(tool.name);
			if (selected.has(tool.name)) activeTools.set(tool.name, tool);
		}

		return {
			frame: { instructions: context.frame.instructions, tools: activeTools },
			availableTools,
		};
	}

	bindRunner(
		sessionId: string,
		runner: ExtensionRunner,
		options: { readonly replaceExisting?: boolean } = {},
	): () => void {
		const current = this.runners.get(sessionId);
		if (current && current !== runner && options.replaceExisting !== true) {
			throw new Error(`Greenfield Extension tool runner is already bound: ${sessionId}`);
		}
		this.runners.set(sessionId, runner);
		return () => {
			for (const [boundSessionId, candidate] of this.runners) {
				if (candidate === runner) this.runners.delete(boundSessionId);
			}
		};
	}

	rebindSession(previousSessionId: string, nextSessionId: string): void {
		if (previousSessionId === nextSessionId) return;
		const runner = this.runners.get(previousSessionId);
		if (!runner) return;
		const existing = this.runners.get(nextSessionId);
		if (existing && existing !== runner) {
			throw new Error(`Greenfield Extension tool runner is already bound: ${nextSessionId}`);
		}
		this.runners.delete(previousSessionId);
		this.runners.set(nextSessionId, runner);
	}

	private adaptTool(registeredTool: RegisteredTool): CodingAgentRuntimeToolRegistration {
		const { definition } = registeredTool;
		return {
			tool: {
				name: definition.name,
				label: definition.label,
				description: definition.description,
				inputSchema: definition.parameters,
				execute: async (request) => {
					const runner = this.runners.get(request.sessionId);
					if (!runner) {
						throw new Error(`Greenfield Extension tool runner is not bound: ${request.sessionId}`);
					}
					return definition.execute(
						request.toolCallId,
						request.input as Static<TSchema>,
						request.signal,
						request.onUpdate,
						runner.createContext(),
					);
				},
			},
			scopeUse: definition.scope_use ?? CODING_TOOL_SCOPES,
			requires: definition.requires,
			category: resolveCodingAgentRuntimeToolCategory(definition.category),
		};
	}
}

function collectRegisteredTools(extensions: readonly Extension[]): RegisteredTool[] {
	const toolsByName = new Map<string, RegisteredTool>();
	for (const extension of extensions) {
		for (const tool of extension.tools.values()) {
			if (!toolsByName.has(tool.definition.name)) toolsByName.set(tool.definition.name, tool);
		}
	}
	return [...toolsByName.values()];
}
