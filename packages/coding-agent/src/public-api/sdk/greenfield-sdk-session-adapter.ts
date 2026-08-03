import { mapGreenfieldSdkExecutionEvent } from "./greenfield-sdk-session-events.js";
import type {
	GreenfieldSdkPromptOptions,
	GreenfieldSdkSessionCore,
	GreenfieldSdkSessionEventListener,
	GreenfieldSdkSessionRuntimePort,
} from "./sdk-session-contract.js";

/** Greenfield Runtime 到现有 SDK 核心会话语义的并行兼容门面。 */
export class GreenfieldSdkSessionAdapter implements GreenfieldSdkSessionCore {
	private readonly listeners = new Set<GreenfieldSdkSessionEventListener>();
	private readonly unsubscribeExecutionObservation: () => void;
	private closePromise: Promise<void> | undefined;
	private closed = false;

	constructor(private readonly runtime: GreenfieldSdkSessionRuntimePort) {
		this.unsubscribeExecutionObservation = runtime.subscribeExecutionObservation((observation) => {
			this.emit(mapGreenfieldSdkExecutionEvent(observation));
		});
	}

	get sessionId(): string {
		return this.runtime.sessionId;
	}

	get sessionFile(): string | undefined {
		return this.runtime.sessionPath;
	}

	get state(): GreenfieldSdkSessionCore["state"] {
		return this.runtime.readState();
	}

	get model(): GreenfieldSdkSessionCore["model"] {
		return this.state.model;
	}

	get thinkingLevel(): GreenfieldSdkSessionCore["thinkingLevel"] {
		return this.state.thinkingLevel;
	}

	get isStreaming(): boolean {
		return this.state.isStreaming;
	}

	get messages(): GreenfieldSdkSessionCore["messages"] {
		return this.runtime.readMessages();
	}

	async prompt(text: string, options: GreenfieldSdkPromptOptions = {}): Promise<void> {
		this.assertOpen();
		await this.runtime.prompt({
			text,
			attachments: options.attachments,
			images: options.images,
			metadata: options.metadata,
			promptRef: options.promptRef,
			streamingBehavior: options.streamingBehavior,
		});
	}

	async steer(text: string, images?: GreenfieldSdkPromptOptions["images"]): Promise<void> {
		await this.prompt(text, { images, streamingBehavior: "steer" });
	}

	async followUp(text: string, images?: GreenfieldSdkPromptOptions["images"]): Promise<void> {
		await this.prompt(text, { images, streamingBehavior: "followUp" });
	}

	abort(): Promise<void> {
		this.assertOpen();
		return this.runtime.abort();
	}

	setModel(model: NonNullable<GreenfieldSdkSessionCore["model"]>): Promise<void> {
		this.assertOpen();
		return this.runtime.selectModel(`${model.provider}/${model.id}`);
	}

	setThinkingLevel(level: GreenfieldSdkSessionCore["thinkingLevel"]): void {
		this.assertOpen();
		this.runtime.setThinkingLevel(level);
	}

	subscribe(listener: GreenfieldSdkSessionEventListener): () => void {
		this.assertOpen();
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	dispose(): void {
		void this.close();
	}

	close(): Promise<void> {
		if (this.closePromise) return this.closePromise;
		this.closed = true;
		this.unsubscribeExecutionObservation();
		this.listeners.clear();
		const operation = this.runtime.dispose();
		const tracked = operation.catch((error: unknown) => {
			if (this.closePromise === tracked) this.closePromise = undefined;
			throw error;
		});
		this.closePromise = tracked;
		return tracked;
	}

	private emit(event: Parameters<GreenfieldSdkSessionEventListener>[0]): void {
		for (const listener of this.listeners) {
			try {
				listener(event);
			} catch (error: unknown) {
				console.warn("[GreenfieldSdkSessionAdapter] Event listener failed", error);
			}
		}
	}

	private assertOpen(): void {
		if (this.closed) throw new Error("AgentSession is closed");
	}
}
