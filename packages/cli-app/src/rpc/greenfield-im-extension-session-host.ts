import {
	CodingAgentGreenfieldExtensionCommandHost,
	type CodingAgentGreenfieldExtensionEventHost,
	type CodingAgentGreenfieldExtensionInitialization,
	type ExtensionCommandContextActions,
} from "@vetta/coding-agent/runtime-host/greenfield";
import { type GreenfieldRuntimeSession, InitializationRollbackScope, RetryableCleanup } from "@vetta/runtime-core";
import type {
	CodingAgentGreenfieldPreparedSessionBinding,
	CodingAgentGreenfieldSessionTransition,
} from "../greenfield-runtime-composition.js";

type GreenfieldImExtensionEventHostFactory = (
	session: GreenfieldRuntimeSession,
	options?: { readonly replaceExisting?: boolean },
) => CodingAgentGreenfieldExtensionEventHost;

interface GreenfieldImExtensionSessionBinding {
	readonly events: CodingAgentGreenfieldExtensionEventHost;
	readonly commands?: CodingAgentGreenfieldExtensionCommandHost;
}

/**
 * Extension 的 Session 级动态绑定控制器。
 *
 * 对外保持稳定的命令与生命周期入口；切换 Session 时一次性替换事件 Runner 和命令
 * Host，RPC Adapter 不持有某个具体 Session 的实现。
 */
export class GreenfieldImExtensionSessionHost {
	private initialization: CodingAgentGreenfieldExtensionInitialization | undefined;
	private commandActions: ExtensionCommandContextActions | undefined;
	private current: GreenfieldImExtensionSessionBinding;
	private readonly cleanup = new RetryableCleanup();
	private cleanupPrepared = false;

	constructor(
		initial: CodingAgentGreenfieldExtensionEventHost,
		private readonly createHost: GreenfieldImExtensionEventHostFactory,
	) {
		this.current = { events: initial };
	}

	bindCommandContext(actions: ExtensionCommandContextActions): void {
		this.commandActions = actions;
		this.current = {
			...this.current,
			commands: new CodingAgentGreenfieldExtensionCommandHost({ runner: this.current.events.runner, actions }),
		};
	}

	readRunner() {
		return this.current.events.runner;
	}

	readCommands(): ReturnType<CodingAgentGreenfieldExtensionCommandHost["readCommands"]> {
		return this.current.commands?.readCommands() ?? [];
	}

	tryExecute(text: string): Promise<boolean> {
		return this.requireCommands().tryExecute(text);
	}

	throwIfExtensionCommand(text: string): void {
		this.requireCommands().throwIfExtensionCommand(text);
	}

	async initialize(input: CodingAgentGreenfieldExtensionInitialization): Promise<void> {
		this.initialization = input;
		await this.current.events.initialize(input);
		await this.current.events.discoverResources("startup");
	}

	async before(
		transition: CodingAgentGreenfieldSessionTransition,
	): Promise<{ readonly cancelled: boolean; readonly skipConversationRestore?: boolean } | undefined> {
		const runner = this.current.events.runner;
		if (transition.kind === "fork") {
			if (!transition.entryId || !runner.hasHandlers("session_before_fork")) return undefined;
			const result = await runner.emit({ type: "session_before_fork", entryId: transition.entryId });
			return {
				cancelled: result?.cancel === true,
				...(result?.skipConversationRestore === true ? { skipConversationRestore: true } : {}),
			};
		}
		if (!runner.hasHandlers("session_before_switch")) return undefined;
		const result = await runner.emit({
			type: "session_before_switch",
			reason: transition.kind,
			...(transition.targetSessionPath ? { targetSessionFile: transition.targetSessionPath } : {}),
		});
		return { cancelled: result?.cancel === true };
	}

	async prepare(
		transition: CodingAgentGreenfieldSessionTransition & { readonly next: GreenfieldRuntimeSession },
	): Promise<CodingAgentGreenfieldPreparedSessionBinding> {
		const previous = this.current;
		const events = this.createHost(transition.next);
		const next: GreenfieldImExtensionSessionBinding = {
			events,
			commands: this.commandActions
				? new CodingAgentGreenfieldExtensionCommandHost({ runner: events.runner, actions: this.commandActions })
				: undefined,
		};
		const rollback = new InitializationRollbackScope();
		rollback.defer({
			id: "next-extension-host",
			rollback: () => events.dispose({ emitSessionShutdown: false }),
		});
		rollback.defer({ id: "previous-runtime-actions", rollback: () => previous.events.rebindRuntimeActions() });
		try {
			if (this.initialization) {
				await events.initialize(this.initialization, { emitSessionStart: false });
			}
			const prepared: CodingAgentGreenfieldPreparedSessionBinding = {
				commit: async () => {
					this.current = next;
				},
				rollback: async () => {
					this.current = previous;
					previous.events.rebindRuntimeActions();
					await events.dispose({ emitSessionShutdown: false });
				},
				finalize: () => previous.events.dispose({ emitSessionShutdown: false }),
			};
			rollback.commit();
			return prepared;
		} catch (error) {
			return rollback.rollback(error, "Greenfield Extension session preparation and rollback failed");
		}
	}

	async after(
		transition: CodingAgentGreenfieldSessionTransition & { readonly next: GreenfieldRuntimeSession },
	): Promise<void> {
		if (transition.kind === "fork") {
			await this.current.events.runner.emit({
				type: "session_fork",
				previousSessionFile: transition.previousSessionPath,
			});
			return;
		}
		await this.current.events.runner.emit({
			type: "session_switch",
			reason: transition.kind,
			previousSessionFile: transition.previousSessionPath,
		});
	}

	async reload(session: GreenfieldRuntimeSession, operation: () => Promise<void>): Promise<void> {
		const previous = this.current;
		const rollback = new InitializationRollbackScope();
		let next: GreenfieldImExtensionSessionBinding | undefined;
		let replacementAttempted = false;
		try {
			if (this.initialization) {
				await previous.events.runner.emit({ type: "session_shutdown" });
				rollback.defer({
					id: "previous-session-start",
					rollback: () => previous.events.runner.emit({ type: "session_start" }),
				});
			}
			rollback.defer({
				id: "previous-runtime-binding",
				rollback: () => {
					if (replacementAttempted) previous.events.rebindRuntimeBindings();
					else previous.events.rebindRuntimeActions();
				},
			});
			await operation();
			replacementAttempted = true;
			const events = this.createHost(session, { replaceExisting: true });
			next = {
				events,
				commands: this.commandActions
					? new CodingAgentGreenfieldExtensionCommandHost({ runner: events.runner, actions: this.commandActions })
					: undefined,
			};
			rollback.defer({
				id: "next-extension-host",
				rollback: () => events.dispose({ emitSessionShutdown: false }),
			});
			if (this.initialization) {
				await events.initialize(this.initialization, { emitSessionStart: false });
			}
			if (this.initialization) await next.events.runner.emit({ type: "session_start" });
			await next.events.discoverResources("reload");
			this.current = next;
			rollback.commit();
		} catch (error) {
			return rollback.rollback(error, "Greenfield Extension reload and rollback failed");
		}
		await previous.events.dispose({ emitSessionShutdown: false });
	}

	shutdown(): Promise<void> {
		return this.current.events.shutdown();
	}

	async dispose(): Promise<void> {
		if (!this.cleanupPrepared) {
			this.cleanupPrepared = true;
			const current = this.current;
			this.cleanup.add({ id: "current-event-host", cleanup: () => current.events.dispose() });
		}
		await this.cleanup.run("Failed to dispose Greenfield Extension session host");
	}

	private requireCommands(): CodingAgentGreenfieldExtensionCommandHost {
		if (!this.current.commands) throw new Error("Greenfield Extension command context is not bound");
		return this.current.commands;
	}
}
