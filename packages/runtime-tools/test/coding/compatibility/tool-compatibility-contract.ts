import type { RuntimeToolResult } from "@vetta/runtime-core/kernel";
import { describe, expect, it } from "vitest";

export interface ToolCompatibilityDefinition {
	readonly name: string;
	readonly label: string;
	readonly description: string;
	readonly schema: Readonly<Record<string, unknown>>;
	readonly scopeUse: readonly string[];
	readonly category: string;
}

export interface ToolCompatibilityExecutionRequest<TInput extends object> {
	readonly input: TInput;
	readonly signal: AbortSignal;
	readonly onUpdate: (result: RuntimeToolResult) => void;
	readonly reportPhase: (label: string) => void;
}

export interface ToolCompatibilitySubject<TInput extends object> {
	readonly definition: ToolCompatibilityDefinition;
	execute(request: ToolCompatibilityExecutionRequest<TInput>): Promise<RuntimeToolResult>;
}

export interface ToolCompatibilityExecutionCase<TInput extends object> {
	readonly name: string;
	readonly input: TInput;
	readonly alreadyAborted?: boolean;
	readonly setup?: () => void;
}

export interface ToolCompatibilityContractOptions<TInput extends object> {
	readonly toolName: string;
	readonly createLegacy: () => ToolCompatibilitySubject<TInput>;
	readonly createRuntime: () => ToolCompatibilitySubject<TInput>;
	readonly executionCases: readonly ToolCompatibilityExecutionCase<TInput>[];
}

interface ObservedError {
	readonly kind: "error" | "thrown-value";
	readonly name?: string;
	readonly message?: string;
	readonly value?: unknown;
}

type ObservedExecution =
	| {
			readonly status: "fulfilled";
			readonly result: RuntimeToolResult;
			readonly updates: readonly RuntimeToolResult[];
			readonly phases: readonly string[];
	  }
	| {
			readonly status: "rejected";
			readonly error: ObservedError;
			readonly updates: readonly RuntimeToolResult[];
			readonly phases: readonly string[];
	  };

export function defineToolCompatibilityContract<TInput extends object>(
	options: ToolCompatibilityContractOptions<TInput>,
): void {
	describe(`${options.toolName} legacy compatibility`, () => {
		it("keeps the model-visible definition and registration metadata unchanged", () => {
			expect(options.createRuntime().definition).toEqual(options.createLegacy().definition);
		});

		for (const executionCase of options.executionCases) {
			it(`keeps ${executionCase.name} execution behavior unchanged`, async () => {
				executionCase.setup?.();
				const legacy = options.createLegacy();
				const runtime = options.createRuntime();

				const legacyOutcome = await observeExecution(legacy, executionCase.input, executionCase.alreadyAborted);
				const runtimeOutcome = await observeExecution(runtime, executionCase.input, executionCase.alreadyAborted);

				expect(runtimeOutcome).toEqual(legacyOutcome);
			});
		}
	});
}

async function observeExecution<TInput extends object>(
	subject: ToolCompatibilitySubject<TInput>,
	input: TInput,
	alreadyAborted = false,
): Promise<ObservedExecution> {
	const controller = new AbortController();
	if (alreadyAborted) controller.abort();
	const updates: RuntimeToolResult[] = [];
	const phases: string[] = [];

	try {
		const result = await subject.execute({
			input,
			signal: controller.signal,
			onUpdate(update) {
				updates.push(update);
			},
			reportPhase(label) {
				phases.push(label);
			},
		});
		return {
			status: "fulfilled",
			result,
			updates,
			phases,
		};
	} catch (error) {
		return {
			status: "rejected",
			error: observeError(error),
			updates,
			phases,
		};
	}
}

function observeError(error: unknown): ObservedError {
	if (error instanceof Error) {
		return {
			kind: "error",
			name: error.name,
			message: error.message,
		};
	}
	return {
		kind: "thrown-value",
		value: error,
	};
}
