import { randomUUID } from "node:crypto";
import type { Message, TextContent } from "@mariozechner/pi-ai";
import {
	type AgentSession,
	type AgentSessionEvent,
	type CreateAgentSessionOptions,
	createAgentSession,
} from "@vetta/coding-agent";
import type {
	PromptRequest,
	SessionConfig,
	SessionEvent,
	SessionEventBase,
	SessionFacade,
	SessionStateSnapshot,
	SettingsPatch,
} from "./contracts.js";
import { runtimeError } from "./errors.js";

interface SessionHandle {
	session: AgentSession;
}

export class RuntimeHost implements SessionFacade {
	private sessions = new Map<string, SessionHandle>();

	async createSession(config: SessionConfig = {}): Promise<{ sessionId: string }> {
		const options: CreateAgentSessionOptions = {
			cwd: config.cwd,
			agentDir: config.agentDir,
			model: config.model,
			thinkingLevel: config.thinkingLevel,
		};

		const { session } = await createAgentSession(options);
		const sessionId = session.sessionId;
		this.sessions.set(sessionId, { session });
		return { sessionId };
	}

	async prompt(sessionId: string, request: PromptRequest): Promise<void> {
		const handle = this.requireSession(sessionId);
		await handle.session.prompt(request.text, {
			images: request.images,
			streamingBehavior: request.streamingBehavior,
			source: "extension",
		});
	}

	async continue(sessionId: string): Promise<void> {
		const handle = this.requireSession(sessionId);
		await handle.session.agent.continue();
	}

	async abort(sessionId: string): Promise<void> {
		const handle = this.requireSession(sessionId);
		await handle.session.abort();
	}

	subscribe(sessionId: string, handler: (event: SessionEvent) => void): () => void {
		const handle = this.requireSession(sessionId);
		handler(this.lifecycleEvent(sessionId, "created"));
		return handle.session.subscribe((event) => {
			for (const mapped of this.mapEvent(sessionId, event)) {
				handler(mapped);
			}
		});
	}

	async updateSettings(sessionId: string, partialSettings: SettingsPatch): Promise<void> {
		const handle = this.requireSession(sessionId);
		if (partialSettings.thinkingLevel) {
			handle.session.setThinkingLevel(partialSettings.thinkingLevel);
		}
		if (partialSettings.steeringMode) {
			handle.session.setSteeringMode(partialSettings.steeringMode);
		}
		if (partialSettings.followUpMode) {
			handle.session.setFollowUpMode(partialSettings.followUpMode);
		}
	}

	getState(sessionId: string): SessionStateSnapshot {
		const handle = this.requireSession(sessionId);
		return {
			sessionId,
			model: handle.session.model,
			thinkingLevel: handle.session.thinkingLevel,
			isStreaming: handle.session.isStreaming,
			messageCount: handle.session.messages.length,
		};
	}

	async disposeSession(sessionId: string): Promise<void> {
		const handle = this.sessions.get(sessionId);
		if (!handle) return;
		handle.session.dispose();
		this.sessions.delete(sessionId);
	}

	private requireSession(sessionId: string): SessionHandle {
		const handle = this.sessions.get(sessionId);
		if (!handle) {
			throw runtimeError("SESSION_NOT_FOUND", `Session not found: ${sessionId}`, false);
		}
		return handle;
	}

	private baseEvent(sessionId: string, source: SessionEventBase["source"]): SessionEventBase {
		return {
			schemaVersion: 1,
			sessionId,
			eventId: randomUUID(),
			timestamp: Date.now(),
			source,
		};
	}

	private lifecycleEvent(
		sessionId: string,
		phase: "created" | "agent_start" | "turn_start" | "turn_end" | "agent_end" | "aborted",
	): SessionEvent {
		return {
			...this.baseEvent(sessionId, "runtime-core"),
			type: "session.lifecycle",
			phase,
		};
	}

	private mapEvent(sessionId: string, event: AgentSessionEvent): SessionEvent[] {
		const events: SessionEvent[] = [];

		if (event.type === "agent_start") {
			events.push(this.lifecycleEvent(sessionId, "agent_start"));
			return events;
		}

		if (event.type === "turn_start") {
			events.push(this.lifecycleEvent(sessionId, "turn_start"));
			return events;
		}

		if (event.type === "turn_end") {
			events.push(this.lifecycleEvent(sessionId, "turn_end"));
			return events;
		}

		if (event.type === "agent_end") {
			events.push(this.lifecycleEvent(sessionId, "agent_end"));
			return events;
		}

		if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
			events.push({
				...this.baseEvent(sessionId, "agent"),
				type: "message.delta",
				delta: event.assistantMessageEvent.delta,
			});
			return events;
		}

		if (event.type === "message_end" && event.message.role === "assistant") {
			events.push({
				...this.baseEvent(sessionId, "agent"),
				type: "message.final",
				message: event.message as Message,
			});

			events.push({
				...this.baseEvent(sessionId, "agent"),
				type: "usage.update",
				input: event.message.usage.input,
				output: event.message.usage.output,
				cacheRead: event.message.usage.cacheRead,
				cacheWrite: event.message.usage.cacheWrite,
				costTotal: event.message.usage.cost.total,
			});

			if (event.message.stopReason === "error") {
				events.push({
					...this.baseEvent(sessionId, "agent"),
					type: "error",
					error: runtimeError(
						"INTERNAL_ERROR",
						this.extractAssistantText(event.message.content) || "Assistant response ended with error",
						true,
						"provider",
					),
				});
			}
			if (event.message.stopReason === "aborted") {
				events.push(this.lifecycleEvent(sessionId, "aborted"));
			}
			return events;
		}

		if (event.type === "tool_execution_start") {
			events.push({
				...this.baseEvent(sessionId, "tool"),
				type: "tool.start",
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				args: event.args,
			});
			return events;
		}

		if (event.type === "tool_execution_update") {
			events.push({
				...this.baseEvent(sessionId, "tool"),
				type: "tool.update",
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				partialResult: event.partialResult,
			});
			return events;
		}

		if (event.type === "tool_execution_end") {
			events.push({
				...this.baseEvent(sessionId, "tool"),
				type: "tool.end",
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				isError: event.isError,
				result: event.result,
			});
			return events;
		}

		if (event.type === "auto_retry_start") {
			events.push({
				...this.baseEvent(sessionId, "agent"),
				type: "error",
				error: runtimeError("INTERNAL_ERROR", event.errorMessage, true, "provider"),
			});
			return events;
		}

		return events;
	}

	private extractAssistantText(content: Message["content"]): string {
		if (typeof content === "string") return content;
		return content
			.filter((item): item is TextContent => item.type === "text")
			.map((item) => item.text)
			.join("");
	}
}
