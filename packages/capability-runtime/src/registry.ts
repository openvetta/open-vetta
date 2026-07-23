import {
	CAPABILITY_ERROR_CODES,
	CapabilityError,
	type CapabilityExecutionContext,
	type CapabilityId,
	type CapabilityLayer,
	type CapabilityToken,
	type Disposable,
} from "@vetta/capability-sdk";
import type { CapabilityProviderBinding } from "./provider.js";

interface ProviderEntry {
	readonly binding: CapabilityProviderBinding;
	readonly controller: AbortController;
	readonly generation: symbol;
	readonly ownerId: string;
}

function combineSignals(
	first: AbortSignal,
	second: AbortSignal,
): { readonly cleanup: () => void; readonly signal: AbortSignal } {
	const controller = new AbortController();
	const abort = (): void => controller.abort();
	for (const signal of [first, second]) {
		if (signal.aborted) controller.abort();
		else signal.addEventListener("abort", abort, { once: true });
	}
	return {
		signal: controller.signal,
		cleanup: () => {
			first.removeEventListener("abort", abort);
			second.removeEventListener("abort", abort);
		},
	};
}

export class CapabilityRegistry {
	private readonly providers = new Map<CapabilityId, ProviderEntry>();

	constructor(readonly layer: CapabilityLayer) {}

	has(capabilityId: CapabilityId): boolean {
		return this.providers.has(capabilityId);
	}

	list(prefix?: string): readonly CapabilityId[] {
		return [...this.providers.keys()]
			.filter((capabilityId) => prefix === undefined || capabilityId.startsWith(prefix))
			.sort();
	}

	registerOwner(ownerId: string, bindings: readonly CapabilityProviderBinding[]): Disposable {
		if (ownerId.trim().length === 0) throw new Error("Capability provider owner id is required");
		const nextIds = new Set<CapabilityId>();
		for (const binding of bindings) {
			if (binding.token.layer !== this.layer) {
				throw new CapabilityError(
					CAPABILITY_ERROR_CODES.LAYER_MISMATCH,
					`Capability ${binding.token.id} cannot register in the ${this.layer} registry`,
				);
			}
			if (nextIds.has(binding.token.id)) {
				throw new CapabilityError(
					CAPABILITY_ERROR_CODES.DUPLICATE_PROVIDER,
					`Capability module ${ownerId} registers ${binding.token.id} more than once`,
				);
			}
			nextIds.add(binding.token.id);
			const current = this.providers.get(binding.token.id);
			if (current && current.ownerId !== ownerId) {
				throw new CapabilityError(
					CAPABILITY_ERROR_CODES.DUPLICATE_PROVIDER,
					`Capability ${binding.token.id} is already provided by ${current.ownerId}`,
				);
			}
		}

		const previousControllers = new Set<AbortController>();
		for (const entry of this.providers.values()) {
			if (entry.ownerId === ownerId) previousControllers.add(entry.controller);
		}

		const controller = new AbortController();
		const generation = Symbol(ownerId);
		for (const [capabilityId, entry] of this.providers) {
			if (entry.ownerId === ownerId && !nextIds.has(capabilityId)) this.providers.delete(capabilityId);
		}
		for (const binding of bindings) {
			this.providers.set(binding.token.id, { binding, controller, generation, ownerId });
		}
		for (const previousController of previousControllers) previousController.abort();

		return {
			dispose: () => {
				for (const [capabilityId, entry] of this.providers) {
					if (entry.ownerId === ownerId && entry.generation === generation) this.providers.delete(capabilityId);
				}
				controller.abort();
			},
		};
	}

	async invoke<Input, Output>(
		capability: CapabilityToken<Input, Output>,
		input: Input,
		context: CapabilityExecutionContext,
	): Promise<Output> {
		const entry = this.providers.get(capability.id);
		if (!entry) {
			throw new CapabilityError(CAPABILITY_ERROR_CODES.NOT_FOUND, `Capability provider not found: ${capability.id}`);
		}
		if (entry.binding.token.version !== capability.version) {
			throw new CapabilityError(
				CAPABILITY_ERROR_CODES.VERSION_MISMATCH,
				`Capability ${capability.id} requires version ${capability.version}, provider exposes ${entry.binding.token.version}`,
			);
		}
		const combined = combineSignals(context.signal, entry.controller.signal);
		try {
			if (combined.signal.aborted) {
				throw new CapabilityError(
					CAPABILITY_ERROR_CODES.ABORTED,
					`Capability invocation aborted: ${capability.id}`,
				);
			}
			const output = await entry.binding.execute(input, { ...context, signal: combined.signal });
			if (combined.signal.aborted) {
				throw new CapabilityError(
					CAPABILITY_ERROR_CODES.ABORTED,
					`Capability invocation aborted: ${capability.id}`,
				);
			}
			return capability.parseOutput(output);
		} catch (error) {
			if (error instanceof CapabilityError) throw error;
			if (combined.signal.aborted) {
				throw new CapabilityError(
					CAPABILITY_ERROR_CODES.ABORTED,
					`Capability invocation aborted: ${capability.id}`,
					{
						cause: error,
					},
				);
			}
			throw new CapabilityError(
				CAPABILITY_ERROR_CODES.PROVIDER_FAILED,
				`Capability provider failed: ${capability.id}`,
				{ cause: error },
			);
		} finally {
			combined.cleanup();
		}
	}
}
