import type { GreenfieldRuntimeSession } from "@vetta/runtime-core";
import type {
	CodingAgentGreenfieldExtensionEventHost,
	CodingAgentGreenfieldExtensionInitialization,
} from "../adapters/runtime-core/greenfield.js";
import type {
	CodingAgentGreenfieldPreparedSessionBinding,
	CodingAgentGreenfieldSessionTransition,
	CodingAgentGreenfieldSessionTransitionLifecycle,
} from "../composition/greenfield-active-session-transition-host.js";
import type { GreenfieldRuntimeComposition } from "../composition/greenfield-runtime-composition-contract.js";
import type {
	GreenfieldSdkOwnedResource,
	GreenfieldSdkSessionInitializationContext,
} from "../composition/greenfield-sdk-session-factory.js";

type ExtensionEventHostFactory = (
	session: GreenfieldRuntimeSession,
	composition: GreenfieldRuntimeComposition,
) => CodingAgentGreenfieldExtensionEventHost;

/** 把 Session 级 Extension Event Host 纳入 SDK 活动会话的 prepare/commit/rollback 事务。 */
export class CodingAgentSdkExtensionTransitionAdapter {
	readonly lifecycle: CodingAgentGreenfieldSessionTransitionLifecycle;
	private current: CodingAgentGreenfieldExtensionEventHost | undefined;
	private readonly hosts = new Map<string, CodingAgentGreenfieldExtensionEventHost>();

	constructor(
		private readonly createHost: ExtensionEventHostFactory,
		private readonly initialization: CodingAgentGreenfieldExtensionInitialization = {},
	) {
		this.lifecycle = {
			before: (transition) => this.before(transition),
			prepare: (transition) => this.prepare(transition),
			after: (transition) => this.after(transition),
		};
	}

	initializeSession = async (
		context: GreenfieldSdkSessionInitializationContext,
	): Promise<GreenfieldSdkOwnedResource> => {
		const host = this.createHost(context.session, context.composition);
		this.hosts.set(context.session.sessionId, host);
		try {
			await host.initialize(this.initialization, { emitSessionStart: context.source === "initial" });
			if (context.source === "initial") {
				this.current = host;
				await host.discoverResources("startup");
			}
		} catch (error) {
			this.hosts.delete(context.session.sessionId);
			await host.dispose({ emitSessionShutdown: false });
			throw error;
		}
		return {
			id: `sdk-extension-event-host:${context.session.sessionId}`,
			dispose: async () => {
				this.hosts.delete(context.session.sessionId);
				await host.dispose({ emitSessionShutdown: this.current === host });
			},
		};
	};

	readRunner() {
		if (!this.current) throw new Error("Greenfield SDK Extension session is not initialized");
		return this.current.runner;
	}

	readRunnerOrUndefined() {
		return this.current?.runner;
	}

	private async before(transition: CodingAgentGreenfieldSessionTransition) {
		const runner = this.readRunner();
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

	private async prepare(
		transition: CodingAgentGreenfieldSessionTransition & { readonly next: GreenfieldRuntimeSession },
	): Promise<CodingAgentGreenfieldPreparedSessionBinding> {
		const previous = this.current;
		const next = this.hosts.get(transition.next.sessionId);
		if (!previous || !next) throw new Error("Greenfield SDK Extension transition binding is unavailable");
		return {
			commit: async () => {
				this.current = next;
			},
			rollback: async () => {
				this.current = previous;
				previous.rebindRuntimeActions();
			},
			finalize: async () => {},
		};
	}

	private async after(
		transition: CodingAgentGreenfieldSessionTransition & { readonly next: GreenfieldRuntimeSession },
	): Promise<void> {
		if (transition.kind === "fork") {
			await this.readRunner().emit({
				type: "session_fork",
				previousSessionFile: transition.previousSessionPath,
			});
			return;
		}
		await this.readRunner().emit({
			type: "session_switch",
			reason: transition.kind,
			previousSessionFile: transition.previousSessionPath,
		});
	}
}
