import type { ImageContent } from "@vetta/ai";
import type { GreenfieldRuntimeSession } from "@vetta/runtime-core";
import type { CodingAgentGreenfieldTurnRetryController } from "./greenfield-turn-retry-controller.js";

export interface CodingAgentGreenfieldTurnSessionHost {
	startActiveSessionOperation<T>(operation: (session: GreenfieldRuntimeSession) => Promise<T>): Promise<T>;
}

export interface CodingAgentGreenfieldTurnCommandHost {
	throwIfExtensionCommand(text: string): void;
	tryExecute(text: string): Promise<boolean>;
}

export interface CodingAgentGreenfieldTurnExecutorOptions {
	readonly sessionHost: CodingAgentGreenfieldTurnSessionHost;
	readonly retryController: CodingAgentGreenfieldTurnRetryController;
	readonly commandHost?: CodingAgentGreenfieldTurnCommandHost;
}

export interface CodingAgentGreenfieldTurnPromptOptions {
	readonly images?: readonly ImageContent[];
	readonly streamingBehavior?: "steer" | "followUp";
}

/** Prompt、Extension command、continue 与 retry 的中立 Turn 编排入口。 */
export class CodingAgentGreenfieldTurnExecutor {
	constructor(private readonly options: CodingAgentGreenfieldTurnExecutorOptions) {}

	async prompt(message: string, promptOptions: CodingAgentGreenfieldTurnPromptOptions = {}): Promise<void> {
		if (!promptOptions.streamingBehavior) {
			const executed = await this.options.sessionHost.startActiveSessionOperation(
				async () => this.options.commandHost?.tryExecute(message) ?? false,
			);
			if (executed) return;
		} else {
			this.options.commandHost?.throwIfExtensionCommand(message);
		}

		const executeInitial = () =>
			this.options.sessionHost.startActiveSessionOperation((session) =>
				session.prompt({
					text: message,
					images: promptOptions.images ? [...promptOptions.images] : undefined,
					streamingBehavior: promptOptions.streamingBehavior,
				}),
			);
		const result = await this.options.retryController.run(
			executeInitial,
			() => this.options.sessionHost.startActiveSessionOperation((session) => session.continue()),
			readFailedTurnMessage,
		);
		const failedMessage = readFailedTurnMessage(result);
		if (failedMessage) throw new Error(failedMessage);
	}
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
