import { setImmediate } from "node:timers/promises";
import type { AssistantMessage } from "@vetta/ai";
import { describe, expect, test, vi } from "vitest";
import { RetryController } from "../../src/core/session/retry-controller.js";
import type { SessionContext } from "../../src/core/session/session-context.js";

describe("RetryController", () => {
	test("cancels the owned continuation timer after backoff completes", async () => {
		const message = {
			role: "assistant",
			stopReason: "error",
			errorMessage: "503 service unavailable",
		} as AssistantMessage;
		const continueTurn = vi.fn(async () => {});
		const emit = vi.fn<SessionContext["emit"]>();
		const ctx = {
			agent: {
				state: { messages: [message] },
				replaceMessages: vi.fn(),
				continue: continueTurn,
			},
			settingsManager: {
				getRetrySettings: () => ({ enabled: true, maxRetries: 2, baseDelayMs: 1 }),
			},
			model: undefined,
			emit,
		} as unknown as SessionContext;
		const controller = new RetryController(ctx);

		await expect(controller.handleRetryableError(message)).resolves.toBe(true);
		controller.abortRetry();
		await setImmediate();

		expect(continueTurn).not.toHaveBeenCalled();
		expect(controller.retryAttempt).toBe(0);
		await expect(controller.waitForRetry()).resolves.toBeUndefined();
		expect(emit).toHaveBeenLastCalledWith({
			type: "auto_retry_end",
			success: false,
			attempt: 1,
			finalError: "Retry cancelled",
		});
	});
});
