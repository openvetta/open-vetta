import type { RuntimeToolDefinition, RuntimeToolExecutionRequest } from "@vetta/runtime-core/kernel";
import type { CodingToolRegistration } from "./tool-registration.js";

export interface CodingToolCatalogSnapshot {
	readonly version: number;
	readonly registrations: readonly CodingToolRegistration[];
}

export interface CodingToolCatalog {
	snapshot(): CodingToolCatalogSnapshot;
}

export interface CodingToolRegistry extends CodingToolCatalog {
	register(registration: CodingToolRegistration): void;
	unregister(toolName: string): boolean;
}

export class InMemoryCodingToolRegistry implements CodingToolRegistry {
	private readonly registrationsByName = new Map<string, CodingToolRegistration>();
	private version = 0;
	private cachedSnapshot: CodingToolCatalogSnapshot | undefined;

	constructor(initialRegistrations: readonly CodingToolRegistration[] = []) {
		for (const registration of initialRegistrations) {
			this.addInitialRegistration(registration);
		}
	}

	register(registration: CodingToolRegistration): void {
		this.assertAvailable(registration.tool.name);
		this.registrationsByName.set(registration.tool.name, freezeRegistration(registration));
		this.version += 1;
		this.cachedSnapshot = undefined;
	}

	unregister(toolName: string): boolean {
		if (!this.registrationsByName.delete(toolName)) {
			return false;
		}
		this.version += 1;
		this.cachedSnapshot = undefined;
		return true;
	}

	snapshot(): CodingToolCatalogSnapshot {
		if (this.cachedSnapshot) {
			return this.cachedSnapshot;
		}
		const registrations = [...this.registrationsByName.values()].sort(compareRegistrationName);
		this.cachedSnapshot = Object.freeze({
			version: this.version,
			registrations: Object.freeze(registrations),
		});
		return this.cachedSnapshot;
	}

	private addInitialRegistration(registration: CodingToolRegistration): void {
		this.assertAvailable(registration.tool.name);
		this.registrationsByName.set(registration.tool.name, freezeRegistration(registration));
	}

	private assertAvailable(toolName: string): void {
		if (this.registrationsByName.has(toolName)) {
			throw new Error(`Duplicate coding tool registration: ${toolName}`);
		}
	}
}

function freezeRegistration(registration: CodingToolRegistration): CodingToolRegistration {
	return Object.freeze({
		tool: freezeToolDefinition(registration.tool),
		scopeUse: Object.freeze([...registration.scopeUse]),
		category: registration.category,
	});
}

function freezeToolDefinition(tool: RuntimeToolDefinition): RuntimeToolDefinition {
	return Object.freeze({
		name: tool.name,
		label: tool.label,
		description: tool.description,
		inputSchema: tool.inputSchema,
		execute: (request: RuntimeToolExecutionRequest) => tool.execute(request),
	});
}

function compareRegistrationName(left: CodingToolRegistration, right: CodingToolRegistration): number {
	if (left.tool.name < right.tool.name) return -1;
	if (left.tool.name > right.tool.name) return 1;
	return 0;
}
