/**
 * Input pipeline — prompt / steer / follow-up / custom + user messages.
 *
 * Extracted from AgentSession. This is the turn-entry orchestration: it runs the
 * per-prompt lazy reloads, expands skills/templates, normalizes images, validates
 * model/API key, builds the message array (with skill/scene/extension injections),
 * and drives the agent. It also owns the ad-hoc todo-nudge signature and provides
 * the agent's followUpProvider (todo continuation).
 */

import { join } from "node:path";
import type { AgentMessage } from "@vetta/agent-core";
import type { AssistantMessage, ImageContent, TextContent } from "@vetta/ai";
import { getDocsPath } from "../../config.js";
import type { PromptOptions } from "../agent-session.js";
import type { CustomMessage } from "../messages.js";
import { expandPromptTemplate } from "../prompt-templates.js";
import type { ResourceLoader } from "../resource-loader.js";
import type { TodoStore } from "../todo-store.js";
import type { BashController } from "./bash-controller.js";
import type { CompactionController } from "./compaction-controller.js";
import { normalizeUserImages } from "./normalize-images.js";
import type { QueueController } from "./queue-controller.js";
import type { RetryController } from "./retry-controller.js";
import type { RuntimeManager } from "./runtime-manager.js";
import type { SessionContext } from "./session-context.js";
import { expandSkillCommand } from "./skill-expansion.js";
import { buildTodoContinuationMessages } from "./todo-continuation.js";

export interface InputPipelineDeps {
	runtime: RuntimeManager;
	queue: QueueController;
	bash: BashController;
	retry: RetryController;
	compaction: CompactionController;
	todoStore: TodoStore;
	resourceLoader: ResourceLoader;
}

export class InputPipeline {
	/**
	 * Signature of the pending-todo set we last nudged for, for ad-hoc (unlocked) lists.
	 * Reset on every new user prompt so each turn gets one fresh nudge.
	 */
	private _lastTodoNudgeSignature: string | undefined = undefined;

	private readonly runtime: RuntimeManager;
	private readonly queue: QueueController;
	private readonly bash: BashController;
	private readonly retry: RetryController;
	private readonly compaction: CompactionController;
	private readonly todoStore: TodoStore;
	private readonly resourceLoader: ResourceLoader;

	constructor(
		private readonly ctx: SessionContext,
		deps: InputPipelineDeps,
	) {
		this.runtime = deps.runtime;
		this.queue = deps.queue;
		this.bash = deps.bash;
		this.retry = deps.retry;
		this.compaction = deps.compaction;
		this.todoStore = deps.todoStore;
		this.resourceLoader = deps.resourceLoader;
	}

	/**
	 * Build follow-up messages for uncompleted todo items.
	 * Called by the agent core's followUpProvider INSIDE the loop, before the
	 * agent decides whether to exit.
	 */
	buildTodoContinuationMessages(): AgentMessage[] {
		const result = buildTodoContinuationMessages(this.todoStore, this._lastTodoNudgeSignature);
		this._lastTodoNudgeSignature = result.nextNudgeSignature;
		return result.messages;
	}

	async prompt(text: string, options?: PromptOptions): Promise<void> {
		const expandPromptTemplates = options?.expandPromptTemplates ?? true;

		// Detect newly added/modified skills on disk and rebuild the system prompt
		// so this turn sees them. Cheap stat-only fingerprint check.
		this.runtime.refreshSkillsForPrompt();

		// Lazy MCP reload: if mcp.json changed since last time, diff-reload changed servers.
		await this.runtime.maybeReloadMcpForPrompt();

		// Lazy image-budget reread: desktop "context strategy" edits take effect this turn.
		this.ctx.settingsManager.reloadImageSettings();

		// Lazy personalization rebuild: persona / custom-instruction edits take effect this turn.
		this.runtime.maybeReloadPersonalizationForPrompt();

		// Lazy ask_user_question rebuild: capability toggle takes effect this turn.
		this.runtime.maybeReloadAskUserQuestionForPrompt();

		// Handle extension commands first (execute immediately, even during streaming)
		// Extension commands manage their own LLM interaction via pi.sendMessage()
		if (expandPromptTemplates && text.startsWith("/")) {
			const handled = await this.runtime.tryExecuteExtensionCommand(text);
			if (handled) {
				// Extension command executed, no prompt to send
				return;
			}
		}

		// Emit input event for extension interception (before skill/template expansion)
		let currentText = text;
		let currentImages = options?.images;
		const runner = this.runtime.extensionRunner;
		if (runner?.hasHandlers("input")) {
			const inputResult = await runner.emitInput(currentText, currentImages, options?.source ?? "interactive");
			if (inputResult.action === "handled") {
				return;
			}
			if (inputResult.action === "transform") {
				currentText = inputResult.text;
				currentImages = inputResult.images ?? currentImages;
			}
		}

		// Normalize user-attached images (paste / drag / desktop attach) through the
		// same resize pipeline as the read tool. Without this, large pasted images
		// reach the model at original resolution and can blow past local VL models'
		// GPU memory budget (CUDA OOM → 500 no body).
		const normalizedImages = await this.normalizeUserImages(currentImages);
		currentImages = normalizedImages.images;
		if (normalizedImages.notes.length > 0) {
			currentText = [currentText, ...normalizedImages.notes].filter(Boolean).join("\n\n");
		}

		// Expand skill commands (/skill:name args) and prompt templates (/template args)
		let expandedText = currentText;
		let sceneInjection: string | undefined;
		let skillInjection: string | undefined;
		if (expandPromptTemplates) {
			const expanded = this.expandSkillCommand(expandedText);
			expandedText = expanded.text;
			sceneInjection = expanded.sceneInjection;
			skillInjection = expanded.skillInjection;
			expandedText = expandPromptTemplate(expandedText, [...this.resourceLoader.getPrompts().prompts]);
		}

		// If streaming, queue via steer() or followUp() based on option
		if (this.ctx.agent.state.isStreaming) {
			if (!options?.streamingBehavior) {
				throw new Error(
					"Agent is already processing. Specify streamingBehavior ('steer' or 'followUp') to queue the message.",
				);
			}
			// For streaming, combine injections with user text since we can't inject custom messages
			const injection = [skillInjection, sceneInjection].filter(Boolean).join("\n\n");
			const textForStream = injection ? `${injection}\n\n${expandedText}` : expandedText;
			if (options.streamingBehavior === "followUp") {
				this.queue.queueFollowUp(textForStream, currentImages);
			} else {
				this.queue.queueSteer(textForStream, currentImages);
			}
			return;
		}

		// Flush any pending bash messages before the new prompt
		this.bash.flushPending();

		// Validate model
		const model = this.ctx.model;
		if (!model) {
			throw new Error(
				"No model selected.\n\n" +
					`Use /login or set an API key environment variable. See ${join(getDocsPath(), "providers.md")}\n\n` +
					"Then use /model to select a model.",
			);
		}

		// Validate API key
		const apiKey = await this.ctx.modelRegistry.getApiKey(model);
		if (!apiKey) {
			const isOAuth = this.ctx.modelRegistry.isUsingOAuth(model);
			if (isOAuth) {
				throw new Error(
					`Authentication failed for "${model.provider}". ` +
						`Credentials may have expired or network is unavailable. ` +
						`Run '/login ${model.provider}' to re-authenticate.`,
				);
			}
			throw new Error(
				`No API key found for ${model.provider}.\n\n` +
					`Use /login or set an API key environment variable. See ${join(getDocsPath(), "providers.md")}`,
			);
		}

		// Check if we need to compact before sending (catches aborted responses)
		const lastAssistant = this.findLastAssistantMessage();
		if (lastAssistant) {
			await this.compaction.checkCompaction(lastAssistant, false);
		}

		// Build messages array (custom message if any, then user message)
		const messages: AgentMessage[] = [];

		// Image mode: a plugin input action set metadata.imageMode for this turn.
		// Inject a hidden instruction so the agent optimizes the prompt and calls
		// generate_image (the host injects that tool via customTools).
		if (options?.metadata?.imageMode === true) {
			messages.push({
				role: "custom",
				customType: "image_mode_instruction",
				content:
					"图像生成模式已开启。请把用户的请求理解并优化成一个具体、生动的绘图 prompt，然后调用 generate_image 工具生成图像。不要只用文字描述图像。",
				display: false,
				timestamp: Date.now(),
			});
		}

		// Inject skill/scene content as hidden custom messages (before user message so model sees it first).
		// Skill goes first so the model parses its `<skill>` block before any scene context.
		if (skillInjection) {
			messages.push({
				role: "custom",
				customType: "skill_expansion",
				content: skillInjection,
				display: false,
				timestamp: Date.now(),
			});
		}
		if (sceneInjection) {
			messages.push({
				role: "custom",
				customType: "scene_expansion",
				content: sceneInjection,
				display: false,
				timestamp: Date.now(),
			});
		}

		// Add user message
		const userContent: (TextContent | ImageContent)[] = [{ type: "text", text: expandedText }];
		if (currentImages) {
			userContent.push(...currentImages);
		}
		messages.push({
			role: "user",
			content: userContent,
			timestamp: Date.now(),
		});

		// Inject any pending "nextTurn" messages as context alongside the user message
		messages.push(...this.queue.takeNextTurn());

		// Emit before_agent_start extension event
		const beforeStartRunner = this.runtime.extensionRunner;
		if (beforeStartRunner) {
			const result = await beforeStartRunner.emitBeforeAgentStart(
				expandedText,
				currentImages,
				this.runtime.baseSystemPrompt,
			);
			// Add all custom messages from extensions
			if (result?.messages) {
				for (const msg of result.messages) {
					messages.push({
						role: "custom",
						customType: msg.customType,
						content: msg.content,
						display: msg.display,
						details: msg.details,
						timestamp: Date.now(),
					});
				}
			}
			// Apply extension-modified system prompt, or reset to base
			if (result?.systemPrompt) {
				this.ctx.agent.setSystemPrompt(result.systemPrompt);
			} else {
				// Ensure we're using the base prompt (in case previous turn had modifications)
				this.ctx.agent.setSystemPrompt(this.runtime.baseSystemPrompt);
			}
		}

		// New user turn: reset the ad-hoc todo nudge so this turn gets one fresh nudge.
		this._lastTodoNudgeSignature = undefined;

		await this.ctx.agent.prompt(messages);
		await this.retry.waitForRetry();
	}

	/**
	 * Queue a steering message to interrupt the agent mid-run.
	 * Expands skill commands and prompt templates. Errors on extension commands.
	 */
	async steer(text: string, images?: ImageContent[]): Promise<void> {
		// Check for extension commands (cannot be queued)
		if (text.startsWith("/")) {
			this.runtime.throwIfExtensionCommand(text);
		}

		// Expand skill commands and prompt templates
		const expanded = this.expandSkillCommand(text);
		const injection = [expanded.skillInjection, expanded.sceneInjection].filter(Boolean).join("\n\n");
		let expandedText = injection ? `${injection}\n\n${expanded.text}` : expanded.text;
		expandedText = expandPromptTemplate(expandedText, [...this.resourceLoader.getPrompts().prompts]);

		const normalizedImages = await this.normalizeUserImages(images);
		if (normalizedImages.notes.length > 0) {
			expandedText = [expandedText, ...normalizedImages.notes].filter(Boolean).join("\n\n");
		}

		this.queue.queueSteer(expandedText, normalizedImages.images);
	}

	/**
	 * Queue a follow-up message to be processed after the agent finishes.
	 * Expands skill commands and prompt templates. Errors on extension commands.
	 */
	async followUp(text: string, images?: ImageContent[]): Promise<void> {
		// Check for extension commands (cannot be queued)
		if (text.startsWith("/")) {
			this.runtime.throwIfExtensionCommand(text);
		}

		// Expand skill commands and prompt templates
		const expanded = this.expandSkillCommand(text);
		const injection = [expanded.skillInjection, expanded.sceneInjection].filter(Boolean).join("\n\n");
		let expandedText = injection ? `${injection}\n\n${expanded.text}` : expanded.text;
		expandedText = expandPromptTemplate(expandedText, [...this.resourceLoader.getPrompts().prompts]);

		const normalizedImages = await this.normalizeUserImages(images);
		if (normalizedImages.notes.length > 0) {
			expandedText = [expandedText, ...normalizedImages.notes].filter(Boolean).join("\n\n");
		}

		this.queue.queueFollowUp(expandedText, normalizedImages.images);
	}

	/**
	 * Send a custom message to the session. Creates a CustomMessageEntry.
	 *
	 * Handles three cases:
	 * - Streaming: queues message, processed when loop pulls from queue
	 * - Not streaming + triggerTurn: appends to state/session, starts new turn
	 * - Not streaming + no trigger: appends to state/session, no turn
	 */
	async sendCustomMessage<T = unknown>(
		message: Pick<CustomMessage<T>, "customType" | "content" | "display" | "details">,
		options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" },
	): Promise<void> {
		const appMessage = {
			role: "custom" as const,
			customType: message.customType,
			content: message.content,
			display: message.display,
			details: message.details,
			timestamp: Date.now(),
		} satisfies CustomMessage<T>;
		if (options?.deliverAs === "nextTurn") {
			this.queue.pushNextTurn(appMessage);
		} else if (this.ctx.agent.state.isStreaming) {
			if (options?.deliverAs === "followUp") {
				this.ctx.agent.followUp(appMessage);
			} else {
				this.ctx.agent.steer(appMessage);
			}
		} else if (options?.triggerTurn) {
			await this.ctx.agent.prompt(appMessage);
		} else {
			this.ctx.agent.appendMessage(appMessage);
			this.ctx.sessionManager.appendCustomMessageEntry(
				message.customType,
				message.content,
				message.display,
				message.details,
			);
			this.ctx.emit({ type: "message_start", message: appMessage });
			this.ctx.emit({ type: "message_end", message: appMessage });
		}
	}

	/**
	 * Send a user message to the agent. Always triggers a turn.
	 * When the agent is streaming, use deliverAs to specify how to queue the message.
	 */
	async sendUserMessage(
		content: string | (TextContent | ImageContent)[],
		options?: { deliverAs?: "steer" | "followUp" },
	): Promise<void> {
		// Normalize content to text string + optional images
		let text: string;
		let images: ImageContent[] | undefined;

		if (typeof content === "string") {
			text = content;
		} else {
			const textParts: string[] = [];
			images = [];
			for (const part of content) {
				if (part.type === "text") {
					textParts.push(part.text);
				} else {
					images.push(part);
				}
			}
			text = textParts.join("\n");
			if (images.length === 0) images = undefined;
		}

		// Use prompt() with expandPromptTemplates: false to skip command handling and template expansion
		await this.prompt(text, {
			expandPromptTemplates: false,
			streamingBehavior: options?.deliverAs,
			images,
			source: "extension",
		});
	}

	private expandSkillCommand(text: string): { text: string; sceneInjection?: string; skillInjection?: string } {
		const runner = this.runtime.extensionRunner;
		return expandSkillCommand(text, {
			resourceLoader: this.resourceLoader,
			todoStore: this.todoStore,
			emitError: runner ? (error) => runner.emitError(error) : undefined,
		});
	}

	private async normalizeUserImages(
		images?: ImageContent[],
	): Promise<{ images: ImageContent[] | undefined; notes: string[] }> {
		return normalizeUserImages(images, this.ctx.settingsManager.getImageAutoResize());
	}

	private findLastAssistantMessage(): AssistantMessage | undefined {
		const messages = this.ctx.agent.state.messages;
		for (let i = messages.length - 1; i >= 0; i--) {
			const msg = messages[i];
			if (msg.role === "assistant") {
				return msg as AssistantMessage;
			}
		}
		return undefined;
	}
}
