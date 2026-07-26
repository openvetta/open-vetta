import type { RuntimeToolDefinition } from "@vetta/runtime-core/kernel";
import { describe, expect, it } from "vitest";
import {
	type CodingToolRegistration,
	type CodingToolScope,
	InMemoryCodingToolRegistry,
	selectCodingTools,
} from "../../src/coding/index.js";

describe("coding tool registry", () => {
	it("creates a deterministic frozen membership snapshot", () => {
		const registry = new InMemoryCodingToolRegistry([
			registration("zeta", ["project"]),
			registration("alpha", ["cli"]),
		]);

		const snapshot = registry.snapshot();

		expect(snapshot.version).toBe(0);
		expect(snapshot.registrations.map(({ tool }) => tool.name)).toEqual(["alpha", "zeta"]);
		expect(registry.snapshot()).toBe(snapshot);
		expect(Object.isFrozen(snapshot)).toBe(true);
		expect(Object.isFrozen(snapshot.registrations)).toBe(true);
		expect(Object.isFrozen(snapshot.registrations[0])).toBe(true);
		expect(Object.isFrozen(snapshot.registrations[0]?.tool)).toBe(true);
		expect(Object.isFrozen(snapshot.registrations[0]?.scopeUse)).toBe(true);
	});

	it("registers and unregisters without mutating older snapshots", () => {
		const registry = new InMemoryCodingToolRegistry([registration("alpha", ["project"])]);
		const first = registry.snapshot();

		registry.register(registration("beta", ["project"]));
		const second = registry.snapshot();
		expect(second.version).toBe(1);
		expect(second.registrations.map(({ tool }) => tool.name)).toEqual(["alpha", "beta"]);
		expect(first.registrations.map(({ tool }) => tool.name)).toEqual(["alpha"]);

		expect(registry.unregister("alpha")).toBe(true);
		const third = registry.snapshot();
		expect(third.version).toBe(2);
		expect(third.registrations.map(({ tool }) => tool.name)).toEqual(["beta"]);
		expect(second.registrations.map(({ tool }) => tool.name)).toEqual(["alpha", "beta"]);

		expect(registry.unregister("missing")).toBe(false);
		expect(registry.snapshot()).toBe(third);
	});

	it("rejects duplicate tool names in initial and dynamic registrations", () => {
		expect(
			() =>
				new InMemoryCodingToolRegistry([
					registration("duplicate", ["project"]),
					registration("duplicate", ["cli"]),
				]),
		).toThrow("Duplicate coding tool registration: duplicate");

		const registry = new InMemoryCodingToolRegistry([registration("duplicate", ["project"])]);
		expect(() => registry.register(registration("duplicate", ["cli"]))).toThrow(
			"Duplicate coding tool registration: duplicate",
		);
		expect(registry.snapshot().version).toBe(0);
	});

	it("copies registration scope metadata at the registry boundary", () => {
		const mutableScopes: CodingToolScope[] = ["project"];
		const registry = new InMemoryCodingToolRegistry([registration("alpha", mutableScopes)]);

		mutableScopes.push("cli");

		expect(registry.snapshot().registrations[0]?.scopeUse).toEqual(["project"]);
	});

	it("preserves class-backed tool execution when freezing the catalog definition", async () => {
		const registry = new InMemoryCodingToolRegistry([
			{
				tool: new ClassBackedTool("class-tool"),
				scopeUse: ["project"],
				category: "core",
			},
		]);
		const tool = registry.snapshot().registrations[0]?.tool;
		if (!tool) throw new Error("Missing registered tool");

		const result = await tool.execute({
			sessionId: "session-1",
			turnId: "turn-1",
			toolCallId: "tool-call-1",
			input: {},
			signal: new AbortController().signal,
		});

		expect(result.content).toEqual([{ type: "text", text: "class-tool" }]);
	});
});

describe("coding tool activation", () => {
	const registrations = [
		registration("default-project", ["project"]),
		registration("default-cli", ["cli"]),
		registration("deferred", []),
	];

	it("selects scope defaults and additionally enabled tools", () => {
		expect(
			selectCodingTools(registrations, {
				mode: "scope",
				scope: "project",
				additionallyEnabledToolNames: ["deferred", "missing"],
			}).map(({ name }) => name),
		).toEqual(["default-project", "deferred"]);
	});

	it("supports an explicit replacement set and ignores unknown names", () => {
		expect(
			selectCodingTools(registrations, {
				mode: "explicit",
				toolNames: ["deferred", "missing"],
			}).map(({ name }) => name),
		).toEqual(["deferred"]);
	});

	it("uses cli as the default scope without activating empty-scope tools", () => {
		expect(
			selectCodingTools(registrations, {
				mode: "scope",
			}).map(({ name }) => name),
		).toEqual(["default-cli"]);
	});
});

function registration(name: string, scopeUse: readonly CodingToolScope[]): CodingToolRegistration {
	const tool: RuntimeToolDefinition = {
		name,
		label: name,
		description: name,
		inputSchema: { type: "object" },
		async execute() {
			return {
				content: [{ type: "text", text: name }],
			};
		},
	};
	return {
		tool,
		scopeUse,
		category: "core",
	};
}

class ClassBackedTool implements RuntimeToolDefinition {
	readonly name = "class-backed";
	readonly label = "class-backed";
	readonly description = "class-backed";
	readonly inputSchema = { type: "object" };

	constructor(private readonly output: string) {}

	async execute() {
		return {
			content: [{ type: "text" as const, text: this.output }],
		};
	}
}
