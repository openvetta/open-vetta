import type { PrintExtensionError, PrintSessionCapabilities } from "@vetta/coding-agent/bootstrap";
import type { GreenfieldRpcRetryController } from "@vetta/coding-agent/rpc";
import {
	CodingAgentGreenfieldExtensionObservationAdapter,
	projectCodingAgentGreenfieldMessages,
} from "@vetta/coding-agent/runtime-host/greenfield";
import type { GreenfieldRuntimeSession, SessionEvent } from "@vetta/runtime-core";
import type { CodingAgentGreenfieldActiveSessionHost } from "./greenfield-runtime-composition.js";
import type { GreenfieldImExtensionSessionHost } from "./rpc/greenfield-im-extension-session-host.js";

interface GreenfieldPrintSessionAdapterOptions {
	readonly sessionHost: Pick<
		CodingAgentGreenfieldActiveSessionHost,
		"readSession" | "startActiveSessionOperation" | "subscribe"
	>;
	readonly retryController: GreenfieldRpcRetryController;
	readonly subscribeRetryEvents: (listener: (event: unknown) => void) => () => void;
	readonly extensionSessionHost: GreenfieldImExtensionSessionHost;
	readonly dispose: () => Promise<void>;
}

/** Greenfield Runtime 到既有单次 Print 合同的候选宿主适配器。 */
export class GreenfieldPrintSessionAdapter implements PrintSessionCapabilities {
	constructor(private readonly options: GreenfieldPrintSessionAdapterOptions) {}

	readHeader(): unknown {
		const identity = this.readDocument().identity;
		return {
			type: "session",
			version: 3,
			id: identity.sessionId,
			timestamp: new Date(identity.createdAt).toISOString(),
			cwd: identity.cwd ?? process.cwd(),
			...(identity.parentSessionPath ? { parentSession: identity.parentSessionPath } : {}),
			...(identity.parentEntryId ? { parentEntryId: identity.parentEntryId } : {}),
		};
	}

	async initializeExtensions(onError: (error: PrintExtensionError) => void): Promise<void> {
		await this.options.extensionSessionHost.initialize({ onError });
	}

	subscribe(listener: (event: unknown) => void): () => void {
		const observationAdapter = new CodingAgentGreenfieldExtensionObservationAdapter(async (event) => listener(event));
		const removeObservations = this.readSession()
			.createCoreAssembly()
			.executionObservationStream.subscribe((observation) => observationAdapter.observe(observation));
		const removeSessionEvents = this.options.sessionHost.subscribe((event) => {
			const mapped = mapSupplementalSessionEvent(event);
			if (mapped) listener(mapped);
		});
		const removeRetryEvents = this.options.subscribeRetryEvents((event) => {
			if (isAutoRetryEvent(event)) listener(event);
		});
		return () => {
			removeRetryEvents();
			removeSessionEvents();
			removeObservations();
		};
	}

	async prompt(message: string, options?: Parameters<PrintSessionCapabilities["prompt"]>[1]): Promise<void> {
		if (
			await this.options.sessionHost.startActiveSessionOperation(() =>
				this.options.extensionSessionHost.tryExecute(message),
			)
		) {
			return;
		}
		const command = () =>
			this.options.sessionHost.startActiveSessionOperation((session) =>
				session.prompt({ text: message, images: options?.images ? [...options.images] : undefined }),
			);
		const result = await this.options.retryController.run(
			command,
			() => this.options.sessionHost.startActiveSessionOperation((session) => session.continue()),
			readFailedTurnMessage,
		);
		const failedMessage = readFailedTurnMessage(result);
		if (failedMessage) throw new Error(failedMessage);
	}

	readMessages(): ReturnType<PrintSessionCapabilities["readMessages"]> {
		return projectCodingAgentGreenfieldMessages(this.readDocument());
	}

	dispose(): Promise<void> {
		return this.options.dispose();
	}

	private readSession(): GreenfieldRuntimeSession {
		return this.options.sessionHost.readSession();
	}

	private readDocument() {
		return this.readSession().createCoreAssembly().conversationView.readDocument();
	}
}

function isAutoRetryEvent(event: unknown): boolean {
	if (typeof event !== "object" || event === null) return false;
	const type = Reflect.get(event, "type");
	return type === "auto_retry_start" || type === "auto_retry_end";
}

function readFailedTurnMessage(value: unknown): string | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const error = Reflect.get(value, "error");
	return Reflect.get(value, "status") === "failed" &&
		typeof error === "object" &&
		error !== null &&
		typeof Reflect.get(error, "message") === "string"
		? Reflect.get(error, "message")
		: undefined;
}

function mapSupplementalSessionEvent(event: SessionEvent): unknown | undefined {
	switch (event.type) {
		case "session.path_changed":
			return event.path
				? { type: "session_path_changed", from: event.previousPath, to: event.path, reason: event.reason }
				: undefined;
		case "compaction.start":
			return { type: "auto_compaction_start", reason: event.reason };
		case "compaction.end":
			return {
				type: "auto_compaction_end",
				result: undefined,
				aborted: false,
				willRetry: false,
				...(event.errorMessage ? { errorMessage: event.errorMessage } : {}),
			};
		case "todo_update":
			return { type: "todo_update", items: event.items };
		case "background_tasks_update":
			return { type: "background_tasks_update", tasks: event.tasks };
		case "subagents_update":
			return { type: "subagents_update", agents: event.agents };
		case "mcp.reload.start":
			return { type: "mcp_reload_start" };
		case "mcp.reload.end":
			return {
				type: "mcp_reload_end",
				changed: event.changed,
				...(event.errorMessage ? { errorMessage: event.errorMessage } : {}),
			};
		default:
			return undefined;
	}
}
