import type { RuntimeCanaryKnowledgeContract } from "./contracts.js";
import { runtimeCanarySuccessEnvelopeSchema } from "./contracts.js";

export interface RuntimeCanaryDifference {
	readonly path: string;
	readonly legacy: unknown;
	readonly greenfield: unknown;
}

export interface RuntimeCanaryAllowedDifference extends RuntimeCanaryDifference {
	readonly reason: string;
}

export interface RuntimeCanaryKnowledgeDifferential {
	readonly allowedDifferences: readonly RuntimeCanaryAllowedDifference[];
	readonly blockingDifferences: readonly RuntimeCanaryDifference[];
	readonly legacy: RuntimeCanaryKnowledgeContract;
	readonly greenfield: RuntimeCanaryKnowledgeContract;
}

export interface RuntimeCanaryDefaultCutoverDifference {
	readonly path: string;
	readonly defaultSelection: unknown;
	readonly explicitGreenfield: unknown;
}

export interface RuntimeCanaryDefaultCutoverDifferential {
	readonly blockingDifferences: readonly RuntimeCanaryDefaultCutoverDifference[];
	readonly defaultKnowledge: RuntimeCanaryKnowledgeContract;
	readonly explicitGreenfieldKnowledge: RuntimeCanaryKnowledgeContract;
}

export function compareRuntimeCanaryKnowledgeResults(
	legacyInput: unknown,
	greenfieldInput: unknown,
): RuntimeCanaryKnowledgeDifferential {
	const legacy = runtimeCanarySuccessEnvelopeSchema.parse(legacyInput);
	const greenfield = runtimeCanarySuccessEnvelopeSchema.parse(greenfieldInput);
	if (
		legacy.result.runtimeSelection !== "legacy" ||
		greenfield.result.runtimeSelection !== "greenfield" ||
		legacy.result.runtimeMode !== "legacy" ||
		greenfield.result.runtimeMode !== "greenfield"
	) {
		throw new Error("Runtime Canary differential requires Legacy first and Greenfield second");
	}
	if (
		legacy.result.processingRecordFormat !== "legacy-jsonl" ||
		greenfield.result.processingRecordFormat !== "conversation-v2-jsonl"
	) {
		throw new Error("Runtime Canary differential observed an unexpected Knowledge processing record format");
	}
	return {
		allowedDifferences: [
			{
				path: "runtimeSelection",
				legacy: legacy.result.runtimeSelection,
				greenfield: greenfield.result.runtimeSelection,
				reason: "Explicit selector identity is the canary input axis under comparison.",
			},
			{
				path: "runtimeMode",
				legacy: legacy.result.runtimeMode,
				greenfield: greenfield.result.runtimeMode,
				reason: "Runtime implementation identity is the selector axis under comparison.",
			},
			{
				path: "processingRecordFormat",
				legacy: legacy.result.processingRecordFormat,
				greenfield: greenfield.result.processingRecordFormat,
				reason:
					"Legacy and Conversation V2 use different internal session filenames; record count and lock release remain the compatibility contract.",
			},
		],
		blockingDifferences: collectDifferences(
			legacy.result.knowledgeContract,
			greenfield.result.knowledgeContract,
			"knowledgeContract",
		),
		legacy: legacy.result.knowledgeContract,
		greenfield: greenfield.result.knowledgeContract,
	};
}

export function compareRuntimeCanaryDefaultCutover(
	defaultInput: unknown,
	explicitGreenfieldInput: unknown,
): RuntimeCanaryDefaultCutoverDifferential {
	const defaultSelection = runtimeCanarySuccessEnvelopeSchema.parse(defaultInput);
	const explicitGreenfield = runtimeCanarySuccessEnvelopeSchema.parse(explicitGreenfieldInput);
	if (
		defaultSelection.result.runtimeSelection !== "default" ||
		explicitGreenfield.result.runtimeSelection !== "greenfield" ||
		explicitGreenfield.result.runtimeMode !== "greenfield" ||
		explicitGreenfield.result.processingRecordFormat !== "conversation-v2-jsonl"
	) {
		throw new Error("Runtime Canary default cutover requires Default first and explicit Greenfield second");
	}
	const differences = collectDifferences(
		{
			runtimeMode: defaultSelection.result.runtimeMode,
			processingRecordFormat: defaultSelection.result.processingRecordFormat,
			knowledgeContract: defaultSelection.result.knowledgeContract,
		},
		{
			runtimeMode: explicitGreenfield.result.runtimeMode,
			processingRecordFormat: explicitGreenfield.result.processingRecordFormat,
			knowledgeContract: explicitGreenfield.result.knowledgeContract,
		},
		"result",
	);
	return {
		blockingDifferences: differences.map((difference) => ({
			path: difference.path,
			defaultSelection: difference.legacy,
			explicitGreenfield: difference.greenfield,
		})),
		defaultKnowledge: defaultSelection.result.knowledgeContract,
		explicitGreenfieldKnowledge: explicitGreenfield.result.knowledgeContract,
	};
}

function collectDifferences(left: unknown, right: unknown, path: string): RuntimeCanaryDifference[] {
	if (Object.is(left, right)) return [];
	if (Array.isArray(left) && Array.isArray(right)) {
		const differences: RuntimeCanaryDifference[] = [];
		const length = Math.max(left.length, right.length);
		for (let index = 0; index < length; index += 1) {
			differences.push(...collectDifferences(left[index], right[index], `${path}[${index}]`));
		}
		return differences;
	}
	if (isRecord(left) && isRecord(right)) {
		const differences: RuntimeCanaryDifference[] = [];
		const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
		for (const key of [...keys].sort()) {
			differences.push(...collectDifferences(left[key], right[key], `${path}.${key}`));
		}
		return differences;
	}
	return [{ path, legacy: left, greenfield: right }];
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
