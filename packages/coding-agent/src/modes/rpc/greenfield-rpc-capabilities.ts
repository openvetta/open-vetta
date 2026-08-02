import type { AgentMessage, ThinkingLevel } from "@vetta/agent-core";
import { type Api, type AssistantMessage, type Model, supportsXhigh } from "@vetta/ai";
import type { ConversationDocument, RuntimeSessionContextDeliveryController } from "@vetta/runtime-core";
import { projectCodingAgentGreenfieldMessages } from "../../adapters/runtime-core/greenfield-agent-message-context-projector.js";
import { CODING_AGENT_LEGACY_AGENT_MESSAGE_CONTEXT_TYPE } from "../../adapters/runtime-core/legacy-session-import-normalizer.js";
import { type BashResult, executeBash } from "../../core/bash-executor.js";
import { exportConversationDocumentToHtml } from "../../core/export-html/index.js";
import { type BashExecutionMessage, bashExecutionToText } from "../../core/messages.js";
import type { SessionStats } from "../../core/session/session-stats.js";
import type { RpcBashCapability, RpcRetryCapability } from "./rpc-session-capabilities.js";

export interface GreenfieldRpcRetrySettings {
	readonly enabled: boolean;
	readonly maxRetries: number;
	readonly baseDelayMs: number;
}

export type GreenfieldRpcRetryEvent =
	| {
			readonly type: "auto_retry_start";
			readonly attempt: number;
			readonly maxAttempts: number;
			readonly delayMs: number;
			readonly errorMessage: string;
	  }
	| {
			readonly type: "auto_retry_end";
			readonly success: boolean;
			readonly attempt: number;
			readonly finalError?: string;
	  };

export interface GreenfieldRpcRetryControllerOptions {
	readonly readSettings: () => GreenfieldRpcRetrySettings;
	readonly setEnabled: (enabled: boolean) => void;
	readonly emit: (event: GreenfieldRpcRetryEvent) => void;
}

/** Session-local retry orchestration for Greenfield turns; it owns no Legacy session state. */
export class GreenfieldRpcRetryController implements RpcRetryCapability {
	private abortController: AbortController | undefined;
	private attempt = 0;

	constructor(private readonly options: GreenfieldRpcRetryControllerOptions) {}

	setAutoRetryEnabled(enabled: boolean): void {
		this.options.setEnabled(enabled);
	}

	abortRetry(): void {
		this.abortController?.abort();
	}

	async run<T>(
		executeInitial: () => Promise<T>,
		executeRetry: () => Promise<T>,
		readFailure: (result: T) => string | undefined,
	): Promise<T> {
		let result = await executeInitial();
		let failure = readFailure(result);
		while (failure && isRetryableError(failure)) {
			const settings = this.options.readSettings();
			if (!settings.enabled || this.attempt >= settings.maxRetries) break;
			this.attempt += 1;
			const delayMs = settings.baseDelayMs * 2 ** (this.attempt - 1);
			this.options.emit({
				type: "auto_retry_start",
				attempt: this.attempt,
				maxAttempts: settings.maxRetries,
				delayMs,
				errorMessage: failure,
			});
			this.abortController = new AbortController();
			try {
				await waitForDelay(delayMs, this.abortController.signal);
			} catch {
				this.options.emit({
					type: "auto_retry_end",
					success: false,
					attempt: this.attempt,
					finalError: "Retry cancelled",
				});
				this.attempt = 0;
				return result;
			} finally {
				this.abortController = undefined;
			}
			try {
				result = await executeRetry();
			} catch (error) {
				this.options.emit({
					type: "auto_retry_end",
					success: false,
					attempt: this.attempt,
					finalError: error instanceof Error ? error.message : String(error),
				});
				this.attempt = 0;
				throw error;
			}
			failure = readFailure(result);
		}
		if (this.attempt > 0) {
			this.options.emit({
				type: "auto_retry_end",
				success: failure === undefined,
				attempt: this.attempt,
				...(failure ? { finalError: failure } : {}),
			});
			this.attempt = 0;
		}
		return result;
	}
}

export interface GreenfieldRpcBashCapabilityOptions {
	readonly readContextDeliveryController: () => RuntimeSessionContextDeliveryController;
	readonly readShellCommandPrefix: () => string | undefined;
}

/** Direct user Bash command execution with V2 context persistence and cancellation. */
export class GreenfieldRpcBashCapability implements RpcBashCapability {
	private activeController: AbortController | undefined;

	constructor(private readonly options: GreenfieldRpcBashCapabilityOptions) {}

	async execute(command: string, signal?: AbortSignal): Promise<BashResult> {
		signal?.throwIfAborted();
		const controller = new AbortController();
		this.activeController = controller;
		const abort = () => controller.abort();
		signal?.addEventListener("abort", abort, { once: true });
		const prefix = this.options.readShellCommandPrefix();
		const resolvedCommand = prefix ? `${prefix}\n${command}` : command;
		try {
			const result = await executeBash(resolvedCommand, { signal: controller.signal });
			const message: BashExecutionMessage = {
				role: "bashExecution",
				command,
				output: result.output,
				exitCode: result.exitCode,
				cancelled: result.cancelled,
				truncated: result.truncated,
				fullOutputPath: result.fullOutputPath,
				timestamp: Date.now(),
			};
			await this.options.readContextDeliveryController().deliver(
				[
					{
						type: CODING_AGENT_LEGACY_AGENT_MESSAGE_CONTEXT_TYPE,
						content: [{ type: "text", text: bashExecutionToText(message) }],
						modelVisible: true,
						display: true,
						metadata: { agentMessage: message },
					},
				],
				"record",
			);
			return result;
		} finally {
			signal?.removeEventListener("abort", abort);
			if (this.activeController === controller) this.activeController = undefined;
		}
	}

	abort(): void {
		this.activeController?.abort();
	}
}

export function computeGreenfieldRpcSessionStats(
	messages: readonly AgentMessage[],
	sessionFile: string | undefined,
	sessionId: string,
): SessionStats {
	let toolCalls = 0;
	let input = 0;
	let output = 0;
	let cacheRead = 0;
	let cacheWrite = 0;
	let cost = 0;
	for (const message of messages) {
		if (message.role !== "assistant") continue;
		const assistant = message as AssistantMessage;
		toolCalls += assistant.content.filter((content) => content.type === "toolCall").length;
		input += assistant.usage.input;
		output += assistant.usage.output;
		cacheRead += assistant.usage.cacheRead;
		cacheWrite += assistant.usage.cacheWrite;
		cost += assistant.usage.cost.total;
	}
	return {
		sessionFile,
		sessionId,
		userMessages: messages.filter((message) => message.role === "user").length,
		assistantMessages: messages.filter((message) => message.role === "assistant").length,
		toolCalls,
		toolResults: messages.filter((message) => message.role === "toolResult").length,
		totalMessages: messages.length,
		tokens: { input, output, cacheRead, cacheWrite, total: input + output + cacheRead + cacheWrite },
		cost,
	};
}

export function readGreenfieldRpcAgentMessages(document: ConversationDocument): readonly AgentMessage[] {
	return projectCodingAgentGreenfieldMessages(document);
}

export function resolveNextGreenfieldRpcThinkingLevel(
	model: Model<Api> | undefined,
	current: ThinkingLevel,
): ThinkingLevel | undefined {
	if (!model?.reasoning) return undefined;
	const levels: readonly ThinkingLevel[] = supportsXhigh(model)
		? ["off", "minimal", "low", "medium", "high", "xhigh"]
		: ["off", "minimal", "low", "medium", "high"];
	return levels[(levels.indexOf(current) + 1) % levels.length];
}

export function exportGreenfieldRpcConversation(
	document: ConversationDocument,
	sessionFile: string,
	outputPath?: string,
): Promise<string> {
	return exportConversationDocumentToHtml(document, sessionFile, outputPath);
}

function isRetryableError(message: string): boolean {
	if (
		/额度已用尽|额度不足|窗口额度|余额不足|Token Plan|insufficient.?quota|insufficient.?balance|quota.?exhausted|quota.?exceeded|out of quota|exceeded your current quota/i.test(
			message,
		)
	) {
		return false;
	}
	return /overloaded|rate.?limit|too many requests|429|500|502|503|504|service.?unavailable|server error|internal error|connection.?error|connection.?refused|other side closed|fetch failed|upstream.?connect|reset before headers|terminated|retry delay/i.test(
		message,
	);
}

function waitForDelay(delayMs: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal.aborted) {
			reject(signal.reason);
			return;
		}
		const timeout = setTimeout(resolve, delayMs);
		signal.addEventListener(
			"abort",
			() => {
				clearTimeout(timeout);
				reject(signal.reason);
			},
			{ once: true },
		);
	});
}
