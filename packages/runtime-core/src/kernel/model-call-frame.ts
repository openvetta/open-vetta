import type {
	ModelCallContribution,
	ModelCallContributionContext,
	ModelCallFrame,
	RuntimeSnapshot,
} from "./contracts.js";
import { featureConflictError } from "./errors.js";
import { freezeInstruction, freezeTool, ImmutableReadonlyMap } from "./runtime-values.js";

export async function resolveModelCallFrame(
	snapshot: RuntimeSnapshot,
	context: ModelCallContributionContext,
): Promise<ModelCallFrame> {
	const contributions: ModelCallContribution[] = [];
	for (const provider of snapshot.modelCallProviders ?? []) {
		context.signal.throwIfAborted();
		contributions.push(await provider.contribute(context));
	}

	const instructions = uniqueValues(
		"instruction",
		[...snapshot.instructions, ...contributions.flatMap((contribution) => contribution.instructions ?? [])],
		({ id }) => id,
	).map(freezeInstruction);
	const tools = uniqueValues(
		"tool",
		[...snapshot.tools.values(), ...contributions.flatMap((contribution) => contribution.tools ?? [])],
		({ name }) => name,
	).map(freezeTool);

	return Object.freeze({
		instructions: Object.freeze(instructions),
		tools: new ImmutableReadonlyMap(tools.map((tool) => [tool.name, tool])),
	});
}

function uniqueValues<T>(kind: string, values: readonly T[], getId: (value: T) => string): T[] {
	const byId = new Map<string, T>();
	for (const value of values) {
		const id = getId(value);
		if (byId.has(id)) {
			throw featureConflictError(`Duplicate ${kind} id: ${id}`);
		}
		byId.set(id, value);
	}
	return [...byId.values()];
}

export function composeModelCallSystemPrompt(frame: Pick<ModelCallFrame, "instructions">): string {
	return frame.instructions
		.map(({ content }) => content)
		.filter((content) => content.length > 0)
		.join("\n\n");
}
