import type { AgentSession } from "../core/agent-session.js";
import type { PrintExtensionError, PrintSessionCapabilities } from "./print-session-capabilities.js";

/** Preserve the current AgentSession behavior behind the neutral Print host contract. */
export class LegacyPrintSessionAdapter implements PrintSessionCapabilities {
	constructor(private readonly session: AgentSession) {}

	readHeader(): unknown | undefined {
		return this.session.sessionManager.getHeader();
	}

	async initializeExtensions(onError: (error: PrintExtensionError) => void): Promise<void> {
		await this.session.bindExtensions({
			commandContextActions: {
				waitForIdle: () => this.session.agent.waitForIdle(),
				newSession: async (options) => {
					const success = await this.session.newSession({ parentSession: options?.parentSession });
					if (success && options?.setup) await options.setup(this.session.sessionManager);
					return { cancelled: !success };
				},
				fork: async (entryId) => {
					const result = await this.session.fork(entryId);
					return { cancelled: result.cancelled };
				},
				navigateTree: async (targetId, options) => {
					const result = await this.session.navigateTree(targetId, {
						summarize: options?.summarize,
						customInstructions: options?.customInstructions,
						replaceInstructions: options?.replaceInstructions,
						label: options?.label,
					});
					return { cancelled: result.cancelled };
				},
				switchSession: async (sessionPath) => {
					const success = await this.session.switchSession(sessionPath);
					return { cancelled: !success };
				},
				reload: () => this.session.reload(),
			},
			onError,
		});
	}

	subscribe(listener: (event: unknown) => void): () => void {
		return this.session.subscribe(listener);
	}

	prompt(message: string, options?: Parameters<AgentSession["prompt"]>[1]): Promise<void> {
		return this.session.prompt(message, options);
	}

	readMessages() {
		return this.session.state.messages;
	}
}
