/**
 * Runtime manager — tool runtime assembly, extension lifecycle, and MCP.
 *
 * Extracted from AgentSession. Owns the tool registries, the base system prompt,
 * the extension runner + its bindings, and the MCP manager. The facade delegates
 * tool/extension/MCP operations here; `bindCore` wires the extension runtime back
 * to the facade (the `host`) for the broad set of session controls it exposes.
 */

import { basename, dirname } from "node:path";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { resetApiProviders } from "@mariozechner/pi-ai";
import type { AgentSession, ExtensionBindings } from "../agent-session.js";
import type { BackgroundTaskManager } from "../background-tasks/index.js";
import {
	type ExtensionCommandContextActions,
	type ExtensionErrorListener,
	ExtensionRunner,
	type ExtensionUIContext,
	type ShutdownHandler,
	type ToolDefinition,
	type ToolInfo,
	wrapRegisteredTools,
	wrapToolsWithExtensions,
} from "../extensions/index.js";
import { createMcpManager, type McpManager } from "../mcp/index.js";
import type { ResourceExtensionPaths, ResourceLoader } from "../resource-loader.js";
import type { TodoStore } from "../todo-store.js";
import {
	type AskUserQuestionCapability,
	type BashSpawnHook,
	createAllTools,
	createAskUserQuestionTool,
	getDefaultCodingToolNames,
} from "../tools/index.js";
import { createInvokeSkillTool } from "../tools/invoke-skill/index.js";
import { createTaskOutputTool } from "../tools/task-output/index.js";
import { createTaskStopTool } from "../tools/task-stop/index.js";
import { createTodoTool } from "../tools/todo/index.js";
import { bindExtensionCore } from "./extension-binding.js";
import type { SessionContext } from "./session-context.js";
import { personalizationSig, rebuildSystemPrompt } from "./system-prompt-builder.js";

export interface RuntimeManagerOptions {
	resourceLoader: ResourceLoader;
	todoStore: TodoStore;
	customTools: ToolDefinition[];
	baseToolsOverride?: Record<string, AgentTool>;
	envOverlay?: Record<string, string>;
	initialActiveToolNames?: string[];
	extensionRunnerRef?: { current?: ExtensionRunner };
	enableMcp: boolean;
	mcpDebug: boolean;
	askUserQuestion?: AskUserQuestionCapability;
	backgroundTasks: BackgroundTaskManager;
	/** false 时 bash/shell 禁用 run_in_background，且不注册 task_output/task_stop */
	enableBackgroundTasks: boolean;
}

export class RuntimeManager {
	private readonly resourceLoader: ResourceLoader;
	private readonly todoStore: TodoStore;
	private _customTools: ToolDefinition[];
	private readonly _baseToolsOverride?: Record<string, AgentTool>;
	private readonly _envOverlay?: Record<string, string>;
	private readonly _initialActiveToolNames?: string[];
	private readonly _extensionRunnerRef?: { current?: ExtensionRunner };
	private readonly _askUserQuestion?: AskUserQuestionCapability;
	private readonly _backgroundTasks: BackgroundTaskManager;
	private readonly _enableBackgroundTasks: boolean;

	private _baseToolRegistry: Map<string, AgentTool> = new Map();
	private _toolRegistry: Map<string, AgentTool> = new Map();
	private _baseSystemPrompt = "";
	private _personalizationSignature: string | undefined = undefined;
	private _askUserQuestionEnabledLastBuilt = false;

	private _extensionRunner: ExtensionRunner | undefined = undefined;
	private _extensionUIContext?: ExtensionUIContext;
	private _extensionCommandContextActions?: ExtensionCommandContextActions;
	private _extensionShutdownHandler?: ShutdownHandler;
	private _extensionErrorListener?: ExtensionErrorListener;
	private _extensionErrorUnsubscriber?: () => void;

	private _mcpManager: McpManager | undefined = undefined;
	private readonly _enableMcp: boolean;
	private readonly _mcpDebug: boolean;
	private _mcpInitPromise: Promise<void> | undefined = undefined;

	constructor(
		private readonly ctx: SessionContext,
		private readonly host: AgentSession,
		opts: RuntimeManagerOptions,
	) {
		this.resourceLoader = opts.resourceLoader;
		this.todoStore = opts.todoStore;
		this._customTools = opts.customTools;
		this._baseToolsOverride = opts.baseToolsOverride;
		this._envOverlay = opts.envOverlay;
		this._initialActiveToolNames = opts.initialActiveToolNames;
		this._extensionRunnerRef = opts.extensionRunnerRef;
		this._enableMcp = opts.enableMcp;
		this._mcpDebug = opts.mcpDebug;
		this._askUserQuestion = opts.askUserQuestion;
		this._backgroundTasks = opts.backgroundTasks;
		this._enableBackgroundTasks = opts.enableBackgroundTasks;
	}

	get extensionRunner(): ExtensionRunner | undefined {
		return this._extensionRunner;
	}

	get mcpManager(): McpManager | undefined {
		return this._mcpManager;
	}

	get baseSystemPrompt(): string {
		return this._baseSystemPrompt;
	}

	hasExtensionHandlers(eventType: string): boolean {
		return this._extensionRunner?.hasHandlers(eventType) ?? false;
	}

	/**
	 * Initialize the MCP manager (if enabled) and kick off async server init,
	 * rebuilding the runtime once tools are available. Returns immediately.
	 */
	initMcp(): void {
		if (!this._enableMcp) return;
		this._mcpManager = createMcpManager({
			projectRoot: this.ctx.cwd,
			debug: this._mcpDebug,
			enabled: true,
		});

		// Initialize MCP servers asynchronously, then rebuild runtime to include MCP tools.
		// Keep the promise handle so the prompt entry can await it, avoiding a race where the
		// first prompt of a new session fires before init completes (LLM sees no MCP tools).
		this._mcpInitPromise = this._mcpManager
			.initialize()
			.then(() => {
				this.buildRuntime({
					activeToolNames: this._initialActiveToolNames ?? this.getActiveToolNames(),
					includeAllExtensionTools: true,
				});
			})
			.catch((error) => {
				console.error("[MCP] Failed to initialize:", error.message);
			});
	}

	/** Shutdown MCP servers (best-effort). */
	shutdown(): void {
		if (this._mcpManager) {
			this._mcpManager.shutdown().catch((error) => {
				console.error("[MCP] Failed to shutdown:", error.message);
			});
		}
	}

	getActiveToolNames(): string[] {
		return this.ctx.agent.state.tools.map((t) => t.name);
	}

	getAllTools(): ToolInfo[] {
		return Array.from(this._toolRegistry.values()).map((t) => ({
			name: t.name,
			description: t.description,
			parameters: t.parameters,
		}));
	}

	setActiveToolsByName(toolNames: string[]): void {
		const tools: AgentTool[] = [];
		const validToolNames: string[] = [];
		for (const name of toolNames) {
			const tool = this._toolRegistry.get(name);
			if (tool) {
				tools.push(tool);
				validToolNames.push(name);
			}
		}
		this.ctx.agent.setTools(tools);

		// Rebuild base system prompt with new tool set
		this._baseSystemPrompt = this.rebuildSystemPrompt(validToolNames);
		this.ctx.agent.setSystemPrompt(this._baseSystemPrompt);
	}

	reconfigureCustomTools(customTools: ToolDefinition[] | undefined): void {
		this._customTools = customTools ?? [];
		this.buildRuntime({
			activeToolNames: this.getActiveToolNames(),
			includeAllExtensionTools: true,
		});
	}

	/** Refresh skills from disk and rebuild the system prompt if any changed (prompt entry). */
	refreshSkillsForPrompt(): void {
		if (this.resourceLoader.refreshSkillsIfChanged()) {
			this._baseSystemPrompt = this.rebuildSystemPrompt(this.getActiveToolNames());
			this.ctx.agent.setSystemPrompt(this._baseSystemPrompt);
		}
	}

	private rebuildSystemPrompt(toolNames: string[]): string {
		return rebuildSystemPrompt({
			toolNames,
			baseToolRegistry: this._baseToolRegistry,
			resourceLoader: this.resourceLoader,
			mcpManager: this._mcpManager,
			cwd: this.ctx.cwd,
			settingsManager: this.ctx.settingsManager,
			memoryMode: this.ctx.memoryMode,
			memoryFile: this.ctx.memoryFile,
			memorySnapshot: this.ctx.memorySnapshot,
			memoryCharLimit: this.ctx.memoryCharLimit,
		});
	}

	/**
	 * Personalization lazy-rebuild (prompt entry): reread settings.json's
	 * personalization block and rebuild the system prompt only when the signature
	 * changes, so the change takes effect on this turn.
	 */
	maybeReloadPersonalizationForPrompt(): void {
		this.ctx.settingsManager.reloadPersonalizationSettings();
		const sig = personalizationSig(this.ctx.settingsManager);
		if (this._personalizationSignature === undefined) {
			// First prompt: the constructor already built the prompt from on-disk config;
			// just establish the baseline without rebuilding.
			this._personalizationSignature = sig;
			return;
		}
		if (sig === this._personalizationSignature) return;
		this._personalizationSignature = sig;
		this._baseSystemPrompt = this.rebuildSystemPrompt(this.getActiveToolNames());
		this.ctx.agent.setSystemPrompt(this._baseSystemPrompt);
	}

	/**
	 * ask_user_question lazy-rebuild: when the host capability toggles, rebuild so
	 * the tool is added/removed from the active set + system prompt this turn.
	 */
	maybeReloadAskUserQuestionForPrompt(): void {
		const enabled = this._askUserQuestion?.isEnabled() ?? false;
		if (enabled === this._askUserQuestionEnabledLastBuilt) return;
		this.buildRuntime({
			activeToolNames: this.getActiveToolNames(),
			includeAllExtensionTools: true,
		});
	}

	/**
	 * Reload MCP servers from disk and rebuild the runtime so the new tool set is
	 * visible to the LLM on the next turn.
	 */
	async reloadMcp(): Promise<void> {
		if (!this._mcpManager) return;
		await this._mcpManager.reload();
		this.buildRuntime({
			activeToolNames: this.getActiveToolNames(),
			includeAllExtensionTools: true,
		});
	}

	/**
	 * Prompt-entry lazy MCP check: only stop/start changed servers and rebuild
	 * when mcp.json actually changed. The fast path is nearly free; the slow path
	 * surfaces mcp_reload_start/end so the UI can hint without blocking the user.
	 */
	async maybeReloadMcpForPrompt(): Promise<void> {
		const manager = this._mcpManager;
		if (!manager) return;

		// The first prompt may race the initial initialize() — we must wait, else
		// getTools() returns partial/0 tools. Surface mcp_reload_start/end while waiting.
		const initPending = this._mcpInitPromise !== undefined;
		if (initPending) {
			this.ctx.emit({ type: "mcp_reload_start" });
			try {
				await this._mcpInitPromise;
			} catch {
				// initialize() already catches internally; defensive double-catch
			} finally {
				this._mcpInitPromise = undefined;
			}
		}

		// Avoid emitting events outside the slow path to prevent UI toast flicker.
		let willChange = false;
		try {
			willChange = manager.hasConfigChanged();
		} catch {
			// On comparison failure, fall through to reload and let reloadIfChanged decide
			willChange = true;
		}

		if (!willChange) {
			// Only emit a matching end if we emitted a start above
			if (initPending) {
				this.ctx.emit({ type: "mcp_reload_end", changed: false });
			}
			return;
		}

		if (!initPending) this.ctx.emit({ type: "mcp_reload_start" });
		let changed = false;
		let errorMessage: string | undefined;
		try {
			changed = await manager.reloadIfChanged();
			if (changed) {
				this.buildRuntime({
					activeToolNames: this.getActiveToolNames(),
					includeAllExtensionTools: true,
				});
			}
		} catch (err) {
			errorMessage = (err as Error).message;
		} finally {
			this.ctx.emit({ type: "mcp_reload_end", changed, errorMessage });
		}
	}

	async reload(): Promise<void> {
		const previousFlagValues = this._extensionRunner?.getFlagValues();
		await this._extensionRunner?.emit({ type: "session_shutdown" });
		this.ctx.settingsManager.reload();
		resetApiProviders();
		await this.resourceLoader.reload();
		this.buildRuntime({
			activeToolNames: this.getActiveToolNames(),
			flagValues: previousFlagValues,
			includeAllExtensionTools: true,
		});

		const hasBindings =
			this._extensionUIContext ||
			this._extensionCommandContextActions ||
			this._extensionShutdownHandler ||
			this._extensionErrorListener;
		if (this._extensionRunner && hasBindings) {
			await this._extensionRunner.emit({ type: "session_start" });
			await this.extendResourcesFromExtensions("reload");
		}
	}

	async bindExtensions(bindings: ExtensionBindings): Promise<void> {
		if (bindings.uiContext !== undefined) {
			this._extensionUIContext = bindings.uiContext;
		}
		if (bindings.commandContextActions !== undefined) {
			this._extensionCommandContextActions = bindings.commandContextActions;
		}
		if (bindings.shutdownHandler !== undefined) {
			this._extensionShutdownHandler = bindings.shutdownHandler;
		}
		if (bindings.onError !== undefined) {
			this._extensionErrorListener = bindings.onError;
		}

		if (this._extensionRunner) {
			this._applyExtensionBindings(this._extensionRunner);
			await this._extensionRunner.emit({ type: "session_start" });
			await this.extendResourcesFromExtensions("startup");
		}
	}

	private async extendResourcesFromExtensions(reason: "startup" | "reload"): Promise<void> {
		if (!this._extensionRunner?.hasHandlers("resources_discover")) {
			return;
		}

		const { skillPaths, promptPaths, themePaths } = await this._extensionRunner.emitResourcesDiscover(
			this.ctx.cwd,
			reason,
		);

		if (skillPaths.length === 0 && promptPaths.length === 0 && themePaths.length === 0) {
			return;
		}

		const extensionPaths: ResourceExtensionPaths = {
			skillPaths: this.buildExtensionResourcePaths(skillPaths),
			promptPaths: this.buildExtensionResourcePaths(promptPaths),
			themePaths: this.buildExtensionResourcePaths(themePaths),
		};

		this.resourceLoader.extendResources(extensionPaths);
		this._baseSystemPrompt = this.rebuildSystemPrompt(this.getActiveToolNames());
		this.ctx.agent.setSystemPrompt(this._baseSystemPrompt);
	}

	private buildExtensionResourcePaths(entries: Array<{ path: string; extensionPath: string }>): Array<{
		path: string;
		metadata: { source: string; scope: "temporary"; origin: "top-level"; baseDir?: string };
	}> {
		return entries.map((entry) => {
			const source = this.getExtensionSourceLabel(entry.extensionPath);
			const baseDir = entry.extensionPath.startsWith("<") ? undefined : dirname(entry.extensionPath);
			return {
				path: entry.path,
				metadata: {
					source,
					scope: "temporary",
					origin: "top-level",
					baseDir,
				},
			};
		});
	}

	private getExtensionSourceLabel(extensionPath: string): string {
		if (extensionPath.startsWith("<")) {
			return `extension:${extensionPath.replace(/[<>]/g, "")}`;
		}
		const base = basename(extensionPath);
		const name = base.replace(/\.(ts|js)$/, "");
		return `extension:${name}`;
	}

	async tryExecuteExtensionCommand(text: string): Promise<boolean> {
		if (!this._extensionRunner) return false;

		// Parse command name and args
		const spaceIndex = text.indexOf(" ");
		const commandName = spaceIndex === -1 ? text.slice(1) : text.slice(1, spaceIndex);
		const args = spaceIndex === -1 ? "" : text.slice(spaceIndex + 1);

		const command = this._extensionRunner.getCommand(commandName);
		if (!command) return false;

		// Get command context from extension runner (includes session control methods)
		const ctx = this._extensionRunner.createCommandContext();

		try {
			await command.handler(args, ctx);
			return true;
		} catch (err) {
			this._extensionRunner.emitError({
				extensionPath: `command:${commandName}`,
				event: "command",
				error: err instanceof Error ? err.message : String(err),
			});
			return true;
		}
	}

	throwIfExtensionCommand(text: string): void {
		if (!this._extensionRunner) return;

		const spaceIndex = text.indexOf(" ");
		const commandName = spaceIndex === -1 ? text.slice(1) : text.slice(1, spaceIndex);
		const command = this._extensionRunner.getCommand(commandName);

		if (command) {
			throw new Error(
				`Extension command "/${commandName}" cannot be queued. Use prompt() or execute the command when not streaming.`,
			);
		}
	}

	private _applyExtensionBindings(runner: ExtensionRunner): void {
		runner.setUIContext(this._extensionUIContext);
		runner.bindCommandContext(this._extensionCommandContextActions);

		this._extensionErrorUnsubscriber?.();
		this._extensionErrorUnsubscriber = this._extensionErrorListener
			? runner.onError(this._extensionErrorListener)
			: undefined;
	}

	private _bindExtensionCore(runner: ExtensionRunner): void {
		bindExtensionCore(runner, {
			ctx: this.ctx,
			host: this.host,
			resourceLoader: this.resourceLoader,
			getActiveTools: () => this.getActiveToolNames(),
			getAllTools: () => this.getAllTools(),
			setActiveTools: (toolNames) => this.setActiveToolsByName(toolNames),
			getShutdownHandler: () => this._extensionShutdownHandler,
		});
	}

	buildRuntime(options: {
		activeToolNames?: string[];
		flagValues?: Map<string, boolean | string>;
		includeAllExtensionTools?: boolean;
	}): void {
		const autoResizeImages = this.ctx.settingsManager.getImageAutoResize();
		const shellCommandPrefix = this.ctx.settingsManager.getShellCommandPrefix();
		const envOverlay = this._envOverlay;
		const spawnHook: BashSpawnHook | undefined = envOverlay
			? (ctx) => ({ ...ctx, env: { ...ctx.env, ...envOverlay } })
			: undefined;
		const baseTools: Record<string, AgentTool<any>> = this._baseToolsOverride
			? { ...this._baseToolsOverride }
			: createAllTools(this.ctx.cwd, {
					read: { autoResizeImages },
					bash: {
						commandPrefix: shellCommandPrefix,
						spawnHook,
						backgroundTasks: this._enableBackgroundTasks ? this._backgroundTasks : undefined,
					},
					shell: {
						commandPrefix: shellCommandPrefix,
						spawnHook,
						backgroundTasks: this._enableBackgroundTasks ? this._backgroundTasks : undefined,
					},
				});

		// Add invoke_skill tool if skills are available
		const loadedSkills = this.resourceLoader.getSkills().skills;
		const visibleSkills = loadedSkills.filter((s) => !s.disableModelInvocation && s.type !== "scene");
		if (visibleSkills.length > 0) {
			const invokeSkillTool = createInvokeSkillTool({
				getSkills: () => this.resourceLoader.getSkills().skills,
			});
			baseTools.invoke_skill = invokeSkillTool;
		}

		// Scenes are activated server-side via expandSkillCommand on /scene: prefix.
		// They prefill the todo list from tasks.json and inject scene content as a hidden
		// custom message — there is intentionally no LLM-facing invoke tool for scenes.

		// Add todo tool (always available)
		const todoTool = createTodoTool({ getTodoStore: () => this.todoStore });
		baseTools.todo = todoTool;

		// Background task companion tools (bash/shell spawn the tasks). Skipped when
		// the host disables background tasks (e.g. desktop batch-task sessions).
		if (this._enableBackgroundTasks) {
			baseTools.task_output = createTaskOutputTool({ getManager: () => this._backgroundTasks });
			baseTools.task_stop = createTaskStopTool({ getManager: () => this._backgroundTasks });
		}

		// Add ask_user_question only when the host exposes the capability (capability=registration).
		// Tracked so the prompt-entry lazy reload can detect a toggle and rebuild.
		const askEnabled = this._askUserQuestion?.isEnabled() ?? false;
		this._askUserQuestionEnabledLastBuilt = askEnabled;
		if (askEnabled && this._askUserQuestion) {
			const capability = this._askUserQuestion;
			baseTools.ask_user_question = createAskUserQuestionTool({
				ask: (request, signal) => capability.ask(request, signal),
			});
		}

		this._baseToolRegistry = new Map(Object.entries(baseTools).map(([name, tool]) => [name, tool as AgentTool]));

		const extensionsResult = this.resourceLoader.getExtensions();
		if (options.flagValues) {
			for (const [name, value] of options.flagValues) {
				extensionsResult.runtime.flagValues.set(name, value);
			}
		}

		const hasExtensions = extensionsResult.extensions.length > 0;
		const hasCustomTools = this._customTools.length > 0;
		this._extensionRunner =
			hasExtensions || hasCustomTools
				? new ExtensionRunner(
						extensionsResult.extensions,
						extensionsResult.runtime,
						this.ctx.cwd,
						this.ctx.sessionManager,
						this.ctx.modelRegistry,
					)
				: undefined;
		if (this._extensionRunnerRef) {
			this._extensionRunnerRef.current = this._extensionRunner;
		}
		if (this._extensionRunner) {
			this._bindExtensionCore(this._extensionRunner);
			this._applyExtensionBindings(this._extensionRunner);
		}

		const registeredTools = this._extensionRunner?.getAllRegisteredTools() ?? [];
		const allCustomTools = [
			...registeredTools,
			...this._customTools.map((def) => ({ definition: def, extensionPath: "<sdk>" })),
		];
		const wrappedExtensionTools = this._extensionRunner
			? wrapRegisteredTools(allCustomTools, this._extensionRunner)
			: [];

		const toolRegistry = new Map(this._baseToolRegistry);
		for (const tool of wrappedExtensionTools as AgentTool[]) {
			toolRegistry.set(tool.name, tool);
		}

		const defaultActiveToolNames = this._baseToolsOverride
			? Object.keys(this._baseToolsOverride)
			: getDefaultCodingToolNames();
		const baseActiveToolNames = options.activeToolNames ?? defaultActiveToolNames;
		const activeToolNameSet = new Set<string>(baseActiveToolNames);

		// Always activate invoke_skill and todo when available in base tools
		const alwaysActive = [
			"invoke_skill",
			"todo",
			"doc_to_pdf",
			"html_to_pdf",
			"extract_text_from_pdf",
			"extract_text_from_img",
			"render_pdf_page",
			"current_time",
			"ask_user_question",
			"easy_use_vettaApp",
			"task_output",
			"task_stop",
		];
		for (const name of alwaysActive) {
			if (this._baseToolRegistry.has(name)) {
				activeToolNameSet.add(name);
			}
		}
		if (options.includeAllExtensionTools) {
			for (const tool of wrappedExtensionTools as AgentTool[]) {
				activeToolNameSet.add(tool.name);
			}
		}

		const extensionToolNames = new Set(wrappedExtensionTools.map((tool) => tool.name));
		const activeBaseTools = Array.from(activeToolNameSet)
			.filter((name) => this._baseToolRegistry.has(name) && !extensionToolNames.has(name))
			.map((name) => this._baseToolRegistry.get(name) as AgentTool);
		const activeExtensionTools = wrappedExtensionTools.filter((tool) => activeToolNameSet.has(tool.name));

		// Get MCP tools if MCP is enabled
		const mcpTools = this._mcpManager?.getTools() ?? [];
		for (const mcpTool of mcpTools) {
			toolRegistry.set(mcpTool.name, mcpTool);
			activeToolNameSet.add(mcpTool.name);
		}

		const activeToolsArray: AgentTool[] = [...activeBaseTools, ...activeExtensionTools, ...mcpTools];

		if (this._extensionRunner) {
			const wrappedActiveTools = wrapToolsWithExtensions(activeToolsArray, this._extensionRunner);
			this.ctx.agent.setTools(wrappedActiveTools as AgentTool[]);

			const wrappedAllTools = wrapToolsWithExtensions(Array.from(toolRegistry.values()), this._extensionRunner);
			this._toolRegistry = new Map(wrappedAllTools.map((tool) => [tool.name, tool]));
		} else {
			this.ctx.agent.setTools(activeToolsArray);
			this._toolRegistry = toolRegistry;
		}

		const systemPromptToolNames = Array.from(activeToolNameSet).filter((name) => this._baseToolRegistry.has(name));
		this._baseSystemPrompt = this.rebuildSystemPrompt(systemPromptToolNames);
		this.ctx.agent.setSystemPrompt(this._baseSystemPrompt);
	}
}
