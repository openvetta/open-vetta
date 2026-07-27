import type { Message } from "@vetta/ai";
import type { AgentSessionEvent } from "@vetta/coding-agent";
import type { HistoryEntry, SessionEvent } from "../contracts.js";
import { entriesToHistory } from "./history.js";
import type { RuntimeSession } from "./session-backend.js";
import { mapAgentSessionEvent } from "./session-events.js";
import type {
	RuntimeSessionCorePorts,
	RuntimeSessionEventStream,
	RuntimeSessionHistoryReader,
	RuntimeSessionIdentityLifecycle,
	RuntimeSessionState,
	RuntimeSessionStateReader,
	RuntimeSessionTurnControl,
	RuntimeTurnPrompt,
} from "./session-ports.js";

export class LegacyRuntimeSessionIdentityLifecycle implements RuntimeSessionIdentityLifecycle {
	constructor(private readonly session: RuntimeSession) {}

	get sessionId(): string {
		return this.session.sessionId;
	}

	get sessionPath(): string | undefined {
		return this.session.sessionFile;
	}

	async dispose(): Promise<void> {
		await this.session.dispose();
	}
}

export class LegacyRuntimeSessionTurnControl implements RuntimeSessionTurnControl {
	constructor(private readonly session: RuntimeSession) {}

	async prompt(request: RuntimeTurnPrompt): Promise<void> {
		await this.session.prompt(request.text, {
			images: request.images,
			streamingBehavior: request.streamingBehavior,
			promptRef: request.promptRef,
			attachments: request.attachments,
			source: "extension",
			metadata: request.metadata,
		});
	}

	async continue(): Promise<void> {
		await this.session.agent.continue();
	}

	async abort(): Promise<void> {
		await this.session.abort();
	}
}

/** 一个旧 Session 只建立一个底层订阅，映射一次后向多个 Port 订阅者扇出。 */
export class LegacyRuntimeSessionEventStream implements RuntimeSessionEventStream {
	private readonly listeners = new Set<(event: SessionEvent) => void>();
	private readonly currentTurnStartedAt = new Map<string, number>();
	private sourceUnsubscribe: (() => void) | undefined;

	constructor(private readonly session: RuntimeSession) {}

	subscribe(handler: (event: SessionEvent) => void): () => void {
		this.listeners.add(handler);
		this.ensureSourceSubscription();
		let subscribed = true;
		return () => {
			if (!subscribed) return;
			subscribed = false;
			this.listeners.delete(handler);
			if (this.listeners.size === 0) {
				this.sourceUnsubscribe?.();
				this.sourceUnsubscribe = undefined;
			}
		};
	}

	private ensureSourceSubscription(): void {
		if (this.sourceUnsubscribe) return;
		this.sourceUnsubscribe = this.session.subscribe((event: AgentSessionEvent) => {
			for (const mapped of mapAgentSessionEvent(this.session.sessionId, event, this.session, {
				currentTurnStartedAt: this.currentTurnStartedAt,
			})) {
				for (const listener of this.listeners) listener(mapped);
			}
		});
	}
}

export class LegacyRuntimeSessionStateReader implements RuntimeSessionStateReader {
	constructor(private readonly session: RuntimeSession) {}

	readState(): RuntimeSessionState {
		const contextUsage = this.session.getContextUsage();
		const header = this.session.sessionManager.getHeader();
		return {
			model: this.session.model,
			thinkingLevel: this.session.thinkingLevel,
			isStreaming: this.session.isStreaming,
			messageCount: this.session.messages.length,
			contextPercent: contextUsage?.percent ?? null,
			contextWindow: contextUsage?.contextWindow ?? 0,
			activeToolNames: this.session.getActiveToolNames(),
			parentSessionPath: header?.parentSession,
			parentEntryId: header?.parentEntryId,
		};
	}

	readMessages(): readonly Message[] {
		return this.session.messages.filter((message): message is Message => {
			return message.role === "user" || message.role === "assistant" || message.role === "toolResult";
		});
	}
}

export class LegacyRuntimeSessionHistoryReader implements RuntimeSessionHistoryReader {
	constructor(private readonly session: RuntimeSession) {}

	readHistory(): readonly HistoryEntry[] {
		const sessionManager = this.session.sessionManager;
		return entriesToHistory(this.session.getSessionBranch(), { allEntries: sessionManager.getEntries() });
	}
}

export function createLegacyRuntimeSessionCorePorts(session: RuntimeSession): RuntimeSessionCorePorts {
	return {
		turnControl: new LegacyRuntimeSessionTurnControl(session),
		eventStream: new LegacyRuntimeSessionEventStream(session),
		stateReader: new LegacyRuntimeSessionStateReader(session),
	};
}
