import { describe, expect, it } from "vitest";
import {
	type AgentProfile,
	FeatureCompiler,
	type IdGenerator,
	PassthroughContextStrategy,
	resolveModelCallFrame,
} from "../../src/kernel/index.js";

class SnapshotIdGenerator implements IdGenerator {
	next(scope: "snapshot" | "turn"): string {
		return `${scope}-1`;
	}
}

describe("model call frame", () => {
	it("refreshes dynamic contributions without recompiling feature instances", async () => {
		let prompt = "dynamic-v1";
		let prepareCount = 0;
		let featureContributionCount = 0;
		let callContributionCount = 0;
		const profile: AgentProfile = {
			id: "coding",
			instructions: [{ id: "base", content: "base", priority: 0 }],
			features: [
				{
					id: "dynamic-instructions",
					async prepare() {
						prepareCount += 1;
						return {
							async contribute() {
								featureContributionCount += 1;
								return {
									modelCallProviders: [
										{
											id: "dynamic-instructions",
											async contribute(context) {
												context.signal.throwIfAborted();
												callContributionCount += 1;
												return {
													instructions: [{ id: "dynamic", content: prompt, priority: 1 }],
												};
											},
										},
									],
								};
							},
							async dispose() {},
						};
					},
				},
			],
			contextStrategy: new PassthroughContextStrategy(),
			toolPolicy: {
				async authorize() {
					return true;
				},
			},
			tokenBudget: 8_000,
			reservedOutputTokens: 1_000,
		};
		const compiled = await new FeatureCompiler({
			idGenerator: new SnapshotIdGenerator(),
		}).compile(profile, new AbortController().signal);

		const first = await resolve(compiled.snapshot);
		prompt = "dynamic-v2";
		const second = await resolve(compiled.snapshot);

		expect(first.instructions.map(({ content }) => content)).toEqual(["base", "dynamic-v1"]);
		expect(second.instructions.map(({ content }) => content)).toEqual(["base", "dynamic-v2"]);
		expect(compiled.snapshot.id).toBe("snapshot-1");
		expect(prepareCount).toBe(1);
		expect(featureContributionCount).toBe(1);
		expect(callContributionCount).toBe(2);
		expect(Object.isFrozen(second)).toBe(true);
		expect(Object.isFrozen(second.instructions)).toBe(true);
		await compiled.dispose();
	});
});

function resolve(snapshot: Parameters<typeof resolveModelCallFrame>[0]) {
	return resolveModelCallFrame(snapshot, {
		sessionId: "session-1",
		turnId: "turn-1",
		signal: new AbortController().signal,
	});
}
