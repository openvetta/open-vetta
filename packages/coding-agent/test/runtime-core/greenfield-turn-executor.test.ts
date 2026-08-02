import type { GreenfieldRuntimeSession } from "@vetta/runtime-core";
import { describe, expect, it, vi } from "vitest";
import {
	CodingAgentGreenfieldTurnExecutor,
	CodingAgentGreenfieldTurnRetryController,
	type CodingAgentGreenfieldTurnRetryEvent,
} from "../../src/adapters/runtime-core/greenfield.js";

describe("CodingAgentGreenfieldTurnExecutor", () => {
	it("executes an Extension command without starting a model turn", async () => {
		const prompt = vi.fn(async () => ({ status: "completed" }));
		const commandHost = {
			throwIfExtensionCommand: vi.fn(),
			tryExecute: vi.fn(async () => true),
		};
		const executor = createExecutor({ prompt, commandHost });

		await executor.prompt("/compact");

		expect(commandHost.tryExecute).toHaveBeenCalledWith("/compact");
		expect(prompt).not.toHaveBeenCalled();
	});

	it("retries a retryable failed turn through the active session continue operation", async () => {
		const events: CodingAgentGreenfieldTurnRetryEvent[] = [];
		const prompt = vi.fn(async () => ({ status: "failed", error: { message: "503 service unavailable" } }));
		const continueTurn = vi.fn(async () => ({ status: "completed" }));
		const executor = createExecutor({
			prompt,
			continueTurn,
			retry: { enabled: true, maxRetries: 1, baseDelayMs: 0 },
			onRetryEvent: (event) => events.push(event),
		});

		await executor.prompt("hello");

		expect(prompt).toHaveBeenCalledWith({ text: "hello", images: undefined, streamingBehavior: undefined });
		expect(continueTurn).toHaveBeenCalledTimes(1);
		expect(events.map((event) => event.type)).toEqual(["auto_retry_start", "auto_retry_end"]);
	});

	it("routes streaming input without treating it as an Extension command", async () => {
		const prompt = vi.fn(async () => ({ status: "completed" }));
		const commandHost = {
			throwIfExtensionCommand: vi.fn(),
			tryExecute: vi.fn(async () => false),
		};
		const executor = createExecutor({ prompt, commandHost });

		await executor.prompt("more", { streamingBehavior: "followUp" });

		expect(commandHost.throwIfExtensionCommand).toHaveBeenCalledWith("more");
		expect(commandHost.tryExecute).not.toHaveBeenCalled();
		expect(prompt).toHaveBeenCalledWith({
			text: "more",
			images: undefined,
			streamingBehavior: "followUp",
		});
	});
});

interface CreateExecutorOptions {
	readonly prompt: (input: unknown) => Promise<unknown>;
	readonly continueTurn?: () => Promise<unknown>;
	readonly commandHost?: {
		readonly throwIfExtensionCommand: (text: string) => void;
		readonly tryExecute: (text: string) => Promise<boolean>;
	};
	readonly retry?: { readonly enabled: boolean; readonly maxRetries: number; readonly baseDelayMs: number };
	readonly onRetryEvent?: (event: CodingAgentGreenfieldTurnRetryEvent) => void;
}

function createExecutor(options: CreateExecutorOptions): CodingAgentGreenfieldTurnExecutor {
	const session = {
		prompt: options.prompt,
		continue: options.continueTurn ?? (async () => ({ status: "completed" })),
	} as unknown as GreenfieldRuntimeSession;
	const retryController = new CodingAgentGreenfieldTurnRetryController({
		readSettings: () => options.retry ?? { enabled: false, maxRetries: 0, baseDelayMs: 0 },
		setEnabled: vi.fn(),
		emit: options.onRetryEvent ?? vi.fn(),
	});
	return new CodingAgentGreenfieldTurnExecutor({
		sessionHost: {
			startActiveSessionOperation: (operation) => operation(session),
		},
		retryController,
		commandHost: options.commandHost,
	});
}
