import { describe, expect, it } from "vitest";
import {
	type AgentFeatureDefinition,
	type AgentProfile,
	FeatureCompiler,
	type FeatureContribution,
	type IdGenerator,
	KERNEL_ERROR_CODES,
	PassthroughContextStrategy,
} from "../../src/kernel/index.js";

class SnapshotIdGenerator implements IdGenerator {
	next(scope: "snapshot" | "turn"): string {
		return `${scope}-1`;
	}
}

function profile(features: readonly AgentFeatureDefinition[]): AgentProfile {
	return {
		id: "coding",
		instructions: [
			{
				id: "base",
				content: "Base instruction",
				priority: 0,
			},
		],
		features,
		contextStrategy: new PassthroughContextStrategy(),
		toolPolicy: {
			async authorize() {
				return true;
			},
		},
		tokenBudget: 8_000,
		reservedOutputTokens: 1_000,
	};
}

function feature(options: {
	readonly id: string;
	readonly dependencies?: readonly string[];
	readonly conflicts?: readonly string[];
	readonly contribution?: FeatureContribution;
	readonly lifecycle: string[];
	readonly failPrepare?: boolean;
	readonly failContribute?: boolean;
	readonly failDispose?: boolean;
}): AgentFeatureDefinition {
	return {
		id: options.id,
		dependencies: options.dependencies,
		conflicts: options.conflicts,
		async prepare() {
			options.lifecycle.push(`prepare:${options.id}`);
			if (options.failPrepare) throw new Error(`prepare failed: ${options.id}`);
			return {
				async contribute() {
					options.lifecycle.push(`contribute:${options.id}`);
					if (options.failContribute) throw new Error(`contribute failed: ${options.id}`);
					return options.contribution ?? {};
				},
				async dispose() {
					options.lifecycle.push(`dispose:${options.id}`);
					if (options.failDispose) throw new Error(`dispose failed: ${options.id}`);
				},
			};
		},
	};
}

describe("FeatureCompiler", () => {
	it("orders features deterministically while respecting dependencies", async () => {
		const lifecycle: string[] = [];
		const compiler = new FeatureCompiler({
			idGenerator: new SnapshotIdGenerator(),
		});
		const compiled = await compiler.compile(
			profile([
				feature({
					id: "z-dependent",
					dependencies: ["base-feature"],
					lifecycle,
					contribution: {
						instructions: [{ id: "dependent", content: "Dependent", priority: 2 }],
					},
				}),
				feature({
					id: "base-feature",
					lifecycle,
					contribution: {
						instructions: [{ id: "feature-base", content: "Feature base", priority: 1 }],
					},
				}),
				feature({
					id: "alpha-independent",
					lifecycle,
				}),
			]),
			new AbortController().signal,
		);

		expect(lifecycle.slice(0, 3)).toEqual([
			"prepare:alpha-independent",
			"prepare:base-feature",
			"prepare:z-dependent",
		]);
		expect(compiled.snapshot.instructions.map(({ id }) => id)).toEqual(["base", "feature-base", "dependent"]);
		expect(compiled.snapshot.id).toBe("snapshot-1");

		await compiled.dispose();
		expect(lifecycle.slice(-3)).toEqual(["dispose:z-dependent", "dispose:base-feature", "dispose:alpha-independent"]);
	});

	it("rejects dependency cycles before preparing resources", async () => {
		const lifecycle: string[] = [];
		const compiler = new FeatureCompiler({
			idGenerator: new SnapshotIdGenerator(),
		});

		await expect(
			compiler.compile(
				profile([
					feature({ id: "first", dependencies: ["second"], lifecycle }),
					feature({ id: "second", dependencies: ["first"], lifecycle }),
				]),
				new AbortController().signal,
			),
		).rejects.toMatchObject({
			code: KERNEL_ERROR_CODES.FEATURE_CONFIGURATION,
		});
		expect(lifecycle).toEqual([]);
	});

	it("rejects contribution collisions and rolls prepared features back in reverse order", async () => {
		const lifecycle: string[] = [];
		const compiler = new FeatureCompiler({
			idGenerator: new SnapshotIdGenerator(),
		});
		const duplicateTool = {
			name: "read",
			description: "Read a file",
			inputSchema: {},
		};

		await expect(
			compiler.compile(
				profile([
					feature({
						id: "first",
						lifecycle,
						contribution: { tools: [duplicateTool] },
					}),
					feature({
						id: "second",
						lifecycle,
						contribution: { tools: [duplicateTool] },
					}),
				]),
				new AbortController().signal,
			),
		).rejects.toMatchObject({
			code: KERNEL_ERROR_CODES.FEATURE_CONFLICT,
		});
		expect(lifecycle.slice(-2)).toEqual(["dispose:second", "dispose:first"]);
	});

	it("rolls back resources when a later feature fails to prepare", async () => {
		const lifecycle: string[] = [];
		const compiler = new FeatureCompiler({
			idGenerator: new SnapshotIdGenerator(),
		});

		await expect(
			compiler.compile(
				profile([feature({ id: "first", lifecycle }), feature({ id: "second", lifecycle, failPrepare: true })]),
				new AbortController().signal,
			),
		).rejects.toThrow("prepare failed: second");
		expect(lifecycle).toEqual(["prepare:first", "prepare:second", "dispose:first"]);
	});

	it("publishes frozen collections and a map without mutation methods", async () => {
		const lifecycle: string[] = [];
		const compiler = new FeatureCompiler({
			idGenerator: new SnapshotIdGenerator(),
		});
		const compiled = await compiler.compile(
			profile([
				feature({
					id: "tools",
					lifecycle,
					contribution: {
						tools: [
							{
								name: "read",
								description: "Read a file",
								inputSchema: { type: "object" },
							},
						],
					},
				}),
			]),
			new AbortController().signal,
		);

		expect(Object.isFrozen(compiled.snapshot)).toBe(true);
		expect(Object.isFrozen(compiled.snapshot.instructions)).toBe(true);
		expect(Object.isFrozen(compiled.snapshot.contextProviders)).toBe(true);
		expect(Object.isFrozen(compiled.snapshot.observers)).toBe(true);
		expect(compiled.snapshot.tools.get("read")?.description).toBe("Read a file");
		expect("set" in compiled.snapshot.tools).toBe(false);

		await compiled.dispose();
		await compiled.dispose();
		expect(lifecycle.filter((entry) => entry === "dispose:tools")).toHaveLength(1);
	});

	it("reports all disposal failures after attempting every feature", async () => {
		const lifecycle: string[] = [];
		const compiler = new FeatureCompiler({
			idGenerator: new SnapshotIdGenerator(),
		});
		const compiled = await compiler.compile(
			profile([
				feature({ id: "first", lifecycle, failDispose: true }),
				feature({ id: "second", lifecycle, failDispose: true }),
			]),
			new AbortController().signal,
		);

		await expect(compiled.dispose()).rejects.toBeInstanceOf(AggregateError);
		expect(lifecycle.slice(-2)).toEqual(["dispose:second", "dispose:first"]);
	});
});
