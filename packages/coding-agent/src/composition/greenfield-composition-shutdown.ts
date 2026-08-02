import { RetryableCleanup } from "@vetta/runtime-core";
import type {
	GreenfieldAsynchronousDisposableResource,
	GreenfieldCompositionResourceCleanupRegistry,
	GreenfieldCompositionResourceCleanupSnapshot,
	GreenfieldSynchronousDisposableResource,
} from "./greenfield-composition-resource-registry.js";

export interface GreenfieldCompositionShutdownOptions {
	readonly registry: GreenfieldCompositionResourceCleanupRegistry;
	readonly clearConversationContextOverlay: () => void;
	readonly closeConversationRepository: () => Promise<void> | void;
	readonly disposeMcpSynchronizer?: () => Promise<void> | void;
	readonly disposeCodingTools: () => Promise<void> | void;
}

export interface GreenfieldCompositionShutdown {
	dispose(): Promise<void>;
}

/** Composition 级关闭事务；第一次关闭冻结资源集合，失败项由后续调用继续重试。 */
export function createGreenfieldCompositionShutdown(
	options: GreenfieldCompositionShutdownOptions,
): GreenfieldCompositionShutdown {
	const cleanup = new RetryableCleanup();
	let prepared = false;

	return {
		async dispose() {
			if (!prepared) {
				prepared = true;
				prepareCleanup(cleanup, options, options.registry.readCleanupSnapshot());
			}
			try {
				await cleanup.run("Failed to dispose one or more Greenfield runtime resources");
			} catch (error) {
				throw new AggregateError(
					error instanceof AggregateError ? error.errors : [error],
					"Failed to dispose one or more Greenfield runtime resources",
				);
			}
		},
	};
}

function prepareCleanup(
	cleanup: RetryableCleanup,
	options: GreenfieldCompositionShutdownOptions,
	resources: GreenfieldCompositionResourceCleanupSnapshot,
): void {
	addSynchronousResources(cleanup, "context-runtime", resources.contextRuntimes, (runtime) =>
		options.registry.untrackContextRuntime(runtime),
	);
	addSynchronousResources(cleanup, "memory-runtime", resources.memoryRuntimes, (runtime) =>
		options.registry.untrackMemoryRuntime(runtime),
	);
	addAsynchronousResources(cleanup, "execution-runtime", resources.executionRuntimes, (runtime) =>
		options.registry.unbindExecutionRuntime(runtime),
	);
	for (const [index, disposeHookSession] of resources.hookSessionDisposers.entries()) {
		cleanup.add({
			id: `hook-session:${index}`,
			phase: 0,
			cleanup: async () => {
				await disposeHookSession();
				options.registry.untrackHookSessionDisposer(disposeHookSession);
			},
		});
	}
	addAsynchronousResources(cleanup, "todo-runtime", resources.todoRuntimes, (runtime) =>
		options.registry.untrackTodoRuntime(runtime),
	);
	addAsynchronousResources(cleanup, "capability-composition", resources.turnCapabilityAssemblies, (assembly) =>
		options.registry.untrackTurnCapabilityAssembly(assembly),
	);
	addAsynchronousResources(cleanup, "ownership-binding", resources.ownershipBindings, (binding) =>
		options.registry.untrackOwnershipBinding(binding),
	);
	addAsynchronousResources(cleanup, "plugin-mcp-runtime", resources.pluginMcpRuntimes, (runtime) =>
		options.registry.unbindPluginMcpRuntime(runtime),
	);
	cleanup.add({
		id: "session-registries",
		phase: 1,
		cleanup: () => {
			options.registry.clearAuxiliarySessionIndexes();
			options.clearConversationContextOverlay();
		},
	});
	cleanup.add({ id: "conversation-repository", phase: 2, cleanup: options.closeConversationRepository });
	if (options.disposeMcpSynchronizer) {
		cleanup.add({ id: "mcp-synchronizer", phase: 3, cleanup: options.disposeMcpSynchronizer });
	}
	cleanup.add({ id: "coding-tools", phase: 3, cleanup: options.disposeCodingTools });
}

function addSynchronousResources(
	cleanup: RetryableCleanup,
	idPrefix: string,
	resources: readonly GreenfieldSynchronousDisposableResource[],
	untrack: (resource: GreenfieldSynchronousDisposableResource) => void,
): void {
	for (const [index, resource] of resources.entries()) {
		cleanup.add({
			id: `${idPrefix}:${index}`,
			phase: 0,
			cleanup: () => {
				resource.dispose();
				untrack(resource);
			},
		});
	}
}

function addAsynchronousResources(
	cleanup: RetryableCleanup,
	idPrefix: string,
	resources: readonly GreenfieldAsynchronousDisposableResource[],
	untrack: (resource: GreenfieldAsynchronousDisposableResource) => void,
): void {
	for (const [index, resource] of resources.entries()) {
		cleanup.add({
			id: `${idPrefix}:${index}`,
			phase: 0,
			cleanup: async () => {
				await resource.dispose();
				untrack(resource);
			},
		});
	}
}
